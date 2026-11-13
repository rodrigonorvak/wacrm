import { toDateKey } from "@/lib/schedule-date";

export type CalendarView = "day" | "four" | "week" | "month";

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, count: number): Date {
  const result = startOfDay(date);
  result.setDate(result.getDate() + count);
  return result;
}

export function startOfWeek(date: Date): Date {
  return addDays(date, -date.getDay());
}

export function calendarRange(date: Date, view: CalendarView): { start: Date; end: Date } {
  if (view === "day") {
    const start = startOfDay(date);
    return { start, end: addDays(start, 1) };
  }
  if (view === "four") {
    const start = startOfDay(date);
    return { start, end: addDays(start, 4) };
  }
  if (view === "week") {
    const start = startOfWeek(date);
    return { start, end: addDays(start, 7) };
  }
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: startOfWeek(first), end: addDays(startOfWeek(last), 7) };
}

export function shiftCalendar(date: Date, view: CalendarView, direction: number): Date {
  if (view === "month") {
    return new Date(date.getFullYear(), date.getMonth() + direction, 1);
  }
  return addDays(date, direction * (view === "week" ? 7 : view === "four" ? 4 : 1));
}

export function daysInRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  for (let date = startOfDay(start); date < end; date = addDays(date, 1)) {
    days.push(date);
  }
  return days;
}

export function appointmentDate(date: string | null, time: string | null): Date | null {
  if (!date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  const result = new Date(year, month - 1, day, hour, minute);
  return toDateKey(result) === date ? result : null;
}

export interface TimedEvent {
  id: string;
  start: Date;
}

export interface PositionedEvent<T extends TimedEvent> {
  event: T;
  top: number;
  column: number;
  columns: number;
}

/** Place 48px visual markers in separate columns without implying a duration. */
export function positionEvents<T extends TimedEvent>(events: T[]): PositionedEvent<T>[] {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id));
  const result: PositionedEvent<T>[] = [];
  let group: PositionedEvent<T>[] = [];
  let ends: number[] = [];
  function flush() {
    for (const item of group) item.columns = ends.length;
    result.push(...group);
    group = [];
    ends = [];
  }
  for (const event of sorted) {
    const top = Math.min(event.start.getHours() * 64 + event.start.getMinutes() * 64 / 60, 1536 - 48);
    if (group.length && ends.every((end) => end <= top)) flush();
    let column = ends.findIndex((end) => end <= top);
    if (column === -1) column = ends.length;
    ends[column] = top + 48;
    group.push({ event, top, column, columns: 1 });
  }
  flush();
  return result;
}
