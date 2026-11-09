"use client";

import { useEffect, useState } from "react";
import { CircleCheck, Plus, Tag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { createClient } from "@/lib/supabase/client";
import { isPaidStageName } from "@/lib/pipelines/paid-stage";
import type { DealLabel, PipelineStage } from "@/types";
import { DealLabelsDialog } from "@/components/pipelines/deal-labels-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface InboxDeal {
  id: string;
  title: string;
  pipeline_id: string;
  stage_id: string;
  value: number;
  stage: PipelineStage | null;
  labels: DealLabel[];
}

interface InboxLeadActionsProps {
  contactId: string;
  onDealUpdated?: () => void;
}

type Action = "labels" | "stage";
type DealRow = Omit<InboxDeal, "labels"> & {
  deal_label_links?: { label: DealLabel | null }[];
};

export function InboxLeadActions({ contactId, onDealUpdated }: InboxLeadActionsProps) {
  const t = useTranslations("Inbox.leadActions");
  const { accountId } = useAuth();
  const canEdit = useCan("send-messages");
  const [deals, setDeals] = useState<InboxDeal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [dealSelectorOpen, setDealSelectorOpen] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState("");
  const [labelsDialogOpen, setLabelsDialogOpen] = useState(false);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [savingStage, setSavingStage] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      try {
        const { data, error } = await supabase
          .from("deals")
          .select("id, title, pipeline_id, stage_id, value, stage:pipeline_stages(*), deal_label_links(label:deal_labels(*))")
          .eq("account_id", accountId)
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false });
        if (cancelled) return;
        if (error) {
          console.error("[inbox-lead-actions] failed to load contact deals:", error.message);
          toast.error(t("loadDealsError"));
          setDeals([]);
        } else {
          setDeals(((data ?? []) as unknown as DealRow[]).map(({ deal_label_links, ...deal }) => ({
            ...deal,
            labels: (deal_label_links ?? []).flatMap((link) => link.label ? [link.label] : []),
          })));
        }
      } catch (error) {
        if (cancelled) return;
        console.error("[inbox-lead-actions] failed to load contact deals:", error);
        toast.error(t("loadDealsError"));
        setDeals([]);
      } finally {
        if (!cancelled) setLoadingDeals(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, contactId, t]);

  const selectedDeal = deals.find((deal) => deal.id === selectedDealId) ?? null;
  const selectedStage = stages.find((stage) => stage.id === selectedStageId);

  async function beginAction(action: Action, deal: InboxDeal) {
    setSelectedDealId(deal.id);
    setPendingAction(null);
    if (action === "labels") {
      setLabelsDialogOpen(true);
      return;
    }

    setSelectedStageId(deal.stage_id);
    setPaidAmount(String(deal.value ?? ""));
    setStagesLoading(true);
    try {
      const { data, error } = await createClient()
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", deal.pipeline_id)
        .order("position");
      if (error) {
        console.error("[inbox-lead-actions] failed to load pipeline stages:", error.message);
        toast.error(t("loadStagesError"));
        return;
      }
      setStages((data ?? []) as PipelineStage[]);
      setStageDialogOpen(true);
    } catch (error) {
      console.error("[inbox-lead-actions] failed to load pipeline stages:", error);
      toast.error(t("loadStagesError"));
    } finally {
      setStagesLoading(false);
    }
  }

  function chooseAction(action: Action) {
    setExpanded(false);
    if (!canEdit) return;
    if (deals.length === 0) {
      toast.error(t("noDeals"));
      return;
    }
    if (deals.length === 1) {
      void beginAction(action, deals[0]);
      return;
    }
    setPendingAction(action);
    setSelectedDealId(deals[0].id);
    setDealSelectorOpen(true);
  }

  async function saveStage() {
    if (!selectedDeal || !selectedStageId || savingStage) return;
    const requiresAmount = isPaidStageName(selectedStage?.name);
    const amount = Number(paidAmount);
    if (requiresAmount && !(amount > 0)) {
      toast.error(t("paidAmountRequired"));
      return;
    }

    setSavingStage(true);
    try {
      const response = await fetch(`/api/deals/${selectedDeal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: selectedStageId,
          ...(requiresAmount ? { value: amount, currency: "BRL" } : {}),
        }),
      });
      if (!response.ok) {
        toast.error(t("stageUpdateError"));
        return;
      }

      setDeals((current) => current.map((deal) => deal.id === selectedDeal.id
        ? {
            ...deal,
            stage_id: selectedStageId,
            stage: selectedStage ?? deal.stage,
            ...(requiresAmount ? { value: amount } : {}),
          }
        : deal,
      ));
      onDealUpdated?.();
      setStageDialogOpen(false);
      toast.success(t("stageUpdated"));
    } catch (error) {
      console.error("[inbox-lead-actions] failed to update deal stage:", error);
      toast.error(t("stageUpdateError"));
    } finally {
      setSavingStage(false);
    }
  }

  if (loadingDeals || deals.length === 0) return null;

  return (
    <>
      <div className="absolute bottom-24 right-4 z-40 flex flex-col items-end gap-2">
        {expanded && (
          <nav aria-label={t("actionsTitle")} className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => chooseAction("stage")}
              disabled={!canEdit}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-background px-3.5 text-sm font-semibold text-foreground shadow-md hover:bg-muted disabled:opacity-45"
            >
              <span>{t("changeStage")}</span>
              <CircleCheck className="size-4 text-emerald-600" />
            </button>
            <button
              type="button"
              onClick={() => chooseAction("labels")}
              disabled={!canEdit}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-background px-3.5 text-sm font-semibold text-foreground shadow-md hover:bg-muted disabled:opacity-45"
            >
              <span>{t("editLabels")}</span>
              <Tag className="size-4 text-pink-600" />
            </button>
          </nav>
        )}
        <button
          type="button"
          aria-label={expanded ? t("closeActions") : t("openActions")}
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:bg-primary/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {expanded ? <X className="size-5" /> : <Plus className="size-5" />}
        </button>
      </div>

      <Dialog open={dealSelectorOpen} onOpenChange={setDealSelectorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("chooseLeadTitle")}</DialogTitle>
            <DialogDescription>{t("chooseLeadDescription")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="inbox-lead-action-deal">{t("lead")}</Label>
            <select
              id="inbox-lead-action-deal"
              value={selectedDealId}
              onChange={(event) => setSelectedDealId(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>
                  {deal.title}{deal.stage?.name ? ` — ${deal.stage.name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDealSelectorOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              disabled={!pendingAction || !selectedDeal}
              onClick={() => {
                if (!pendingAction || !selectedDeal) return;
                setDealSelectorOpen(false);
                void beginAction(pendingAction, selectedDeal);
              }}
            >
              {t("continue")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("stageTitle")}</DialogTitle>
            <DialogDescription>{selectedDeal?.title}</DialogDescription>
          </DialogHeader>
          {stagesLoading ? (
            <p className="text-sm text-muted-foreground">{t("loadingStages")}</p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="inbox-lead-stage">{t("stage")}</Label>
                <select
                  id="inbox-lead-stage"
                  value={selectedStageId}
                  onChange={(event) => setSelectedStageId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.name}</option>
                  ))}
                </select>
              </div>
              {isPaidStageName(selectedStage?.name) && (
                <div className="grid gap-2">
                  <Label htmlFor="inbox-lead-paid-amount">{t("paidAmount")}</Label>
                  <Input
                    id="inbox-lead-paid-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={paidAmount}
                    onChange={(event) => setPaidAmount(event.target.value)}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStageDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void saveStage()}
              disabled={savingStage || stagesLoading || !selectedStageId}
            >
              {savingStage ? t("savingStage") : t("saveStage")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedDeal && (
        <DealLabelsDialog
          open={labelsDialogOpen}
          onOpenChange={setLabelsDialogOpen}
          dealId={selectedDeal.id}
          accountId={accountId}
          selected={selectedDeal.labels}
          canEdit={canEdit}
          onChange={(dealId, labels) => {
            setDeals((current) => current.map((deal) => deal.id === dealId ? { ...deal, labels } : deal));
          }}
        />
      )}
    </>
  );
}
