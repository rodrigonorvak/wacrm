'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale } from 'next-intl';

interface SchedulePickerProps {
  value: Date | null;
  onChange: (value: Date) => void;
  minDate: Date;
  disabled?: boolean;
}

const selectClass =
  'h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-blue-500 disabled:opacity-50';

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function SchedulePicker({
  value,
  onChange,
  minDate,
  disabled,
}: SchedulePickerProps) {
  const locale = useLocale();
  const base = value ?? minDate;
  const [view, setView] = useState({
    year: base.getFullYear(),
    month: base.getMonth(),
  });

  const monthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, month) =>
        new Intl.DateTimeFormat(locale, { month: 'short' }).format(
          new Date(2024, month, 1)
        )
      ),
    [locale]
  );
  const weekdayNames = useMemo(
    () =>
      Array.from({ length: 7 }, (_, day) =>
        new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(
          new Date(2024, 0, 7 + day)
        )
      ),
    [locale]
  );

  const years = Array.from(
    { length: 3 },
    (_, index) => minDate.getFullYear() + index
  );
  const firstWeekday = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const hour = value?.getHours() ?? minDate.getHours();
  const minute = value?.getMinutes() ?? minDate.getMinutes();
  const minDay = startOfDay(minDate).getTime();

  function emit(next: Date) {
    // Never let the time selects land before the minimum allowed moment.
    onChange(next.getTime() < minDate.getTime() ? new Date(minDate) : next);
  }

  function pickDay(day: number) {
    emit(new Date(view.year, view.month, day, hour, minute));
  }

  function shiftMonth(delta: number) {
    const target = new Date(view.year, view.month + delta, 1);
    setView({ year: target.getFullYear(), month: target.getMonth() });
  }

  const selectedDay = value ? startOfDay(value).getTime() : null;

  return (
    <div className="w-full max-w-xs rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Mês anterior"
          disabled={disabled}
          onClick={() => shiftMonth(-1)}
          className="grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>
        <select
          aria-label="Mês"
          className={`${selectClass} flex-1`}
          value={view.month}
          disabled={disabled}
          onChange={(event) =>
            setView((current) => ({
              ...current,
              month: Number(event.target.value),
            }))
          }
        >
          {monthNames.map((label, month) => (
            <option key={label + month} value={month}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Ano"
          className={selectClass}
          value={view.year}
          disabled={disabled}
          onChange={(event) =>
            setView((current) => ({
              ...current,
              year: Number(event.target.value),
            }))
          }
        >
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Próximo mês"
          disabled={disabled}
          onClick={() => shiftMonth(1)}
          className="grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center text-[11px] font-medium text-slate-400">
        {weekdayNames.map((label, index) => (
          <span key={`${label}-${index}`}>{label}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1 text-center text-sm">
        {cells.map((day, index) => {
          if (day === null) return <span key={`blank-${index}`} />;
          const dayTime = new Date(view.year, view.month, day).getTime();
          const isPast = dayTime < minDay;
          const isSelected = selectedDay === dayTime;
          return (
            <button
              key={day}
              type="button"
              disabled={disabled || isPast}
              onClick={() => pickDay(day)}
              className={`mx-auto grid size-8 place-items-center rounded-md ${
                isSelected
                  ? 'bg-blue-600 font-semibold text-white'
                  : isPast
                    ? 'text-slate-300'
                    : 'text-slate-800 hover:bg-slate-100'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2 border-t border-slate-100 pt-3">
        <select
          aria-label="Hora"
          className={selectClass}
          value={hour}
          disabled={disabled || !value}
          onChange={(event) =>
            value &&
            emit(
              new Date(
                value.getFullYear(),
                value.getMonth(),
                value.getDate(),
                Number(event.target.value),
                minute
              )
            )
          }
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')}
            </option>
          ))}
        </select>
        <span className="text-slate-500">:</span>
        <select
          aria-label="Minuto"
          className={selectClass}
          value={minute}
          disabled={disabled || !value}
          onChange={(event) =>
            value &&
            emit(
              new Date(
                value.getFullYear(),
                value.getMonth(),
                value.getDate(),
                hour,
                Number(event.target.value)
              )
            )
          }
        >
          {Array.from({ length: 60 }, (_, m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, '0')}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
