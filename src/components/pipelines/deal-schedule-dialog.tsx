"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { toDateKey } from "@/lib/schedule-date";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface DealScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  value: string | null | undefined;
  timeValue?: string | null;
  canEdit?: boolean;
  onChange: (dealId: string, scheduledDate: string | null, scheduledTime: string | null) => void;
}

function monthStart(key: string | null | undefined): Date {
  const [year, month] = (key ?? toDateKey(new Date())).split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export function DealScheduleDialog({
  open,
  onOpenChange,
  dealId,
  value,
  timeValue,
  canEdit = true,
  onChange,
}: DealScheduleDialogProps) {
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(() => monthStart(value));
  const [selected, setSelected] = useState<string | null>(value ?? null);
  const [time, setTime] = useState(timeValue?.slice(0, 5) ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(value ?? null);
    setTime(timeValue?.slice(0, 5) ?? "");
    setMonth(monthStart(value));
  }, [open, value, timeValue]);

  const todayKey = toDateKey(new Date());
  const monthLabel = month.toLocaleDateString(locale, { month: "long", year: "numeric" });
  const weekdays = useMemo(() => {
    // 2024-01-07 is a Sunday.
    return Array.from({ length: 7 }, (_, i) =>
      new Date(2024, 0, 7 + i).toLocaleDateString(locale, { weekday: "short" }).replace(".", ""),
    );
  }, [locale]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const blanks = Array.from({ length: first.getDay() }, () => null);
    const days = Array.from({ length: total }, (_, i) =>
      toDateKey(new Date(month.getFullYear(), month.getMonth(), i + 1)),
    );
    return [...blanks, ...days];
  }, [month]);

  function shiftMonth(delta: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  async function save(next: string | null) {
    if (!canEdit || saving) return;
    setSaving(true);
    const nextTime = next ? time || null : null;
    const { error } = await supabase
      .from("deals")
      .update({ scheduled_date: next, scheduled_time: nextTime })
      .eq("id", dealId);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar a data");
      return;
    }
    onChange(dealId, next, nextTime);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Inserir data</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-semibold capitalize">{monthLabel}</span>
          <Button type="button" variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => shiftMonth(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {weekdays.map((day) => (
            <span key={day} className="text-[11px] font-medium capitalize text-muted-foreground">
              {day}
            </span>
          ))}
          {cells.map((key, index) =>
            key ? (
              <button
                key={key}
                type="button"
                disabled={!canEdit}
                onClick={() => setSelected(key)}
                className={`mx-auto flex size-8 items-center justify-center rounded-full text-sm transition-colors ${
                  key === selected
                    ? "bg-blue-600 font-semibold text-white"
                    : key === todayKey
                      ? "font-semibold text-blue-600 ring-1 ring-blue-600/40 hover:bg-muted"
                      : "text-foreground hover:bg-muted"
                }`}
              >
                {Number(key.slice(8))}
              </button>
            ) : (
              <span key={`blank-${index}`} />
            ),
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <label htmlFor="schedule-time" className="text-sm font-medium">
            Horário <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <div className="flex items-center gap-1">
            <input
              id="schedule-time"
              type="time"
              value={time}
              disabled={!canEdit}
              onChange={(event) => setTime(event.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            />
            {time && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setTime("")}>
                Limpar
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            disabled={!canEdit || saving || !value}
            onClick={() => void save(null)}
          >
            Remover
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={!canEdit || saving || !selected}
              onClick={() => void save(selected)}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
