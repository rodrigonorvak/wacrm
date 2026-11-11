"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { toDateKey } from "@/lib/schedule-date";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScheduleDateTimeFields } from "@/components/ui/schedule-date-time-fields";

interface DealScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  value: string | null | undefined;
  timeValue?: string | null;
  canEdit?: boolean;
  requireTime?: boolean;
  title?: string;
  onSave?: (
    dealId: string,
    scheduledDate: string | null,
    scheduledTime: string | null,
  ) => Promise<boolean>;
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
  requireTime = false,
  title,
  onSave,
  onChange,
}: DealScheduleDialogProps) {
  const t = useTranslations("Pipelines.scheduleDialog");
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

  async function save(next: string | null) {
    if (!canEdit || saving) return;
    const nextTime = next ? time || null : null;
    if (requireTime && !nextTime) return;
    setSaving(true);
    if (onSave) {
      try {
        const saved = await onSave(dealId, next, nextTime);
        setSaving(false);
        if (!saved) return;
        onChange(dealId, next, nextTime);
        onOpenChange(false);
      } catch (error) {
        setSaving(false);
        console.error("Could not save appointment stage move:", error);
        toast.error("Não foi possível agendar e mover o lead");
      }
      return;
    }
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
          <DialogTitle>{title ?? t("title")}</DialogTitle>
        </DialogHeader>
        <ScheduleDateTimeFields
          month={month}
          onMonthChange={setMonth}
          date={selected}
          onDateChange={setSelected}
          time={time}
          onTimeChange={setTime}
          disabled={!canEdit}
          requireTime={requireTime}
        />
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            className="text-muted-foreground"
            disabled={!canEdit || saving || !value || Boolean(onSave) || requireTime}
            onClick={() => void save(null)}
          >
            {t("remove")}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={!canEdit || saving || !selected || (requireTime && !time)}
              onClick={() => void save(selected)}
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {requireTime ? t("saveAndMove") : t("save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
