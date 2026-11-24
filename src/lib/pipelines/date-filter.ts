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
  created_at: string;
  updated_at?: string | null;
  needs_attention?: boolean | null;
  /**
   * Deal whose `scheduled_date` falls in the active filter window
   * (or today on the board) — stays visible and floats above quieter cards.
   */
  scheduled_due?: boolean | null;
  /** @deprecated use scheduled_due — kept for older call sites / tests */
  follow_up_due?: boolean | null;
  scheduled_date?: string | null;
  /** HH:MM or HH:MM:SS — earlier appointments float first among scheduled_due. */
  scheduled_time?: string | null;
}

function inBounds(value: string | null | undefined, start: Date | null, end: Date | null): boolean {
  if (!value) return false;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return false;
  return (!start || at >= start) && (!end || at <= end);
}

/** Local calendar day of `YYYY-MM-DD` against inclusive filter bounds. */
export function scheduledDateInBounds(
  scheduledDate: string | null | undefined,
  start: Date | null,
  end: Date | null,
): boolean {
  if (!scheduledDate || !/^\d{4}-\d{2}-\d{2}/.test(scheduledDate)) return false;
  const [year, month, day] = scheduledDate.slice(0, 10).split("-").map(Number);
  const at = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(at.getTime())) return false;
  return (!start || at >= start) && (!end || at <= end);
}

function isScheduledHot(deal: BoardDealTiming): boolean {
  return !!(deal.scheduled_due || deal.follow_up_due);
}

/**
 * A pulsing reply stays on the board in every date filter, including Hoje
 * on the following days, until someone opens the inbox conversation.
 * A deal scheduled for a day inside the filter also stays visible that day.
 */
export function dealMatchesDateBounds(
  deal: BoardDealTiming,
  start: Date | null,
  end: Date | null,
): boolean {
  if (deal.needs_attention || isScheduledHot(deal)) return true;
  if (scheduledDateInBounds(deal.scheduled_date, start, end)) return true;
  return inBounds(deal.created_at, start, end);
}

function boardHotRank(deal: BoardDealTiming): number {
  if (deal.needs_attention) return 2;
  if (isScheduledHot(deal)) return 1;
  return 0;
}

/** Minutes from midnight for HH:MM(:SS); unknown times sort last among due cards. */
function scheduledTimeMinutes(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return Number.POSITIVE_INFINITY;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.POSITIVE_INFINITY;
  return hours * 60 + minutes;
}

/**
 * Attention first, then scheduled-due by appointment time (earliest first),
 * then quieter cards newest-first.
 */
export function compareBoardDeals(a: BoardDealTiming, b: BoardDealTiming): number {
  const hotDiff = boardHotRank(b) - boardHotRank(a);
  if (hotDiff !== 0) return hotDiff;

  if (isScheduledHot(a) && isScheduledHot(b) && !a.needs_attention && !b.needs_attention) {
    const timeDiff = scheduledTimeMinutes(a.scheduled_time) - scheduledTimeMinutes(b.scheduled_time);
    if (timeDiff !== 0) return timeDiff;
  }

  const aHot = boardHotRank(a) > 0;
  const bHot = boardHotRank(b) > 0;
  const aTime = new Date(
    (aHot ? a.updated_at || a.scheduled_date || a.created_at : a.created_at) || a.created_at,
  ).getTime();
  const bTime = new Date(
    (bHot ? b.updated_at || b.scheduled_date || b.created_at : b.created_at) || b.created_at,
  ).getTime();
  return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
}

export function isCreatedToday(createdAt: string, now: Date = new Date()): boolean {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return created >= start && created < end;
}
