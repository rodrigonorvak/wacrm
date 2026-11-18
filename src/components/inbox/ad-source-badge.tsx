"use client";

import { Target } from "lucide-react";
import { useTranslations } from "next-intl";

export function AdSourceBadge() {
  const t = useTranslations("AdSource");
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-slate-600 dark:bg-slate-800 dark:text-slate-200">
      <Target className="size-3 shrink-0" aria-hidden="true" />
      {t("advertisement")}
    </span>
  );
}
