"use client";

import { useId, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toDateKey } from "@/lib/schedule-date";
import { Button } from "@/components/ui/button";

interface ScheduleDateTimeFieldsProps {
  month: Date;
  onMonthChange: (month: Date) => void;
  date: string | null;
  onDateChange: (date: string) => void;
  time: string;
  onTimeChange: (time: string) => void;
  disabled?: boolean;
  requireTime?: boolean;
}

export function ScheduleDateTimeFields({
  month, onMonthChange, date, onDateChange, time, onTimeChange,
  disabled = false, requireTime = false,
}: ScheduleDateTimeFieldsProps) {
  const locale = useLocale();
  const t = useTranslations("Pipelines.scheduleDialog");
  const timeId = useId();
  const todayKey = toDateKey(new Date());
  const monthLabel = month.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: "short" }).replace(".", ""),
  ), [locale]);
  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [
      ...Array.from({ length: first.getDay() }, () => null),
      ...Array.from({ length: total }, (_, i) => toDateKey(new Date(month.getFullYear(), month.getMonth(), i + 1))),
    ];
  }, [month]);

  function shiftMonth(delta: number) {
    onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon" aria-label={t("previousMonth")} onClick={() => shiftMonth(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-sm font-semibold capitalize">{monthLabel}</span>
        <Button type="button" variant="ghost" size="icon" aria-label={t("nextMonth")} onClick={() => shiftMonth(1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {weekdays.map((day) => (
          <span key={day} className="text-[11px] font-medium capitalize text-muted-foreground">{day}</span>
        ))}
        {cells.map((key, index) => key ? (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onDateChange(key)}
            aria-label={new Date(month.getFullYear(), month.getMonth(), Number(key.slice(8))).toLocaleDateString(locale, { dateStyle: "full" })}
            aria-pressed={key === date}
            className={`mx-auto flex size-8 items-center justify-center rounded-full text-sm transition-colors ${
              key === date
                ? "bg-blue-600 font-semibold text-white"
                : key === todayKey
                  ? "font-semibold text-blue-600 ring-1 ring-blue-600/40 hover:bg-muted"
                  : "text-foreground hover:bg-muted"
            }`}
          >
            {Number(key.slice(8))}
          </button>
        ) : <span key={`blank-${index}`} />)}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <label htmlFor={timeId} className="text-sm font-medium">
          {t("time")} <span className="font-normal text-muted-foreground">{requireTime ? t("required") : t("optional")}</span>
        </label>
        <div className="flex items-center gap-1">
          <input
            id={timeId}
            type="time"
            value={time}
            disabled={disabled}
            onChange={(event) => onTimeChange(event.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          />
          {time && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onTimeChange("")}>
              {t("clear")}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
