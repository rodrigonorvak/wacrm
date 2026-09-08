"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Pipeline, PipelineStage, Deal } from "@/types";
import { PipelineBoard } from "@/components/pipelines/pipeline-board";
import { PipelineSettings } from "@/components/pipelines/pipeline-settings";
import { DealForm } from "@/components/pipelines/deal-form";
import { PipelineAnalytics } from "@/components/pipelines/pipeline-analytics";
import { IntegratedLeadDetail } from "@/components/pipelines/integrated-lead-detail";
import {
  generateLeadIntegrationToken,
  hashLeadIntegrationToken,
} from "@/lib/integrations/lead-token";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GitBranch, Plus, ChevronDown, Settings, Copy } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/hooks/use-can";
import { useAuth } from "@/hooks/use-auth";
import { GatedButton } from "@/components/ui/gated-button";
import { useTranslations } from "next-intl";

// Pipeline creation is admin-class (settings-tier write under
// the new RLS); deal creation is operational and only requires
// agent+. The two CTAs gate on different `useCan` capabilities,
// not on different copy.

// Spec-defined seed — name and color per the product spec.
const SPEC_DEFAULT_STAGES = [
  { name: "New Lead", color: "#3b82f6", position: 0 }, // blue
  { name: "Qualified", color: "#eab308", position: 1 }, // yellow
  { name: "Proposal Sent", color: "#f97316", position: 2 }, // orange
  { name: "Negotiation", color: "#8b5cf6", position: 3 }, // purple
  { name: "Won", color: "#22c55e", position: 4 }, // green
];

const INTEGRATED_DEFAULT_STAGES = [
  { name: "Novo Lead", color: "#3b82f6", position: 0 },
  { name: "Prospecção iniciada", color: "#eab308", position: 1 },
  { name: "Reunião", color: "#f97316", position: 2 },
  { name: "Contrato a ser assinado", color: "#8b5cf6", position: 3 },
  { name: "Contrato pago", color: "#22c55e", position: 4 },
];

const ELEMENTOR_MAPPING_FIELDS = [
  { key: "name", label: "Nome", targetType: "contact", targetKey: "name", required: true },
  { key: "phone", label: "Telefone", targetType: "contact", targetKey: "phone", required: true },
  { key: "email", label: "E-mail", targetType: "contact", targetKey: "email", required: false },
  { key: "company", label: "Empresa", targetType: "contact", targetKey: "company", required: false },
  { key: "message", label: "Mensagem", targetType: "deal", targetKey: "notes", required: false },
] as const;

export default function PipelinesPage() {
  const t = useTranslations("Pipelines.page");
  const supabase = createClient();
  const canEditSettings = useCan("edit-settings");
  const canCreateDeals = useCan("send-messages");
  const { accountId } = useAuth();

  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog / sheet state
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newPipelineType, setNewPipelineType] = useState<"standard" | "integrated">("standard");
  const [creating, setCreating] = useState(false);
  const [createdWebhookUrl, setCreatedWebhookUrl] = useState<string | null>(null);
  const [elementorFieldIds, setElementorFieldIds] = useState<Record<string, string>>({
    name: "name",
    phone: "phone",
    email: "email",
    company: "company",
    message: "message",
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Deal form state is lifted here so both the top-bar "Add Deal" and
  // the per-column "+" trigger the same Sheet.
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [leadDetailDeal, setLeadDetailDeal] = useState<Deal | null>(null);
  const [defaultStageId, setDefaultStageId] = useState<string>("");

  // Guard against double-seeding (React StrictMode double-effect in dev).
  const seedAttempted = useRef(false);

  const loadPipelines = useCallback(async () => {
    const { data, error } = await supabase
      .from("pipelines")
      .select("*")
      .order("created_at");
    if (error) {
      console.error("Failed to load pipelines:", error.message);
      return [];
    }
    return data ?? [];
  }, [supabase]);

  const loadStages = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position");
      return data ?? [];
    },
    [supabase],
  );

  const loadDeals = useCallback(
    async (pipelineId: string) => {
      const { data } = await supabase
        .from("deals")
        .select("*, contact:contacts(*), assignee:profiles!deals_assigned_to_fkey(*)")
        .eq("pipeline_id", pipelineId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Deal[];
    },
    [supabase],
  );

  const seedDefaultPipeline = useCallback(async (): Promise<Pipeline | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return null;
    // pipelines.account_id is NOT NULL post-017 with no DB default.
    if (!accountId) return null;

    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({ user_id: user.id, account_id: accountId, name: "Sales Pipeline" })
      .select()
      .single();

    if (error || !pipeline) {
      console.error("Failed to seed pipeline:", error?.message);
      return null;
    }

    const stagesPayload = SPEC_DEFAULT_STAGES.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      position: s.position,
    }));
    await supabase.from("pipeline_stages").insert(stagesPayload);

    return pipeline as Pipeline;
  }, [supabase, accountId]);

  // Initial load + seed-if-empty
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let list = await loadPipelines();

      if (list.length === 0 && !seedAttempted.current) {
        seedAttempted.current = true;
        const seeded = await seedDefaultPipeline();
        if (seeded) list = await loadPipelines();
      }

      if (cancelled) return;
      setPipelines(list);
      if (list.length > 0) {
        setSelectedPipelineId((prev) =>
          prev && list.some((p) => p.id === prev) ? prev : list[0].id,
        );
      } else {
        setSelectedPipelineId("");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadPipelines, seedDefaultPipeline]);

  // Load stages + deals whenever selected pipeline changes.
  // Clearing on no-selection is a legitimate sync with URL/prop
  // state; the load completion uses async setters inside promise
  // callbacks (not synchronous in the effect body).
  useEffect(() => {
    if (!selectedPipelineId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStages([]);
      setDeals([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const [s, d] = await Promise.all([
        loadStages(selectedPipelineId),
        loadDeals(selectedPipelineId),
      ]);
      if (cancelled) return;
      setStages(s);
      setDeals(d);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPipelineId, loadStages, loadDeals]);

  const refreshPipelines = useCallback(async () => {
    const list = await loadPipelines();
    setPipelines(list);
    if (list.length === 0) setSelectedPipelineId("");
    else if (!list.some((p) => p.id === selectedPipelineId))
      setSelectedPipelineId(list[0].id);
  }, [loadPipelines, selectedPipelineId]);

  const refreshStages = useCallback(async () => {
    if (!selectedPipelineId) return;
    setStages(await loadStages(selectedPipelineId));
  }, [loadStages, selectedPipelineId]);

  const refreshDeals = useCallback(async () => {
    if (!selectedPipelineId) return;
    setDeals(await loadDeals(selectedPipelineId));
  }, [loadDeals, selectedPipelineId]);

  const handleDealMoved = useCallback(
    async (dealId: string, newStageId: string) => {
      // Optimistic update — board already animated; just persist.
      setDeals((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, stage_id: newStageId } : d)),
      );
      const { error } = await supabase
        .from("deals")
        .update({ stage_id: newStageId })
        .eq("id", dealId);
      if (error) {
        toast.error(t("toastFailedMoveDeal"));
        refreshDeals();
      }
    },
    [supabase, refreshDeals, t],
  );

  const handleAddDeal = useCallback(
    (stageId?: string) => {
      setEditingDeal(null);
      setDefaultStageId(stageId ?? stages[0]?.id ?? "");
      setDealFormOpen(true);
    },
    [stages],
  );

  const handleEditDeal = useCallback((deal: Deal) => {
    const pipeline = pipelines.find((item) => item.id === deal.pipeline_id);
    if (pipeline?.pipeline_type === "integrated") {
      setLeadDetailDeal(deal);
      return;
    }
    setEditingDeal(deal);
    setDefaultStageId(deal.stage_id);
    setDealFormOpen(true);
  }, [pipelines]);

  const handleIntegratedTemplateSent = useCallback(
    async (dealId: string) => {
      const prospectingStage = stages.find(
        (stage) => stage.name === "Prospecção iniciada",
      );
      if (!prospectingStage) return;

      setDeals((current) =>
        current.map((deal) =>
          deal.id === dealId
            ? { ...deal, stage_id: prospectingStage.id, stage: prospectingStage }
            : deal,
        ),
      );
      const { error } = await supabase
        .from("deals")
        .update({ stage_id: prospectingStage.id })
        .eq("id", dealId);
      if (error) refreshDeals();
    },
    [stages, supabase, refreshDeals],
  );

  async function handleCreatePipeline() {
    const name = newPipelineName.trim();
    if (!name) return;
    if (
      newPipelineType === "integrated" &&
      (!elementorFieldIds.name.trim() || !elementorFieldIds.phone.trim())
    ) {
      toast.error("Informe os IDs dos campos de nome e telefone do Elementor.");
      return;
    }
    setCreating(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setCreating(false);
      return;
    }
    // pipelines.account_id is NOT NULL post-017 with no DB default.
    if (!accountId) {
      toast.error(t("toastNotLinkedToAccount"));
      setCreating(false);
      return;
    }

    const { data: pipeline, error } = await supabase
      .from("pipelines")
      .insert({
        user_id: user.id,
        account_id: accountId,
        name,
        pipeline_type: newPipelineType,
      })
      .select()
      .single();

    if (error || !pipeline) {
      toast.error(t("toastFailedCreatePipeline"));
      setCreating(false);
      return;
    }

    const defaultStages = newPipelineType === "integrated"
      ? INTEGRATED_DEFAULT_STAGES
      : SPEC_DEFAULT_STAGES;
    const stagesPayload = defaultStages.map((s) => ({
      pipeline_id: pipeline.id,
      name: s.name,
      color: s.color,
      position: s.position,
    }));
    const { error: stagesError } = await supabase
      .from("pipeline_stages")
      .insert(stagesPayload);
    if (stagesError) {
      await supabase.from("pipelines").delete().eq("id", pipeline.id);
      toast.error(t("toastFailedCreatePipeline"));
      setCreating(false);
      return;
    }

    if (newPipelineType === "integrated") {
      const token = generateLeadIntegrationToken();
      const tokenHash = await hashLeadIntegrationToken(token);
      const { data: integration, error: integrationError } = await supabase
        .from("lead_integrations")
        .insert({
          account_id: accountId,
          pipeline_id: pipeline.id,
          provider: "elementor",
          name: `${name} - Elementor`,
          token_hash: tokenHash,
          token_prefix: token.slice(0, 11),
          created_by: user.id,
        });
      if (integrationError || !integration) {
        await supabase.from("pipelines").delete().eq("id", pipeline.id);
        toast.error(t("toastFailedCreatePipeline"));
        setCreating(false);
        return;
      }
      const integrationId = (integration as unknown as { id: string }).id;

      const mappingRows = ELEMENTOR_MAPPING_FIELDS
        .filter((field) => elementorFieldIds[field.key]?.trim())
        .map((field) => ({
          integration_id: integrationId,
          source_field_id: elementorFieldIds[field.key].trim(),
          source_label: field.label,
          target_type: field.targetType,
          target_key: field.targetKey,
          is_required: field.required,
        }));
      const { error: mappingsError } = await supabase
        .from("lead_integration_mappings")
        .insert(mappingRows);
      if (mappingsError) {
        await supabase.from("pipelines").delete().eq("id", pipeline.id);
        toast.error(t("toastFailedCreatePipeline"));
        setCreating(false);
        return;
      }
      setCreatedWebhookUrl(
        `${window.location.origin}/api/integrations/elementor/${pipeline.id}/${token}`,
      );
    }

    setNewPipelineName("");
    setNewPipelineType("standard");
    setNewPipelineOpen(false);
    setSelectedPipelineId(pipeline.id);
    await refreshPipelines();
    setCreating(false);
    toast.success(t("toastPipelineCreated"));
  }

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-96 w-72 animate-pulse rounded-xl bg-muted/50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Pipeline selector dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors data-[popup-open]:bg-muted"
            >
              <GitBranch className="h-4 w-4 text-primary" />
              <span className="font-semibold">
                {selectedPipeline?.name ?? t("selectPipeline")}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64 border-border bg-popover text-popover-foreground"
            >
              {pipelines.length === 0 && (
                <DropdownMenuItem disabled className="text-muted-foreground">
                  {t("noPipelinesYet")}
                </DropdownMenuItem>
              )}
              {pipelines.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => setSelectedPipelineId(p.id)}
                  className={
                    p.id === selectedPipelineId
                      ? "text-primary"
                      : "text-popover-foreground"
                  }
                >
                  <GitBranch className="mr-2 h-3.5 w-3.5" />
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border" />
              {selectedPipeline && (
                <DropdownMenuItem
                  onClick={() => setSettingsOpen(true)}
                  className="text-popover-foreground"
                >
                  <Settings className="mr-2 h-3.5 w-3.5" />
                  {t("managePipelines")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <GatedButton
            variant="outline"
            canAct={canEditSettings}
            gateReason="create pipelines"
            onClick={() => {
              setNewPipelineType("standard");
              setNewPipelineOpen(true);
            }}
            className="border-border bg-card text-foreground hover:bg-muted"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("addPipeline")}
          </GatedButton>
          <GatedButton
            variant="outline"
            canAct={canEditSettings}
            gateReason="create integrated pipelines"
            onClick={() => {
              setNewPipelineType("integrated");
              setNewPipelineOpen(true);
            }}
            className="border-primary/40 bg-card text-primary hover:bg-primary/10"
          >
            <Plus className="mr-1 h-4 w-4" />
            Pipeline integrada
          </GatedButton>
          <GatedButton
            canAct={canCreateDeals}
            gateReason="create deals"
            disabled={!selectedPipelineId || stages.length === 0}
            onClick={() => handleAddDeal()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("addDeal")}
          </GatedButton>
        </div>
      </div>

      {/* Board */}
      {pipelines.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <GitBranch className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium text-foreground">
            {t("noPipelinesYet")}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("createToStartTracking")}
          </p>
          <GatedButton
            canAct={canEditSettings}
            gateReason="create pipelines"
            onClick={() => {
              setNewPipelineType("standard");
              setNewPipelineOpen(true);
            }}
            className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("createPipeline")}
          </GatedButton>
        </div>
      ) : (
        <>
          <PipelineAnalytics stages={stages} deals={deals} />
          <PipelineBoard
            stages={stages}
            deals={deals}
            onDealMoved={handleDealMoved}
            onAddDeal={handleAddDeal}
            onEditDeal={handleEditDeal}
          />
        </>
      )}

      {/* New Pipeline Dialog */}
      <Dialog open={newPipelineOpen} onOpenChange={setNewPipelineOpen}>
        <DialogContent className="sm:max-w-sm bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t("newPipeline")}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <div className="mb-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={newPipelineType === "standard" ? "default" : "outline"}
                onClick={() => setNewPipelineType("standard")}
              >
                Pipeline padrão
              </Button>
              <Button
                type="button"
                variant={newPipelineType === "integrated" ? "default" : "outline"}
                onClick={() => setNewPipelineType("integrated")}
              >
                Pipeline integrada
              </Button>
            </div>
            <Label className="text-muted-foreground">{t("pipelineName")}</Label>
            <Input
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder={t("pipelineNamePlaceholder")}
              className="mt-2 bg-muted border-border text-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreatePipeline();
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {newPipelineType === "integrated"
                ? "Cria Novo Lead, Prospecção iniciada, Reunião, Contrato a ser assinado e Contrato pago."
                : t("defaultStagesDesc")}
            </p>
            {newPipelineType === "integrated" && (
              <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/40 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">IDs dos campos do Elementor</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use o Field ID configurado em cada campo do formulário. Esses valores podem ser alterados depois.
                  </p>
                </div>
                {ELEMENTOR_MAPPING_FIELDS.map((field) => (
                  <div key={field.key} className="grid grid-cols-[1fr_1.2fr] items-center gap-3">
                    <Label className="text-xs text-muted-foreground">
                      {field.label}{field.required ? " *" : ""}
                    </Label>
                    <Input
                      value={elementorFieldIds[field.key] ?? ""}
                      onChange={(event) =>
                        setElementorFieldIds((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      placeholder={field.key}
                      className="h-8 bg-background border-border text-foreground"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="bg-popover/50 border-border">
            <Button
              variant="outline"
              onClick={() => setNewPipelineOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleCreatePipeline}
              disabled={creating || !newPipelineName.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {creating ? t("creating") : t("createPipelineBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createdWebhookUrl !== null}
        onOpenChange={(open) => {
          if (!open) setCreatedWebhookUrl(null);
        }}
      >
        <DialogContent className="sm:max-w-lg bg-popover border-border">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              Pipeline integrada criada
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Copie esta URL e use-a na ação Webhook do formulário do Elementor. Ela não será exibida novamente.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-3">
            <code className="min-w-0 flex-1 break-all text-xs text-foreground">
              {createdWebhookUrl}
            </code>
            <Button
              type="button"
              size="icon"
              variant="outline"
              title="Copiar webhook"
              onClick={() => {
                if (createdWebhookUrl) navigator.clipboard.writeText(createdWebhookUrl);
                toast.success("Webhook copiado");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pipeline Settings */}
      {selectedPipeline && (
        <PipelineSettings
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          pipeline={selectedPipeline}
          stages={stages}
          onPipelinesChanged={refreshPipelines}
          onStagesChanged={refreshStages}
          onCreateNewPipeline={() => {
            setSettingsOpen(false);
            setNewPipelineOpen(true);
          }}
        />
      )}

      {/* Deal Form (Sheet) */}
      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        deal={editingDeal}
        pipelineId={selectedPipelineId}
        stages={stages}
        defaultStageId={defaultStageId}
        onSaved={refreshDeals}
      />

      <IntegratedLeadDetail
        open={leadDetailDeal !== null}
        onOpenChange={(open) => {
          if (!open) setLeadDetailDeal(null);
        }}
        deal={leadDetailDeal}
        onTemplateSent={handleIntegratedTemplateSent}
      />
    </div>
  );
}
