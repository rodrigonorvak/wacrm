export type DateFilter =
  | "today"
  | "yesterday"
  | "today_yesterday"
  | "7"
  | "14"
  | "28"
  | "30"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "max"
  | "custom";

export const DATE_FILTER_OPTIONS: DateFilter[] = [
  "today",
  "yesterday",
  "today_yesterday",
  "7",
  "14",
  "28",
  "30",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "max",
  "custom",
];

export const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  today_yesterday: "Hoje e ontem",
  "7": "Últimos 7 dias",
  "14": "Últimos 14 dias",
  "28": "Últimos 28 dias",
  "30": "Últimos 30 dias",
  this_week: "Esta semana",
  last_week: "Semana passada",
  this_month: "Este mês",
  last_month: "Mês passado",
  max: "Máximo",
  custom: "Personalizado",
};

export function isDateFilter(value: string | null): value is DateFilter {
  return DATE_FILTER_OPTIONS.some((option) => option === value);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function mondayOf(date: Date): Date {
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(startOfDay(date), offset);
}

/** Inclusive local range for a preset. `max` and `custom` have no fixed range. */
export function presetBounds(
  filter: DateFilter,
  now: Date = new Date(),
): { start: Date; end: Date } | null {
  const today = startOfDay(now);
  const end = endOfDay(now);
  if (filter === "today") return { start: today, end };
  if (filter === "yesterday") {
    const yesterday = addDays(today, -1);
    return { start: yesterday, end: endOfDay(yesterday) };
  }
  if (filter === "today_yesterday") return { start: addDays(today, -1), end };
  if (filter === "7" || filter === "14" || filter === "28" || filter === "30") {
    return { start: addDays(today, -(Number(filter) - 1)), end };
  }
  if (filter === "this_week") return { start: mondayOf(today), end };
  if (filter === "last_week") {
    const thisMonday = mondayOf(today);
    return { start: addDays(thisMonday, -7), end: endOfDay(addDays(thisMonday, -1)) };
  }
  if (filter === "this_month") {
    return { start: new Date(today.getFullYear(), today.getMonth(), 1), end };
  }
  if (filter === "last_month") {
    const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { start, end: endOfDay(new Date(today.getFullYear(), today.getMonth(), 0)) };
  }
  return null;
}

export interface BoardDealTiming {
  created_at: string
  updated_at?: string | null
  needs_attention?: boolean | null
}

function inBounds(value: string | null | undefined, start: Date | null, end: Date | null): boolean {
  if (!value) return false
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return false
  return (!start || at >= start) && (!end || at <= end)
}

/**
 * A pulsing reply stays on the board in every date filter, including Hoje
 * on the following days, until someone opens the inbox conversation.
 */
export function dealMatchesDateBounds(
  deal: BoardDealTiming,
  start: Date | null,
  end: Date | null,
): boolean {
  if (deal.needs_attention) return true
  return inBounds(deal.created_at, start, end)
}

/** Replies float to the top. Everyone else stays in creation order, newest first. */
export function compareBoardDeals(a: BoardDealTiming, b: BoardDealTiming): number {
  const aHot = Boolean(a.needs_attention)
  const bHot = Boolean(b.needs_attention)
  if (aHot !== bHot) return aHot ? -1 : 1
  const aTime = new Date((aHot ? a.updated_at : a.created_at) || a.created_at).getTime()
  const bTime = new Date((bHot ? b.updated_at : b.created_at) || b.created_at).getTime()
  return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime)
}

export function isCreatedToday(createdAt: string, now: Date = new Date()): boolean {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return created >= start && created < end;
}
