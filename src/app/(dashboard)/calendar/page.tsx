"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarScreen } from "@/components/calendar/calendar-view";

export default function CalendarPage() {
  const t = useTranslations("Calendar");
  const [today, setToday] = useState<Date | null>(null);

  useEffect(() => {
    // The user's local day must be selected in the browser, not at build time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(new Date());
  }, []);

  return today
    ? <CalendarScreen initialDate={today} />
    : <div className="p-6 text-sm text-muted-foreground">{t("loading")}</div>;
}
