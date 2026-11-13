"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { toDateKey } from "@/lib/schedule-date";
import { loadCalendar, type CalendarEvent, type PipelineOption } from "@/lib/calendar/load-calendar";
import { filterCalendarEvents } from "@/lib/calendar/filter-events";
import {
  addDays,
  calendarRange,
  daysInRange,
  positionEvents,
  shiftCalendar,
  startOfWeek,
  type CalendarView,
} from "@/lib/calendar/calendar";
import { cn } from "@/lib/utils";

function MiniCalendar({ date, selected, onSelect, locale, t }: {
  date: Date;
  selected: Date;
  onSelect: (date: Date) => void;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [month, setMonth] = useState(() => new Date(date.getFullYear(), date.getMonth(), 1));
  useEffect(() => {
    // Keep the mini calendar in sync when the main calendar navigates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }, [date]);
  const firstDay = startOfWeek(month);
  const days = daysInRange(firstDay, addDays(firstDay, 42));
  const todayKey = toDateKey(new Date());
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold capitalize">
          {month.toLocaleDateString(locale, { month: "long", year: "numeric" })}
        </span>
        <div className="flex">
          <button type="button" aria-label={t("previousMonth")} className="rounded-full p-1 hover:bg-muted" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="size-4" /></button>
          <button type="button" aria-label={t("nextMonth")} className="rounded-full p-1 hover:bg-muted" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-xs">
        {days.slice(0, 7).map((day) => (
          <span key={toDateKey(day)} className="py-1 text-muted-foreground">
            {day.toLocaleDateString(locale, { weekday: "narrow" })}
          </span>
        ))}
        {days.map((day) => {
          const key = toDateKey(day);
          return (
            <button key={key} type="button" onClick={() => onSelect(day)}
              aria-label={day.toLocaleDateString(locale, { dateStyle: "full" })}
              aria-pressed={key === toDateKey(selected)}
              className={cn("mx-auto flex size-8 items-center justify-center rounded-full hover:bg-muted",
                day.getMonth() !== month.getMonth() && "text-muted-foreground",
                key === todayKey && "font-bold text-blue-600",
                key === toDateKey(selected) && "bg-blue-600 text-white hover:bg-blue-700")}>
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventContent({ event, locale, noName, statusLabel }: { event: CalendarEvent; locale: string; noName: string; statusLabel?: string }) {
  return (
    <>
      <span className="block truncate font-semibold">{event.start.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} · {event.name || noName}</span>
      <span className="block truncate">{event.subtitle}{statusLabel ? ` · ${statusLabel}` : ""}{event.labels.map((label) => (
        <span key={label.id} className="ml-1 inline-flex items-center gap-1">
          <span className="size-2 rounded-full border border-white/60" style={{ backgroundColor: label.color }} />{label.name}
        </span>
      ))}</span>
    </>
  );
}

export function CalendarScreen({ initialDate }: { initialDate: Date }) {
  const t = useTranslations("Calendar");
  const locale = useLocale();
  const { accountId } = useAuth();
  const [date, setDate] = useState(initialDate);
  const [view, setView] = useState<CalendarView>("four");
  const [pipeline, setPipeline] = useState("all");
  const [search, setSearch] = useState("");
  const [showDeals, setShowDeals] = useState(true);
  const [showMessages, setShowMessages] = useState(false);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const range = useMemo(() => calendarRange(date, view), [date, view]);
  const startKey = toDateKey(range.start);
  const endKey = toDateKey(range.end);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    // Hide stale results while the selected period is loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(false);
    const start = new Date(`${startKey}T00:00:00`);
    const end = new Date(`${endKey}T00:00:00`);
    void loadCalendar(accountId, start, end).then((result) => {
      if (cancelled) return;
      setPipelines(result.pipelines);
      setEvents(result.events);
      setError(false);
    }).catch((err: unknown) => {
      if (cancelled) return;
      console.error("Failed to load calendar:", err);
      setEvents([]);
      setError(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [accountId, startKey, endKey, refresh]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * 64;
  }, [view, loading]);

  const reload = useCallback(() => {
    setLoading(true);
    setRefresh((value) => value + 1);
  }, []);
  useEffect(() => {
    window.addEventListener("scheduled-messages-changed", reload);
    window.addEventListener("focus", reload);
    return () => {
      window.removeEventListener("scheduled-messages-changed", reload);
      window.removeEventListener("focus", reload);
    };
  }, [reload]);
  const days = useMemo(() => daysInRange(range.start, range.end), [range]);
  const visibleEvents = useMemo(() => {
    return filterCalendarEvents(events, { showDeals, showMessages, pipeline, search, locale });
  }, [events, locale, pipeline, search, showDeals, showMessages]);

  const eventNode = (event: CalendarEvent, className: string, style?: React.CSSProperties) => {
    const statusLabel = event.messageStatus === "processing"
      ? t("processing") : event.messageStatus === "uncertain" ? t("uncertain") : undefined;
    const content = <EventContent event={event} locale={locale} noName={t("noName")} statusLabel={statusLabel} />;
    const common = cn("overflow-hidden rounded-md px-2 py-1 text-left text-xs leading-4 text-white shadow-sm",
      event.kind === "deal" ? "bg-blue-600 hover:bg-blue-700" : "bg-violet-600 hover:bg-violet-700", className);
    return event.kind === "deal"
      ? <Link key={event.id} href={`/pipelines/${event.id}?return=calendar`} className={common} style={style} title={`${event.name} · ${event.subtitle} · ${event.labels.map((label) => label.name).join(", ")}`}>{content}</Link>
      : <div key={event.id} className={common} style={style} title={`${t("message")}: ${event.subtitle}`}>{content}</div>;
  };

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col rounded-2xl border border-border bg-background text-foreground">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 sm:px-5">
        <h2 className="mr-3 text-xl font-semibold">{t("title")}</h2>
        <button type="button" onClick={() => setDate(new Date())} className="rounded-full border border-border px-4 py-1.5 text-sm hover:bg-muted">{t("today")}</button>
        <button type="button" aria-label={t("previous")} onClick={() => setDate(shiftCalendar(date, view, -1))} className="rounded-full p-2 hover:bg-muted"><ChevronLeft className="size-4" /></button>
        <button type="button" aria-label={t("next")} onClick={() => setDate(shiftCalendar(date, view, 1))} className="rounded-full p-2 hover:bg-muted"><ChevronRight className="size-4" /></button>
        <span className="min-w-36 flex-1 text-lg capitalize">{date.toLocaleDateString(locale, { month: "long", year: "numeric" })}</span>
        <label className="sr-only" htmlFor="calendar-view">{t("view")}</label>
        <select id="calendar-view" value={view} onChange={(event) => setView(event.target.value as CalendarView)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          {(["day", "four", "week", "month"] as const).map((value) => <option key={value} value={value}>{t(value)}</option>)}
        </select>
        <button type="button" onClick={reload} aria-label={t("retry")} className="rounded-full p-2 hover:bg-muted"><RefreshCw className="size-4" /></button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="w-full shrink-0 space-y-5 border-b border-border p-4 lg:w-64 lg:border-b-0 lg:border-r">
          <MiniCalendar date={date} selected={date} onSelect={setDate} locale={locale} t={t} />
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{t("filters")}</h3>
            <label className="relative block">
              <span className="sr-only">{t("search")}</span>
              <Search className="absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("search")} className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-2 text-sm" />
            </label>
            <label className="block text-xs text-muted-foreground">{t("pipeline")}
              <select value={pipeline} onChange={(event) => setPipeline(event.target.value)} className="mt-1 w-full rounded-md border border-border bg-background p-2 text-sm text-foreground">
                <option value="all">{t("allPipelines")}</option>
                {pipelines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showDeals} onChange={(event) => setShowDeals(event.target.checked)} className="accent-blue-600" />{t("appointments")}</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showMessages} onChange={(event) => setShowMessages(event.target.checked)} className="accent-violet-600" />{t("scheduledMessages")}</label>
            <p className="text-xs text-muted-foreground">{t("noTime")}</p>
          </div>
        </aside>
        <section className="min-w-0 flex-1" aria-busy={loading}>
          {error ? (
            <div role="alert" className="p-6 text-sm text-destructive">{t("loadError")} <button type="button" onClick={reload} className="underline">{t("retry")}</button></div>
          ) : loading ? (
            <div className="p-6 text-sm text-muted-foreground">{t("loading")}</div>
          ) : (
            <>
              {visibleEvents.length === 0 && <p className="px-4 pt-3 text-xs text-muted-foreground">{t("empty")}</p>}
              {view === "month" ? (
                <div className="overflow-x-auto">
                  <div className="grid min-w-[700px] grid-cols-7">
                    {days.slice(0, 7).map((day) => <div key={toDateKey(day)} className="border-b border-border py-3 text-center text-xs uppercase text-muted-foreground">{day.toLocaleDateString(locale, { weekday: "short" })}</div>)}
                    {days.map((day) => {
                      const dayEvents = visibleEvents.filter((event) => toDateKey(event.start) === toDateKey(day)).sort((a, b) => a.start.getTime() - b.start.getTime());
                      return <div key={toDateKey(day)} className={cn("min-h-28 space-y-1 border-b border-r border-border p-1", day.getMonth() !== date.getMonth() && "bg-muted/30")}>
                        <button type="button" onClick={() => { setDate(day); setView("day"); }} className={cn("mx-auto flex size-7 items-center justify-center rounded-full text-sm", toDateKey(day) === toDateKey(new Date()) && "bg-blue-600 text-white")}>{day.getDate()}</button>
                        {dayEvents.map((event) => eventNode(event, "block w-full"))}
                      </div>;
                    })}
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[700px]">
                    <div className="flex border-b border-border">
                      <div className="w-16 shrink-0 self-end pb-2 text-center text-[10px] text-muted-foreground">{t("timeZone")}</div>
                      {days.map((day) => <div key={toDateKey(day)} className="flex-1 border-l border-border py-2 text-center">
                        <div className="text-xs uppercase text-muted-foreground">{day.toLocaleDateString(locale, { weekday: "short" })}</div>
                        <button type="button" onClick={() => { setDate(day); setView("day"); }} className={cn("mt-1 inline-flex size-9 items-center justify-center rounded-full text-xl", toDateKey(day) === toDateKey(new Date()) && "bg-blue-600 text-white")}>{day.getDate()}</button>
                      </div>)}
                    </div>
                    <div ref={scrollRef} className="max-h-[min(70vh,900px)] overflow-y-auto">
                      <div className="flex">
                        <div className="w-16 shrink-0">
                          {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="relative h-16 text-right text-[10px] text-muted-foreground"><span className="relative -top-2 pr-2">{String(hour).padStart(2, "0")}:00</span></div>)}
                        </div>
                        {days.map((day) => {
                          const dayEvents = visibleEvents.filter((event) => toDateKey(event.start) === toDateKey(day));
                          return <div key={toDateKey(day)} className="relative h-[1536px] flex-1 border-l border-border">
                            {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="h-16 border-t border-border" />)}
                            {positionEvents(dayEvents).map(({ event, top, column, columns }) => eventNode(event, "absolute h-12", {
                              top, left: `${column * 100 / columns}%`, width: `${100 / columns}%`,
                            }))}
                          </div>;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
