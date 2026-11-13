import { createClient } from "@/lib/supabase/client";
import { toDateKey } from "@/lib/schedule-date";
import { appointmentDate } from "./calendar";

type Relation<T> = T | T[] | null;
export type CalendarLabel = { id: string; name: string; color: string };
type DealRow = {
  id: string;
  title: string;
  pipeline_id: string;
  scheduled_date: string | null;
  scheduled_time: string | null;
  contact: Relation<{ name: string | null }>;
  pipeline: Relation<{ name: string }>;
  stage: Relation<{ name: string }>;
};
type ScheduledRow = {
  id: string;
  label: string;
  scheduled_at: string;
  status: "pending" | "processing" | "uncertain";
  contact: Relation<{ name: string | null }>;
};
export type CalendarEvent = {
  id: string;
  start: Date;
  kind: "deal" | "message";
  name: string;
  subtitle: string;
  pipelineId?: string;
  messageStatus?: ScheduledRow["status"];
  labels: CalendarLabel[];
};
export type PipelineOption = { id: string; name: string };

function first<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function loadCalendar(accountId: string, start: Date, end: Date) {
  const db = createClient();
  const [pipelines, deals, messages] = await Promise.all([
    (async () => {
      const rows: PipelineOption[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.from("pipelines")
          .select("id, name").eq("account_id", accountId)
          .order("name").order("id").range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data as PipelineOption[]));
        if (data.length < 1000) return rows;
      }
    })(),
    (async () => {
      const rows: DealRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.from("deals")
          .select("id, title, pipeline_id, scheduled_date, scheduled_time, contact:contacts(name), pipeline:pipelines(name), stage:pipeline_stages(name)")
          .eq("account_id", accountId)
          .gte("scheduled_date", toDateKey(start))
          .lt("scheduled_date", toDateKey(end))
          .not("scheduled_time", "is", null)
          .order("id").range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data as DealRow[]));
        if (data.length < 1000) return rows;
      }
    })(),
    (async () => {
      const rows: ScheduledRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.from("scheduled_whatsapp_messages")
          .select("id, label, scheduled_at, status, contact:contacts(name)")
          .eq("account_id", accountId)
          .in("status", ["pending", "processing", "uncertain"])
          .gte("scheduled_at", start.toISOString())
          .lt("scheduled_at", end.toISOString())
          .order("id").range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data as ScheduledRow[]));
        if (data.length < 1000) return rows;
      }
    })(),
  ]);
  const labels = new Map<string, CalendarLabel[]>();
  for (let offset = 0; offset < deals.length; offset += 200) {
    const ids = deals.slice(offset, offset + 200).map((deal) => deal.id);
    for (let page = 0; ; page += 1000) {
      const { data, error } = await db.from("deal_label_links")
        .select("deal_id, label:deal_labels(id, name, color)")
        .eq("account_id", accountId).in("deal_id", ids)
        .order("deal_id").order("label_id").range(page, page + 999);
      if (error) throw error;
      for (const row of data) {
        const label = first(row.label as Relation<CalendarLabel>);
        if (label) labels.set(row.deal_id, [...(labels.get(row.deal_id) ?? []), label]);
      }
      if (data.length < 1000) break;
    }
  }
  const events: CalendarEvent[] = [];
  for (const deal of deals) {
    const start = appointmentDate(deal.scheduled_date, deal.scheduled_time);
    if (!start) continue;
    events.push({
      id: deal.id, start, kind: "deal", name: first(deal.contact)?.name || deal.title,
      subtitle: [first(deal.pipeline)?.name, first(deal.stage)?.name].filter(Boolean).join(" · "),
      pipelineId: deal.pipeline_id, labels: labels.get(deal.id) ?? [],
    });
  }
  for (const message of messages) {
    const start = new Date(message.scheduled_at);
    if (Number.isNaN(start.getTime())) {
      throw new Error(`Invalid scheduled message date: ${message.id}`);
    }
    events.push({
      id: message.id, start, kind: "message", name: first(message.contact)?.name || "",
      subtitle: message.label, messageStatus: message.status, labels: [],
    });
  }
  return { pipelines, events };
}
