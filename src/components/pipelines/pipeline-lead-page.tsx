"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import type { ContactTag, Deal, DealLabel, MessageTemplate, PipelineStage } from "@/types";
import { DealLabelsDialog } from "@/components/pipelines/deal-labels-dialog";
import { DealScheduleDialog } from "@/components/pipelines/deal-schedule-dialog";
import { formatScheduledDate } from "@/lib/schedule-date";
import { ContactForm } from "@/components/contacts/contact-form";
import { LeadQuickActions } from "@/components/pipelines/lead-quick-actions";
import { DealForm } from "@/components/pipelines/deal-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TemplatePicker, type TemplateSendValues } from "@/components/inbox/template-picker";
import { renderTemplateBody } from "@/lib/whatsapp/template-body";
import { isPaidStageName } from "@/lib/pipelines/paid-stage";
import {
  DEFAULT_PIPELINE_CARD_FIELDS,
  normalizePipelineCardFields,
  type PipelineCardField,
} from "@/lib/pipelines/card-fields";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CalendarDays,
  History,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Send,
  StickyNote,
  Trash2,
  UserRound,
  Pencil,
} from "lucide-react";

type ContactNote = {
  id: string;
  note_text: string;
  created_at: string;
};

type Conversation = { id: string };
type ConversationMessage = {
  id: string;
  content_text: string | null;
  sender_type: string;
  created_at: string;
};
type ContactCustomValue = {
  value: string | null;
  custom_field: { field_name: string } | null;
};
type DealStageHistoryRow = {
  id: string;
  from_stage_name: string | null;
  to_stage_name: string;
  changed_by: string | null;
  changed_at: string;
};
type DealStageHistoryEntry = DealStageHistoryRow & { actor_name: string | null };
type DealReminder = {
  id: string;
  remind_at: string;
  message: string;
};
type DealServiceStep = {
  id: string;
  label: string;
  position: number;
  completed_at: string | null;
};
type Tab = "whatsapp" | "notes" | "history";

interface PipelineLeadPageProps {
  dealId: string;
  returnTo: string;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatHistoryDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value)).replace(",", " às");
}

function toDateTimeInputValue(date: Date): string {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function PipelineLeadPage({ dealId, returnTo }: PipelineLeadPageProps) {
  const router = useRouter();
  const supabase = createClient();
  const { accountId, user } = useAuth();
  const userId = user?.id;
  const canManageLead = useCan("send-messages");
  const [deal, setDeal] = useState<Deal | null>(null);
  const [dealReloadToken, setDealReloadToken] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [loadedDealKey, setLoadedDealKey] = useState("");
  const [tab, setTab] = useState<Tab>("whatsapp");
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [customValues, setCustomValues] = useState<ContactCustomValue[]>([]);
  const [contactTags, setContactTags] = useState<ContactTag[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [stagesLoadedFor, setStagesLoadedFor] = useState("");
  const [stageHistory, setStageHistory] = useState<DealStageHistoryEntry[]>([]);
  const [historyLoadedKey, setHistoryLoadedKey] = useState("");
  const [historyError, setHistoryError] = useState(false);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [loadedContactId, setLoadedContactId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [savingStage, setSavingStage] = useState(false);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [reminderAt, setReminderAt] = useState("");
  const [reminderMessage, setReminderMessage] = useState("");
  const [reminders, setReminders] = useState<DealReminder[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [serviceStepsDialogOpen, setServiceStepsDialogOpen] = useState(false);
  const [serviceSteps, setServiceSteps] = useState<DealServiceStep[]>([]);
  const [serviceStepsLoading, setServiceStepsLoading] = useState(false);
  const [serviceStepLabel, setServiceStepLabel] = useState("");
  const [savingServiceStep, setSavingServiceStep] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [labelsDialogOpen, setLabelsDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [visibleCardFields, setVisibleCardFields] = useState<PipelineCardField[]>(DEFAULT_PIPELINE_CARD_FIELDS);
  const [deletingLead, setDeletingLead] = useState(false);
  const dealRequestKey = accountId ? `${accountId}:${dealId}:${dealReloadToken}` : "";
  const loading = !dealRequestKey || loadedDealKey !== dealRequestKey;
  const contentLoading = Boolean(deal?.contact_id && loadedContactId !== deal.contact_id);
  const stagesLoading = Boolean(deal?.pipeline_id && stagesLoadedFor !== deal.pipeline_id);
  const historyRequestKey = deal ? `${deal.id}:${deal.stage_id}:${historyRetry}` : "";
  const historyLoading = tab === "history" && !!historyRequestKey && historyLoadedKey !== historyRequestKey;

  useEffect(() => {
    if (!dealRequestKey) return;
    let cancelled = false;
    void (async () => {
      const base = "*, contact:contacts(*), stage:pipeline_stages(*), pipeline:pipelines(pipeline_type), assignee:profiles!deals_assigned_to_fkey(*)";
      let result = await supabase
        .from("deals")
        .select(`${base}, deal_label_links(label:deal_labels(*))`)
        .eq("id", dealId)
        .eq("account_id", accountId)
        .maybeSingle();
      // Labels tables may not exist yet (migration 059 pending).
      if (result.error) {
        result = await supabase
          .from("deals")
          .select(base)
          .eq("id", dealId)
          .eq("account_id", accountId)
          .maybeSingle();
      }
      if (cancelled) return;
      const { data, error } = result;
      if (error || !data) {
        if (error) console.error("Failed to load pipeline lead:", error.message);
        setLoadError(true);
        setDeal(null);
      } else {
        const { deal_label_links: links, ...rest } = data as unknown as Record<string, unknown> & {
          deal_label_links?: { label: DealLabel | null }[];
        };
        setLoadError(false);
        const { data: customValueRows, error: customValuesError } = await supabase
          .from("deal_custom_field_values")
          .select("field_id, value, field:pipeline_custom_fields(field_name, show_on_card)")
          .eq("deal_id", dealId);
        if (customValuesError) {
          console.error("Failed to load pipeline custom values:", customValuesError.message);
        }
        setDeal({
          ...rest,
          labels: (links ?? []).flatMap((link) => (link.label ? [link.label] : [])),
          custom_values: (customValueRows ?? []).map((row) => {
            const field = Array.isArray(row.field) ? row.field[0] : row.field;
            return {
              field_id: row.field_id,
              value: row.value,
              field: field
                ? { field_name: field.field_name, show_on_card: field.show_on_card }
                : undefined,
            };
          }),
        } as unknown as Deal);
      }
      setLoadedDealKey(dealRequestKey);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, dealRequestKey, dealId, supabase]);

  useEffect(() => {
    if (!userId) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const stored = localStorage.getItem(`wacrm.pipeline.card-fields.${userId}`);
      setVisibleCardFields(normalizePipelineCardFields(stored ? JSON.parse(stored) : null));
    } catch {
      setVisibleCardFields(DEFAULT_PIPELINE_CARD_FIELDS);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [userId]);

  const updateVisibleCardFields = useCallback((fields: PipelineCardField[]) => {
    setVisibleCardFields(fields);
    if (!userId) return;
    try {
      localStorage.setItem(`wacrm.pipeline.card-fields.${userId}`, JSON.stringify(fields));
    } catch {
      console.error("Could not persist pipeline card field preferences.");
    }
  }, [userId]);

  useEffect(() => {
    if (!deal?.pipeline_id) return;
    let cancelled = false;
    void supabase
      .from("pipeline_stages")
      .select("*")
      .eq("pipeline_id", deal.pipeline_id)
      .order("position")
      .then(({ data }) => {
        if (cancelled) return;
        setStages((data ?? []) as PipelineStage[]);
        setStagesLoadedFor(deal.pipeline_id);
      });
    return () => {
      cancelled = true;
    };
  }, [deal?.pipeline_id, supabase]);

  useEffect(() => {
    if (!deal?.contact_id) return;
    let cancelled = false;
    void Promise.all([
      supabase
        .from("contact_notes")
        .select("id, note_text, created_at")
        .eq("contact_id", deal.contact_id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_custom_values")
        .select("value, custom_field:custom_fields(field_name)")
        .eq("contact_id", deal.contact_id),
      supabase
        .from("contact_tags")
        .select("id, contact_id, tag_id")
        .eq("contact_id", deal.contact_id),
      supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", deal.contact_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]).then(async ([notesResult, customValuesResult, tagsResult, conversationResult]) => {
      if (cancelled) return;
      setNotes((notesResult.data as unknown as ContactNote[] | null) ?? []);
      setCustomValues((customValuesResult.data as unknown as ContactCustomValue[] | null) ?? []);
      setContactTags((tagsResult.data as unknown as ContactTag[] | null) ?? []);
      const conversationRow = conversationResult.data as unknown as Conversation | null;
      setConversation(conversationRow);
      if (conversationRow) {
        const { data: messageRows } = await supabase
          .from("messages")
          .select("id, content_text, sender_type, created_at")
          .eq("conversation_id", conversationRow.id)
          .order("created_at", { ascending: false })
          .limit(50);
        if (!cancelled) {
          setMessages((messageRows as unknown as ConversationMessage[] | null ?? []).reverse());
        }
      } else {
        setMessages([]);
      }
    }).finally(() => {
      if (!cancelled) setLoadedContactId(deal.contact_id);
    });
    return () => {
      cancelled = true;
    };
  }, [deal?.contact_id, dealReloadToken, supabase]);

  useEffect(() => {
    if (!conversation?.id) return;
    const channel = supabase
      .channel(`pipeline-lead-${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const message = payload.new as ConversationMessage;
          setMessages((current) => [...current, message].slice(-50));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversation?.id, supabase]);

  useEffect(() => {
    if (tab !== "history" || !deal?.id || !historyRequestKey) return;
    let cancelled = false;
    void supabase
      .from("deal_stage_history")
      .select("id, from_stage_name, to_stage_name, changed_by, changed_at")
      .eq("deal_id", deal.id)
      .order("changed_at", { ascending: true })
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load deal stage history:", error.message);
          setHistoryError(true);
          setStageHistory([]);
          setHistoryLoadedKey(historyRequestKey);
          return;
        }

        const rows = (data as unknown as DealStageHistoryRow[] | null) ?? [];
        const actorIds = [...new Set(rows.flatMap((row) => row.changed_by ? [row.changed_by] : []))];
        let actorNames = new Map<string, string>();
        if (actorIds.length > 0) {
          const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", actorIds);
          if (!cancelled && !profilesError) {
            actorNames = new Map(
              (profiles ?? []).map((profile) => [profile.user_id, profile.full_name]),
            );
          }
        }
        if (cancelled) return;
        setStageHistory(rows.map((row) => ({
          ...row,
          actor_name: row.changed_by ? actorNames.get(row.changed_by) ?? null : null,
        })));
        setHistoryError(false);
        setHistoryLoadedKey(historyRequestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [deal?.id, historyRequestKey, supabase, tab]);

  const handleTemplateSent = useCallback(async (sentDealId: string) => {
    if (!deal || !accountId || sentDealId !== deal.id) return;
    const { data: nextStage, error: stageError } = await supabase
      .from("pipeline_stages")
      .select("*")
      .eq("pipeline_id", deal.pipeline_id)
      .eq("name", "Prospecção iniciada")
      .maybeSingle();
    if (stageError || !nextStage) {
      toast.error("Não foi possível atualizar a etapa do lead");
      return;
    }
    const response = await fetch(`/api/deals/${deal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage_id: nextStage.id }),
    });
    if (!response.ok) {
      toast.error("Não foi possível atualizar a etapa do lead");
      return;
    }
    setDeal((current) => current
      ? { ...current, stage_id: nextStage.id, stage: nextStage }
      : current,
    );
  }, [accountId, deal, supabase]);

  async function handleStageChange() {
    if (!deal || !selectedStageId) return;
    const stage = stages.find((item) => item.id === selectedStageId);
    if (!stage) return;
    const requiresAmount = isPaidStageName(stage.name);
    const amount = Number(paidAmount);
    if (requiresAmount && !(amount > 0)) {
      toast.error("Informe o valor pago para mover o lead para esta etapa");
      return;
    }
    setSavingStage(true);
    const response = await fetch(`/api/deals/${deal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage_id: stage.id,
        ...(requiresAmount ? { value: amount, currency: "BRL" } : {}),
      }),
    });
    setSavingStage(false);
    if (!response.ok) {
      toast.error("Não foi possível alterar a etapa do lead");
      return;
    }
    setDeal((current) => current
      ? { ...current, stage_id: stage.id, stage, ...(requiresAmount ? { value: amount } : {}) }
      : current,
    );
    setStageDialogOpen(false);
    toast.success("Etapa atualizada");
  }

  async function openReminderDialog() {
    if (!deal || !user) return;
    setReminderAt(toDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000)));
    setReminderMessage("");
    setReminderDialogOpen(true);
    setRemindersLoading(true);
    const { data, error } = await supabase
      .from("deal_reminders")
      .select("id, remind_at, message")
      .eq("deal_id", deal.id)
      .eq("created_by", user.id)
      .eq("status", "pending")
      .order("remind_at");
    if (error) {
      toast.error("Não foi possível carregar os lembretes");
      setReminders([]);
    } else {
      setReminders((data ?? []) as DealReminder[]);
    }
    setRemindersLoading(false);
  }

  async function saveReminder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deal || !accountId || !user || !reminderAt || !reminderMessage.trim()) return;
    const remindAtDate = new Date(reminderAt);
    if (Number.isNaN(remindAtDate.getTime()) || remindAtDate.getTime() <= Date.now()) {
      toast.error("Escolha uma data e hora futuras");
      return;
    }
    setSavingReminder(true);
    const { data, error } = await supabase
      .from("deal_reminders")
      .insert({
        account_id: accountId,
        pipeline_id: deal.pipeline_id,
        deal_id: deal.id,
        created_by: user.id,
        remind_at: remindAtDate.toISOString(),
        message: reminderMessage.trim(),
      })
      .select("id, remind_at, message")
      .single();
    setSavingReminder(false);
    if (error || !data) {
      toast.error("Não foi possível agendar o alerta");
      return;
    }
    setReminders((current) => [...current, data as DealReminder].sort(
      (left, right) => left.remind_at.localeCompare(right.remind_at),
    ));
    setReminderMessage("");
    toast.success("Alerta agendado");
  }

  async function cancelReminder(reminderId: string) {
    if (!user) return;
    const { error } = await supabase
      .from("deal_reminders")
      .update({ status: "cancelled" })
      .eq("id", reminderId)
      .eq("created_by", user.id);
    if (error) {
      toast.error("Não foi possível cancelar o alerta");
      return;
    }
    setReminders((current) => current.filter((item) => item.id !== reminderId));
  }

  async function openServiceSteps() {
    if (!deal) return;
    setServiceStepsDialogOpen(true);
    setServiceStepsLoading(true);
    const { data, error } = await supabase
      .from("deal_service_steps")
      .select("id, label, position, completed_at")
      .eq("deal_id", deal.id)
      .order("position")
      .order("created_at");
    if (error) {
      toast.error("Não foi possível carregar as etapas de atendimento");
      setServiceSteps([]);
    } else {
      setServiceSteps((data ?? []) as DealServiceStep[]);
    }
    setServiceStepsLoading(false);
  }

  async function addServiceStep(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deal || !accountId || !serviceStepLabel.trim()) return;
    setSavingServiceStep(true);
    const { data, error } = await supabase
      .from("deal_service_steps")
      .insert({
        account_id: accountId,
        deal_id: deal.id,
        label: serviceStepLabel.trim(),
        position: serviceSteps.length,
        created_by: user?.id ?? null,
      })
      .select("id, label, position, completed_at")
      .single();
    setSavingServiceStep(false);
    if (error || !data) {
      toast.error("Não foi possível adicionar a etapa");
      return;
    }
    setServiceSteps((current) => [...current, data as DealServiceStep]);
    setServiceStepLabel("");
  }

  async function toggleServiceStep(step: DealServiceStep) {
    const completedAt = step.completed_at ? null : new Date().toISOString();
    const { error } = await supabase
      .from("deal_service_steps")
      .update({ completed_at: completedAt })
      .eq("id", step.id)
      .eq("deal_id", deal?.id ?? "");
    if (error) {
      toast.error("Não foi possível atualizar a etapa");
      return;
    }
    setServiceSteps((current) => current.map((item) => item.id === step.id
      ? { ...item, completed_at: completedAt }
      : item,
    ));
  }

  async function removeServiceStep(stepId: string) {
    const { error } = await supabase
      .from("deal_service_steps")
      .delete()
      .eq("id", stepId)
      .eq("deal_id", deal?.id ?? "");
    if (error) {
      toast.error("Não foi possível remover a etapa");
      return;
    }
    setServiceSteps((current) => current.filter((item) => item.id !== stepId));
  }

  async function deleteLead() {
    if (!deal || !accountId) return;
    setDeletingLead(true);
    const { error } = await supabase
      .from("deals")
      .delete()
      .eq("id", deal.id)
      .eq("account_id", accountId);
    setDeletingLead(false);
    if (error) {
      toast.error("Não foi possível excluir o lead");
      return;
    }
    toast.success("Lead excluído");
    router.push(returnTo);
  }

  async function addNote() {
    if (!newNote.trim() || !deal?.contact_id || !accountId || !user) return;
    setSavingNote(true);
    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: deal.contact_id,
        account_id: accountId,
        user_id: user.id,
        note_text: newNote.trim(),
      })
      .select("id, note_text, created_at")
      .single();
    setSavingNote(false);
    if (error || !data) {
      toast.error("Não foi possível salvar a nota");
      return;
    }
    setNotes((current) => [data as unknown as ContactNote, ...current]);
    setNewNote("");
    toast.success("Nota adicionada");
  }

  async function sendTemplate(template: MessageTemplate, values: TemplateSendValues) {
    if (!deal?.contact_id) return;
    setSendingTemplate(true);
    const response = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: deal.contact_id,
        message_type: "template",
        template_name: template.name,
        template_language: template.language,
        template_message_params: {
          body: values.body,
          headerText: values.headerText,
          buttonParams: values.buttonParams,
        },
        template_params: values.body,
        content_text: renderTemplateBody(template.body_text, values.body),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setSendingTemplate(false);
    if (!response.ok) {
      toast.error(result?.error || "Não foi possível enviar o template");
      return;
    }
    setTemplatePickerOpen(false);
    setConversation({ id: result.conversation_id });
    await handleTemplateSent(deal.id);
    toast.success("Template enviado");
  }

  if (loading) {
    return <div className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">Carregando lead...</div>;
  }

  if (loadError || !deal) {
    return (
      <div className="mx-auto flex min-h-80 max-w-3xl flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-muted-foreground">Lead não encontrado ou sem acesso.</p>
        <Link href={returnTo} className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted">
          Voltar para a pipeline
        </Link>
      </div>
    );
  }

  const contact = deal.contact;
  const displayName = contact?.name || deal.title || "Detalhes do lead";
  const customRows = customValues.filter((item) => item.value?.trim() && item.custom_field?.field_name);
  const selectedStage = stages.find((stage) => stage.id === selectedStageId);
  const pendingServiceSteps = serviceSteps.filter((step) => !step.completed_at).length;

  return (
    <div className="pipeline-lead-canvas -mx-4 -mt-4 min-h-full px-4 pt-4 pb-24 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6 sm:pb-24">
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header
        style={{ animationDelay: "20ms" }}
        className="flex animate-in fade-in-0 slide-in-from-bottom-1 flex-col gap-4 duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="min-w-0">
          <Link href={returnTo} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" /> Voltar
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-bold text-foreground sm:text-3xl">{displayName}</h1>
            <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              ID: {deal.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          {(deal.labels?.length ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {deal.labels!.map((label) => (
                <span
                  key={label.id}
                  className="inline-flex h-5 items-center rounded-full px-2.5 text-xs font-semibold text-white"
                  style={{ backgroundColor: label.color }}
                >
                  {label.name || "\u00A0\u00A0\u00A0"}
                </span>
              ))}
            </div>
          )}
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4" /> Criado em {formatDate(deal.created_at)}
          </p>
          {deal.scheduled_date && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded bg-blue-600 px-2 py-0.5 text-sm font-semibold text-white">
              <CalendarClock className="size-4" /> Agendado para{" "}
              {formatScheduledDate(deal.scheduled_date, "pt-BR")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setDealFormOpen(true)}>
            <Pencil className="size-4" />
            Editar negócio
          </Button>
          <span className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm">
            {deal.stage?.name || "Sem etapa"}
          </span>
        </div>
      </header>

      <div
        style={{ animationDelay: "130ms" }}
        className="grid animate-in fade-in-0 slide-in-from-bottom-1 items-start gap-4 duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none lg:grid-cols-[minmax(250px,0.85fr)_minmax(0,1.8fr)]"
      >
        <aside className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-[11px] font-semibold uppercase text-muted-foreground">
            Informações do lead
          </div>
          <div className="p-4">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <UserRound className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {deal.assignee?.full_name || "Sem responsável"}
                </p>
                <p className="text-xs text-muted-foreground">Responsável atual</p>
              </div>
            </div>

            <dl className="mt-4 space-y-4">
              <div>
                <dt className="text-[10px] font-semibold uppercase text-muted-foreground">
                  {deal.pipeline?.pipeline_type === "standard" ? "Telefone informado manualmente" : "Telefone principal"}
                </dt>
                <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
                  <Phone className="size-4 text-emerald-600" /> {contact?.phone || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Empresa</dt>
                <dd className="mt-1 flex items-center gap-2 text-sm text-foreground">
                  <Building2 className="size-4 text-muted-foreground" /> {contact?.company || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-muted-foreground">E-mail</dt>
                <dd className="mt-1 flex items-center gap-2 break-all text-sm text-foreground">
                  <Mail className="size-4 shrink-0 text-muted-foreground" /> {contact?.email || "-"}
                </dd>
              </div>
              {customRows.map((item, index) => {
                const fieldName = item.custom_field?.field_name ?? "Campo personalizado";
                const isLocation = /local|cidade|endere[cç]o/i.test(fieldName);
                const FieldIcon = isLocation ? MapPin : StickyNote;
                return (
                  <div key={`${fieldName}-${index}`}>
                    <dt className="text-[10px] font-semibold uppercase text-muted-foreground">{fieldName}</dt>
                    <dd className="mt-1 flex items-start gap-2 text-sm text-foreground">
                      <FieldIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="break-words">{item.value}</span>
                    </dd>
                  </div>
                );
              })}
              {(deal.custom_values ?? [])
                .filter((item) => item.value?.trim() && item.field?.field_name)
                .map((item) => (
                  <div key={item.field_id}>
                    <dt className="text-[10px] font-semibold uppercase text-muted-foreground">{item.field?.field_name}</dt>
                    <dd className="mt-1 flex items-start gap-2 text-sm text-foreground">
                      <StickyNote className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="break-words">{item.value}</span>
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex gap-1 overflow-x-auto border-b border-border px-2 sm:px-3" role="tablist" aria-label="Detalhes do lead">
            {([
              ["whatsapp", "WhatsApp", MessageCircle],
              ["notes", "Notas Internas", StickyNote],
              ["history", "Histórico", History],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-semibold transition-colors ${tab === value ? "border-emerald-600 text-emerald-700" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>

          <div key={tab} role="tabpanel" className="min-h-[380px] animate-in fade-in-0 duration-200 ease-out motion-reduce:animate-none">
            {contentLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Carregando...</div>
            ) : tab === "whatsapp" ? (
              <div className="flex min-h-[380px] flex-col">
                <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4 sm:p-5">
                  {!conversation ? (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
                      <MessageCircle className="size-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Este lead ainda não possui uma conversa.</p>
                      {contact?.phone ? (
                        <Button onClick={() => setTemplatePickerOpen(true)} disabled={sendingTemplate} className="gap-2">
                          <Send className="size-4" /> Iniciar com template
                        </Button>
                      ) : (
                        <p className="max-w-sm text-xs text-muted-foreground">
                          Adicione um telefone ao contato para iniciar uma conversa pelo WhatsApp.
                        </p>
                      )}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground">Nenhuma mensagem encontrada.</div>
                  ) : (
                    messages.map((message) => {
                      const isIncoming = message.sender_type === "customer";
                      return (
                        <div key={message.id} className={`flex ${isIncoming ? "justify-start" : "justify-end"}`}>
                          <div className={`max-w-[88%] rounded-lg border px-3 py-2 text-sm ${isIncoming ? "border-border bg-card text-foreground" : "border-emerald-200 bg-emerald-100 text-foreground"}`}>
                            <p className="whitespace-pre-wrap break-words">{message.content_text || "(mídia)"}</p>
                            <p className="mt-1 text-right text-[10px] text-muted-foreground">{formatDateTime(message.created_at)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
                  {conversation && (
                    <Link href={`/inbox?c=${conversation.id}`} className="text-sm font-medium text-primary hover:underline">
                      Abrir conversa completa
                    </Link>
                  )}
                  {conversation && (
                    <Button variant="outline" size="sm" onClick={() => setTemplatePickerOpen(true)} disabled={sendingTemplate} className="gap-2">
                      <Send className="size-4" /> Enviar template
                    </Button>
                  )}
                </div>
              </div>
            ) : tab === "notes" ? (
              <div className="flex max-h-[min(68vh,720px)] min-h-[380px] flex-col">
                <div className="border-b border-border p-3 sm:p-4">
                  <Textarea id="lead-note-input" value={newNote} onChange={(event) => setNewNote(event.target.value)} placeholder="Escreva uma observação sobre este lead..." className="min-h-20 resize-y border-0 shadow-none focus-visible:ring-0" />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                    <span className="text-xs text-muted-foreground">Enter para pular linha</span>
                    <Button onClick={addNote} disabled={savingNote || !newNote.trim()} size="sm" className="gap-2">
                      <Send className="size-4" /> Adicionar Nota
                    </Button>
                  </div>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4">
                  {notes.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma nota registrada.</p>
                  ) : notes.map((note) => (
                    <article key={note.id} className="rounded-lg border border-border bg-background p-3 text-sm">
                      <time className="text-xs text-muted-foreground">{formatDateTime(note.created_at)}</time>
                      <p className="mt-2 whitespace-pre-wrap break-words text-foreground">{note.note_text}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : historyLoading ? (
              <div className="flex min-h-[380px] items-center justify-center text-sm text-muted-foreground">
                Carregando histórico...
              </div>
            ) : historyError ? (
              <div className="flex min-h-[380px] flex-col items-center justify-center gap-3 p-6 text-center">
                <History className="size-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Não foi possível carregar o histórico.</p>
                <Button variant="outline" size="sm" onClick={() => setHistoryRetry((current) => current + 1)}>
                  Tentar novamente
                </Button>
              </div>
            ) : stageHistory.length === 0 ? (
              <div className="flex min-h-[380px] flex-col items-center justify-center gap-3 p-6 text-center">
                <History className="size-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhum histórico registrado.</p>
              </div>
            ) : (
              <ol className="relative max-h-[min(68vh,720px)] space-y-3 overflow-y-auto p-4 sm:p-5">
                {stageHistory.map((entry, index) => (
                  <li key={entry.id} className="relative pl-6">
                    {index < stageHistory.length - 1 && (
                      <span aria-hidden="true" className="absolute bottom-[-12px] left-[7px] top-3 w-px bg-border" />
                    )}
                    <span aria-hidden="true" className="absolute left-0 top-3 size-4 rounded-full border-4 border-background bg-muted-foreground/40" />
                    <article className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
                      <p className="text-foreground">
                        {entry.from_stage_name
                          ? `Mudou etapa de "${entry.from_stage_name}" para "${entry.to_stage_name}"`
                          : `Lead entrou em "${entry.to_stage_name}"`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.actor_name || (entry.changed_by ? "Equipe" : "Sistema")}
                        <span aria-hidden="true"> · </span>
                        <time dateTime={entry.changed_at}>{formatHistoryDateTime(entry.changed_at)}</time>
                      </p>
                    </article>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      <TemplatePicker
        open={templatePickerOpen}
        onOpenChange={setTemplatePickerOpen}
        onSelect={sendTemplate}
      />

      <Dialog open={reminderDialogOpen} onOpenChange={setReminderDialogOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Agendar alerta</DialogTitle>
            <DialogDescription>O lembrete aparecerá nas Notificações no horário escolhido.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveReminder} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="lead-reminder-time">Data e hora</Label>
              <Input
                id="lead-reminder-time"
                type="datetime-local"
                value={reminderAt}
                onChange={(event) => setReminderAt(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="lead-reminder-message">Lembrete</Label>
              <Textarea
                id="lead-reminder-message"
                value={reminderMessage}
                onChange={(event) => setReminderMessage(event.target.value)}
                placeholder="O que você precisa lembrar?"
                maxLength={500}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReminderDialogOpen(false)}>Fechar</Button>
              <Button type="submit" disabled={savingReminder || !reminderAt || !reminderMessage.trim()}>
                {savingReminder ? "Agendando..." : "Agendar alerta"}
              </Button>
            </DialogFooter>
          </form>
          <section className="space-y-2 border-t border-border pt-3">
            <h3 className="text-sm font-semibold">Próximos alertas</h3>
            {remindersLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : reminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum alerta agendado.</p>
            ) : reminders.map((reminder) => (
              <article key={reminder.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                <div className="min-w-0">
                  <p className="break-words text-sm text-foreground">{reminder.message}</p>
                  <time className="mt-1 block text-xs text-muted-foreground">{formatDateTime(reminder.remind_at)}</time>
                </div>
                <button
                  type="button"
                  aria-label="Cancelar alerta"
                  title="Cancelar alerta"
                  onClick={() => void cancelReminder(reminder.id)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </article>
            ))}
          </section>
        </DialogContent>
      </Dialog>

      <Dialog open={stageDialogOpen} onOpenChange={setStageDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar estágio</DialogTitle>
            <DialogDescription>Escolha a nova etapa comercial deste lead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="lead-stage-select">Etapa</Label>
              <select
                id="lead-stage-select"
                value={selectedStageId}
                onChange={(event) => setSelectedStageId(event.target.value)}
                disabled={stagesLoading}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </div>
            {isPaidStageName(selectedStage?.name) && (
              <div className="grid gap-2">
                <Label htmlFor="lead-paid-amount">Valor pago (R$)</Label>
                <Input
                  id="lead-paid-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={paidAmount}
                  onChange={(event) => setPaidAmount(event.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStageDialogOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={() => void handleStageChange()} disabled={savingStage || stagesLoading || !selectedStageId}>
              {savingStage ? "Salvando..." : "Salvar etapa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={serviceStepsDialogOpen} onOpenChange={setServiceStepsDialogOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Etapas de atendimento</DialogTitle>
            <DialogDescription>Checklist interno deste lead, separado do estágio comercial.</DialogDescription>
          </DialogHeader>
          {serviceStepsLoading ? (
            <p className="py-5 text-sm text-muted-foreground">Carregando etapas...</p>
          ) : (
            <div className="space-y-3">
              {serviceSteps.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {serviceSteps.length - pendingServiceSteps} de {serviceSteps.length} concluídas
                </p>
              )}
              {serviceSteps.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">Nenhuma etapa adicionada.</p>
              ) : serviceSteps.map((step) => (
                <div key={step.id} className="flex items-center gap-3 rounded-md border border-border p-3">
                  <input
                    id={`service-step-${step.id}`}
                    type="checkbox"
                    checked={Boolean(step.completed_at)}
                    onChange={() => void toggleServiceStep(step)}
                    disabled={!canManageLead}
                    className="size-4 shrink-0 accent-primary"
                  />
                  <label
                    htmlFor={`service-step-${step.id}`}
                    className={`min-w-0 flex-1 cursor-pointer break-words text-sm ${step.completed_at ? "text-muted-foreground line-through" : "text-foreground"}`}
                  >
                    {step.label}
                  </label>
                  <button
                    type="button"
                    aria-label={`Remover etapa ${step.label}`}
                    title="Remover etapa"
                    onClick={() => void removeServiceStep(step.id)}
                    disabled={!canManageLead}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <form onSubmit={addServiceStep} className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
                <Input
                  value={serviceStepLabel}
                  onChange={(event) => setServiceStepLabel(event.target.value)}
                  placeholder="Nova etapa de atendimento"
                  maxLength={120}
                  aria-label="Nome da nova etapa"
                  disabled={!canManageLead}
                />
                <Button type="submit" disabled={!canManageLead || savingServiceStep || !serviceStepLabel.trim()}>
                  {savingServiceStep ? "Adicionando..." : "Adicionar"}
                </Button>
              </form>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setServiceStepsDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir lead?</DialogTitle>
            <DialogDescription>
              O lead será removido do funil. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={() => void deleteLead()} disabled={deletingLead}>
              {deletingLead ? "Excluindo..." : "Excluir lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactForm
        open={contactFormOpen}
        onOpenChange={setContactFormOpen}
        contact={contact ?? null}
        contactTags={contactTags}
        onSaved={() => setDealReloadToken((current) => current + 1)}
      />

      <DealForm
        open={dealFormOpen}
        onOpenChange={setDealFormOpen}
        deal={deal}
        pipelineId={deal.pipeline_id}
        stages={stages}
        defaultStageId={deal.stage_id}
        visibleCardFields={visibleCardFields}
        onVisibleCardFieldsChange={updateVisibleCardFields}
        onSaved={() => setDealReloadToken((current) => current + 1)}
      />

      <LeadQuickActions
        canManageLead={canManageLead}
        phone={contact?.phone ?? null}
        conversationId={conversation?.id ?? null}
        onAddNote={() => {
          setTab("notes");
          requestAnimationFrame(() => document.getElementById("lead-note-input")?.focus());
        }}
        onScheduleAlert={() => void openReminderDialog()}
        onChangeStage={() => {
          setSelectedStageId(deal.stage_id);
          setPaidAmount(String(deal.value ?? ""));
          setStageDialogOpen(true);
        }}
        onEditInformation={() => {
          if (!contact) {
            toast.error("Este lead não tem um contato vinculado para editar");
            return;
          }
          setContactFormOpen(true);
        }}
        onServiceSteps={() => void openServiceSteps()}
        onEditLabels={() => setLabelsDialogOpen(true)}
        onEditSchedule={() => setScheduleDialogOpen(true)}
        onDeleteLead={() => setDeleteDialogOpen(true)}
      />

      <DealLabelsDialog
        open={labelsDialogOpen}
        onOpenChange={setLabelsDialogOpen}
        dealId={deal.id}
        accountId={accountId}
        selected={deal.labels ?? []}
        canEdit={canManageLead}
        onChange={(_, labels) => setDeal((current) => (current ? { ...current, labels } : current))}
      />
      <DealScheduleDialog
        open={scheduleDialogOpen}
        onOpenChange={setScheduleDialogOpen}
        dealId={deal.id}
        value={deal.scheduled_date}
        canEdit={canManageLead}
        onChange={(_, scheduledDate) =>
          setDeal((current) => (current ? { ...current, scheduled_date: scheduledDate } : current))
        }
      />
    </div>
    </div>
  );
}