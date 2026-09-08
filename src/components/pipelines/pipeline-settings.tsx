"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import type { Pipeline, PipelineStage } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Trash2,
  Plus,
  GripVertical,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  generateLeadIntegrationToken,
  hashLeadIntegrationToken,
} from "@/lib/integrations/lead-token";

const STAGE_COLORS = [
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
];

interface PipelineSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline;
  stages: PipelineStage[];
  onPipelinesChanged: () => void;
  onStagesChanged: () => void;
  onCreateNewPipeline: () => void;
}

export function PipelineSettings({
  open,
  onOpenChange,
  pipeline,
  stages,
  onPipelinesChanged,
  onStagesChanged,
  onCreateNewPipeline,
}: PipelineSettingsProps) {
  const t = useTranslations("Pipelines.settings");
  const supabase = createClient();

  const [name, setName] = useState(pipeline.name);
  const [localStages, setLocalStages] = useState<PipelineStage[]>(stages);
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState(STAGE_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leadIntegration, setLeadIntegration] = useState<{
    id: string;
    is_active: boolean;
  } | null>(null);
  const [updatingIntegration, setUpdatingIntegration] = useState(false);
  const [regeneratedWebhookUrl, setRegeneratedWebhookUrl] = useState<string | null>(null);
  const [integrationEvents, setIntegrationEvents] = useState<Array<{
    id: string;
    status: string;
    external_event_id: string | null;
    error_message: string | null;
    received_at: string;
  }>>([]);

  // Reset form state when the dialog opens or its prop inputs change
  // — legitimate prop-driven sync.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setName(pipeline.name);
    setLocalStages([...stages].sort((a, b) => a.position - b.position));
    setShowDeleteConfirm(false);
    setLeadIntegration(null);
    setIntegrationEvents([]);
    if (pipeline.pipeline_type === "integrated") {
      void supabase
        .from("lead_integrations")
        .select("id, is_active")
        .eq("pipeline_id", pipeline.id)
        .maybeSingle()
        .then(({ data }) => {
          const integration = (data as unknown as { id: string; is_active: boolean } | null) ?? null;
          setLeadIntegration(integration);
          if (!integration) return;
          void supabase
            .from("lead_integration_events")
            .select("id, status, external_event_id, error_message, received_at")
            .eq("integration_id", integration.id)
            .order("received_at", { ascending: false })
            .limit(8)
            .then(({ data: events }) => {
              setIntegrationEvents((events as unknown as typeof integrationEvents) ?? []);
            });
        });
    }
  }, [open, pipeline, stages, supabase]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleReorder(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localStages.findIndex((s) => s.id === active.id);
    const newIndex = localStages.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    if (
      pipeline.pipeline_type === "integrated" &&
      (localStages[oldIndex].name === "Novo Lead" || localStages[newIndex].name === "Novo Lead")
    ) return;
    setLocalStages(arrayMove(localStages, oldIndex, newIndex));
  }

  async function handleSave() {
    setSaving(true);

    // One upsert for all stages — batches N stage writes into a single
    // round-trip. Previous implementation did N sequential UPDATEs which
    // latency-scaled linearly with stage count.
    const stageRows = localStages.map((s, i) => ({
      id: s.id,
      pipeline_id: s.pipeline_id,
      name: s.name,
      color: s.color,
      position: i,
    }));

    const [renameRes, stagesRes] = await Promise.all([
      supabase
        .from("pipelines")
        .update({ name: name.trim() })
        .eq("id", pipeline.id),
      supabase.from("pipeline_stages").upsert(stageRows, { onConflict: "id" }),
    ]);

    setSaving(false);

    if (renameRes.error || stagesRes.error) {
      toast.error(t("toastFailedSave"));
      return;
    }

    onOpenChange(false);
    onPipelinesChanged();
    onStagesChanged();
    toast.success(t("toastSaved"));
  }

  async function handleAddStage() {
    const trimmed = newStageName.trim();
    if (!trimmed) return;
    const { data, error } = await supabase
      .from("pipeline_stages")
      .insert({
        pipeline_id: pipeline.id,
        name: trimmed,
        color: newStageColor,
        position: localStages.length,
      })
      .select()
      .single();
    if (error || !data) {
      toast.error(t("toastFailedAddStage"));
      return;
    }
    setLocalStages([...localStages, data as PipelineStage]);
    setNewStageName("");
    setNewStageColor(STAGE_COLORS[(localStages.length + 1) % STAGE_COLORS.length]);
  }

  async function handleRemoveStage(stageId: string) {
    if (
      pipeline.pipeline_type === "integrated" &&
      localStages.some((stage) => stage.id === stageId && stage.name === "Novo Lead")
    ) {
      toast.error("O estágio Novo Lead é obrigatório nesta pipeline integrada.");
      return;
    }
    // Refuse to delete if deals still reference the stage (FK would fail).
    const { count } = await supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", stageId);
    if (count && count > 0) {
      toast.error(t("toastMoveOrDeleteDeals"));
      return;
    }
    const { error } = await supabase
      .from("pipeline_stages")
      .delete()
      .eq("id", stageId);
    if (error) {
      toast.error(t("toastFailedDeleteStage"));
      return;
    }
    setLocalStages(localStages.filter((s) => s.id !== stageId));
  }

  async function handleDeletePipeline() {
    if (leadIntegration?.is_active) {
      toast.error("Desative o webhook antes de excluir esta pipeline.");
      return;
    }
    setDeleting(true);
    // ON DELETE CASCADE handles deals + stages.
    const { error } = await supabase
      .from("pipelines")
      .delete()
      .eq("id", pipeline.id);
    setDeleting(false);
    if (error) {
      toast.error(t("toastFailedDeletePipeline"));
      return;
    }
    onOpenChange(false);
    onPipelinesChanged();
    toast.success(t("toastDeleted"));
  }

  async function handleDeactivateIntegration() {
    if (!leadIntegration) return;
    setUpdatingIntegration(true);
    const { error } = await supabase
      .from("lead_integrations")
      .update({ is_active: false })
      .eq("id", leadIntegration.id);
    setUpdatingIntegration(false);
    if (error) {
      toast.error("Não foi possível desativar o webhook.");
      return;
    }
    setLeadIntegration({ ...leadIntegration, is_active: false });
    toast.success("Webhook desativado");
  }

  async function handleRegenerateWebhook() {
    if (!leadIntegration) return;
    setUpdatingIntegration(true);
    const token = generateLeadIntegrationToken();
    const tokenHash = await hashLeadIntegrationToken(token);
    const { error } = await supabase
      .from("lead_integrations")
      .update({ token_hash: tokenHash, token_prefix: token.slice(0, 11) })
      .eq("id", leadIntegration.id);
    setUpdatingIntegration(false);
    if (error) {
      toast.error("Não foi possível regenerar o webhook.");
      return;
    }
    setRegeneratedWebhookUrl(
      `${window.location.origin}/api/integrations/elementor/${pipeline.id}/${token}`,
    );
    toast.success("Webhook regenerado");
  }

  async function handleRetryEvent(eventId: string) {
    const response = await fetch(`/api/integrations/elementor/events/${eventId}/retry`, {
      method: "POST",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(result?.error || "Não foi possível reprocessar o evento.");
      return;
    }
    setIntegrationEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? { ...event, status: "processed", error_message: null }
          : event,
      ),
    );
    toast.success("Evento reprocessado");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-popover border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">{t("managePipeline")}</DialogTitle>
        </DialogHeader>

        {showDeleteConfirm ? (
          <div className="py-4">
            <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
              <div>
                <p className="text-sm font-medium text-red-400">
                  {t("deletePipeline")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("deletePipelineDesc")}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                className="border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleDeletePipeline}
                disabled={deleting}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deleting ? t("deleting") : t("deletePipelineBtn")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 py-2">
              {leadIntegration && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <p className="text-sm font-medium text-foreground">Integração Elementor</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Webhook: {leadIntegration.is_active ? "ativo" : "desativado"}
                  </p>
                  {leadIntegration.is_active && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDeactivateIntegration}
                        disabled={updatingIntegration}
                        className="border-border bg-transparent text-muted-foreground hover:bg-muted"
                      >
                        {updatingIntegration ? "Desativando..." : "Desativar webhook"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRegenerateWebhook}
                        disabled={updatingIntegration}
                        className="border-border bg-transparent text-muted-foreground hover:bg-muted"
                      >
                        Regenerar URL
                      </Button>
                    </div>
                  )}
                  {integrationEvents.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <p className="text-xs font-medium text-muted-foreground">Últimos recebimentos</p>
                      {integrationEvents.map((event) => (
                        <div key={event.id} className="rounded border border-border bg-background p-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">{event.status}</span>
                            <span className="text-muted-foreground">{new Date(event.received_at).toLocaleString()}</span>
                          </div>
                          {event.external_event_id && (
                            <p className="mt-1 truncate text-muted-foreground">ID: {event.external_event_id}</p>
                          )}
                          {event.error_message && (
                            <p className="mt-1 text-red-400">{event.error_message}</p>
                          )}
                          {event.status === "failed" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetryEvent(event.id)}
                              className="mt-2 h-7 border-border bg-transparent text-xs text-muted-foreground hover:bg-muted"
                            >
                              Reprocessar
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("pipelineName")}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="border-border bg-muted text-foreground"
                />
              </div>

              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("stages")}</Label>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleReorder}
                >
                  <SortableContext
                    items={localStages.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {localStages.map((stage, index) => (
                        <SortableStageRow
                          key={stage.id}
                          stage={stage}
                          onNameChange={(v) => {
                            const updated = [...localStages];
                            updated[index] = { ...updated[index], name: v };
                            setLocalStages(updated);
                          }}
                          onColorChange={(v) => {
                            const updated = [...localStages];
                            updated[index] = { ...updated[index], color: v };
                            setLocalStages(updated);
                          }}
                          onRemove={() => handleRemoveStage(stage.id)}
                          locked={pipeline.pipeline_type === "integrated" && stage.name === "Novo Lead"}
                          colors={STAGE_COLORS}
                          t={t}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                {/* Add new stage */}
                <div className="mt-1 flex flex-wrap gap-1">
                  {STAGE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewStageColor(color)}
                      className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: color,
                        borderColor:
                          newStageColor === color
                            ? "var(--foreground)"
                            : "transparent",
                      }}
                      aria-label={`Pick color ${color}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    placeholder={t("newStageNamePlaceholder")}
                    className="border-border bg-muted text-sm text-foreground"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddStage();
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddStage}
                    disabled={!newStageName.trim()}
                    className="shrink-0 border-border bg-transparent text-muted-foreground hover:bg-muted"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    {t("add")}
                  </Button>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={onCreateNewPipeline}
                className="w-full border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                <Plus className="mr-1 h-3 w-3" />
                {t("createNewPipeline")}
              </Button>
            </div>

            <DialogFooter className="border-border bg-popover/50">
              <Button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={leadIntegration?.is_active === true}
                className="mr-auto bg-red-600 text-white hover:bg-red-700"
              >
                {t("deletePipeline")}
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? t("saving") : t("saveChanges")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
      <Dialog
        open={regeneratedWebhookUrl !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setRegeneratedWebhookUrl(null);
        }}
      >
        <DialogContent className="sm:max-w-lg border-border bg-popover">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Novo webhook gerado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A URL anterior foi invalidada. Copie esta URL agora; ela não será exibida novamente.
          </p>
          <div className="rounded-lg border border-border bg-muted p-3">
            <code className="break-all text-xs text-foreground">{regeneratedWebhookUrl}</code>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                if (regeneratedWebhookUrl) navigator.clipboard.writeText(regeneratedWebhookUrl);
                toast.success("Webhook copiado");
              }}
            >
              Copiar URL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function SortableStageRow({
  stage,
  onNameChange,
  onColorChange,
  onRemove,
  locked,
  colors,
  t,
}: {
  stage: PipelineStage;
  onNameChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onRemove: () => void;
  locked: boolean;
  colors: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id, disabled: locked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={locked}
        className={`touch-none text-muted-foreground ${locked ? "cursor-not-allowed opacity-40" : "cursor-grab hover:text-foreground active:cursor-grabbing"}`}
        aria-label={t("dragToReorder")}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <ColorSwatch value={stage.color} onChange={onColorChange} colors={colors} t={t} disabled={locked} />
      <Input
        value={stage.name}
        onChange={(e) => onNameChange(e.target.value)}
        disabled={locked}
        className="h-7 flex-1 border-transparent bg-transparent text-sm text-foreground focus:border-border"
      />
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        disabled={locked}
        className="text-muted-foreground hover:text-red-400"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function ColorSwatch({
  value,
  onChange,
  colors,
  disabled,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  colors: string[];
  disabled: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="h-4 w-4 rounded-full border border-border disabled:cursor-not-allowed disabled:opacity-40"
        style={{ backgroundColor: value }}
        aria-label={t("changeColor")}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-6 z-20 flex flex-wrap gap-1 rounded-lg border border-border bg-popover p-2 shadow-lg w-36">
            {!disabled && colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor:
                    c === value ? "var(--foreground)" : "transparent",
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
