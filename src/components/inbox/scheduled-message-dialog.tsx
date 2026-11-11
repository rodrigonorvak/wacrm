"use client";

import { useCallback, useEffect, useState } from "react";
import { addMonths } from "date-fns";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useCan } from "@/hooks/use-can";
import { extractVariableIndices } from "@/lib/whatsapp/template-validators";
import type { ScheduledVariable, ScheduledTemplateVariables } from "@/lib/whatsapp/scheduled-template";
import type { MessageTemplate } from "@/types";
import { TemplateManager } from "@/components/settings/template-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScheduleDateTimeFields } from "@/components/ui/schedule-date-time-fields";
import { toDateKey } from "@/lib/schedule-date";

interface Schedule {
  id: string;
  label: string;
  scheduled_at: string;
  status: "pending" | "processing" | "sent" | "failed" | "uncertain" | "cancelled";
  error_code: string | null;
}

function defaultVariable(): ScheduledVariable {
  return { source: "contact_name" };
}

function VariableField({ label, value, onChange }: {
  label: string;
  value: ScheduledVariable;
  onChange: (value: ScheduledVariable) => void;
}) {
  const t = useTranslations("ScheduledMessages");
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <select className="w-full rounded-md border bg-background p-2 text-sm" value={value.source}
        onChange={(event) => onChange(event.target.value === "contact_name" ? defaultVariable() : { source: "text", value: "" })}>
        <option value="contact_name">{t("contactName")}</option>
        <option value="text">{t("customText")}</option>
      </select>
      {value.source === "text" && (
        <Input aria-label={label} value={value.value} onChange={(event) => onChange({ source: "text", value: event.target.value })} />
      )}
    </div>
  );
}

type ScheduledMessageDialogProps = {
  contactId: string;
  contactName?: string | null;
  showTrigger?: boolean;
} & (
  | { open: boolean; onOpenChange: (open: boolean) => void }
  | { open?: never; onOpenChange?: never }
);

export function ScheduledMessageDialog({
  contactId,
  contactName,
  showTrigger = true,
  open: controlledOpen,
  onOpenChange,
}: ScheduledMessageDialogProps) {
  const t = useTranslations("ScheduledMessages");
  const locale = useLocale();
  const canSend = useCan("send-messages");
  const canCreateTemplate = useCan("edit-settings");
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [variables, setVariables] = useState<ScheduledTemplateVariables>({ body: [] });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const [response, result] = await Promise.all([
        fetch(`/api/whatsapp/scheduled-messages?contact_id=${encodeURIComponent(contactId)}`),
        supabase.from("message_templates").select("*").eq("status", "APPROVED").order("name"),
      ]);
      if (!response.ok || result.error) throw new Error(t("loadError"));
      const json = await response.json();
      setSchedules(json.schedules);
      setTemplates(result.data as MessageTemplate[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [contactId, t]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) {
      setVariables({ body: [] });
      return;
    }
    const body = extractVariableIndices(template.body_text).map(defaultVariable);
    const headerText = template.header_type === "text" && extractVariableIndices(template.header_content ?? "").length
      ? defaultVariable() : undefined;
    const buttonParams: Record<string, ScheduledVariable> = {};
    (template.buttons ?? []).forEach((button, index) => {
      if (button.type === "URL" && extractVariableIndices(button.url).length) buttonParams[String(index)] = defaultVariable();
    });
    setVariables({ body, headerText, buttonParams });
  }

  async function submit() {
    if (!date || !time) {
      toast.error(t("invalidDate"));
      return;
    }
    const selected = new Date(`${date}T${time}`);
    if (!Number.isFinite(selected.getTime())) {
      toast.error(t("invalidDate"));
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/whatsapp/scheduled-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId, template_id: templateId, label, scheduled_at: selected.toISOString(), variables }),
      });
      const result = await response.json();
      if (!response.ok) {
        const detail = locale === "pt-BR" && typeof result.error === "string" ? result.error : null;
        throw new Error(detail || (response.status === 409 ? t("conflict") : t("saveError")));
      }
      toast.success(t("saveSuccess"));
      setLabel("");
      setDate("");
      setTime("");
      const now = new Date();
      setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
      chooseTemplate("");
      window.dispatchEvent(new Event("scheduled-messages-changed"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: string) {
    setSaving(true);
    try {
      const response = await fetch(`/api/whatsapp/scheduled-messages/${encodeURIComponent(id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) {
        const detail = locale === "pt-BR" && typeof result.error === "string" ? result.error : null;
        throw new Error(detail || t("cancelError"));
      }
      toast.success(t("cancelSuccess"));
      window.dispatchEvent(new Event("scheduled-messages-changed"));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("cancelError"));
    } finally {
      setSaving(false);
    }
  }

  const statusLabels: Record<Schedule["status"], string> = {
    pending: t("pending"), processing: t("processing"), sent: t("sent"),
    failed: t("failed"), uncertain: t("uncertain"), cancelled: t("cancelled"),
  };
  const selectedTemplate = templates.find((item) => item.id === templateId);

  return (
    <>
      {showTrigger && (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} title={t("title")}>
          <CalendarClock className="size-4" /> <span className="hidden sm:inline">{t("title")}</span>
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description", { name: contactName || t("contact") })}</DialogDescription>
          </DialogHeader>
          {loading && <p className="text-sm">{t("loading")}</p>}
          {schedules.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("list")}</h3>
              {schedules.map((schedule) => (
                <div key={schedule.id} className="rounded border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <strong>{schedule.label}</strong>
                    {canSend && schedule.status === "pending" && <Button variant="outline" size="sm" disabled={saving} onClick={() => void cancel(schedule.id)}>{t("cancel")}</Button>}
                  </div>
                  <div>{new Date(schedule.scheduled_at).toLocaleString(locale)}</div>
                  <div>{statusLabels[schedule.status]}</div>
                  {schedule.status === "failed" && (
                    <div>
                      {schedule.error_code === "template_not_approved"
                        ? t("templateNotApproved")
                        : schedule.error_code === "meta_approval_check_failed"
                          ? t("approvalCheckFailed")
                          : schedule.error_code === "missing_contact_template_or_config"
                            ? t("missingResources")
                            : t("failureHint")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {canSend && (
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t("create")}</h3>
                {canCreateTemplate && <Button variant="outline" size="sm" onClick={() => { setOpen(false); setCreating(true); }}>{t("createTemplate")}</Button>}
              </div>
              <Label htmlFor="scheduled-template">{t("chooseTemplate")}</Label>
              <select id="scheduled-template" className="w-full rounded-md border bg-background p-2 text-sm" value={templateId} onChange={(event) => chooseTemplate(event.target.value)}>
                <option value="">{t("select")}</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.name} ({template.language})</option>)}
              </select>
              {selectedTemplate && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{selectedTemplate.body_text}</p>}
              {variables.body.map((variable, index) => <VariableField key={`body-${index}`} label={`${t("body")} {{${index + 1}}}`} value={variable} onChange={(next) => setVariables((prev) => ({ ...prev, body: prev.body.map((v, i) => i === index ? next : v) }))} />)}
              {variables.headerText && <VariableField label={`${t("header")} {{1}}`} value={variables.headerText} onChange={(next) => setVariables((prev) => ({ ...prev, headerText: next }))} />}
              {Object.entries(variables.buttonParams ?? {}).map(([index, variable]) => <VariableField key={index} label={t("button", { number: Number(index) + 1 })} value={variable} onChange={(next) => setVariables((prev) => ({ ...prev, buttonParams: { ...prev.buttonParams, [index]: next } }))} />)}
              <Label htmlFor="scheduled-label">{t("label")}</Label>
              <Input id="scheduled-label" placeholder={t("labelPlaceholder")} maxLength={120} value={label} onChange={(event) => setLabel(event.target.value)} />
              <div className="w-full max-w-xs space-y-3 rounded-md border border-border p-3">
                <p className="text-sm font-medium">{t("date")}</p>
                <ScheduleDateTimeFields
                  month={month}
                  onMonthChange={setMonth}
                  date={date || null}
                  onDateChange={setDate}
                  time={time}
                  onTimeChange={setTime}
                  requireTime
                />
              </div>
              <div className="flex gap-2">
                {[1, 3, 6].map((months) => <Button key={months} type="button" variant="outline" size="sm" onClick={() => {
                  const next = addMonths(new Date(), months);
                  setDate(toDateKey(next));
                  setTime(`${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`);
                  setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
                }}>{months === 1 ? t("month") : t("months", { count: months })}</Button>)}
              </div>
              <Button disabled={saving || loading || !label.trim() || !templateId || !date || !time} onClick={() => void submit()}>{t("submit")}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {creating && <TemplateManager createOnly onCreateClose={() => { setCreating(false); setOpen(true); }} />}
    </>
  );
}
