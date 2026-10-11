"use client";

import { CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Deal, PipelineStage } from "@/types";
import type { PipelineCardField } from "@/lib/pipelines/card-fields";

interface PipelineListProps {
  stages: PipelineStage[];
  deals: Deal[];
  visibleCardFields: PipelineCardField[];
  onEditDeal: (deal: Deal) => void;
}

export function PipelineList({
  stages,
  deals,
  visibleCardFields,
  onEditDeal,
}: PipelineListProps) {
  const locale = useLocale();
  const t = useTranslations("Pipelines.list");
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));

  function getDetails(deal: Deal): string[] {
    return visibleCardFields.flatMap((field) => {
      if (field === "company" && deal.contact?.company) return [deal.contact.company];
      if (field === "phone" && deal.contact?.phone) return [deal.contact.phone];
      if (field === "assignee" && deal.assignee?.full_name) return [deal.assignee.full_name];
      return [];
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(140px,0.45fr)_120px] gap-3 border-b border-border bg-muted/70 px-4 py-3 text-xs font-semibold text-muted-foreground sm:grid">
        <span>{t("deal")}</span>
        <span>{t("stage")}</span>
        <span>{t("createdAt")}</span>
      </div>
      {deals.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {deals.map((deal) => {
            const stage = stageById.get(deal.stage_id);
            const createdAt = new Date(deal.created_at);
            const dateLabel = Number.isNaN(createdAt.getTime())
              ? null
              : createdAt.toLocaleDateString(locale, {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                });
            const details = getDetails(deal);

            return (
              <li key={deal.id}>
                <button
                  type="button"
                  onClick={() => onEditDeal(deal)}
                  className="grid w-full grid-cols-1 gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:grid-cols-[minmax(0,1fr)_minmax(140px,0.45fr)_120px] sm:items-center sm:gap-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {deal.title}
                    </span>
                    {details.length > 0 && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {details.join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <span className="sm:hidden">{t("stage")}:</span>
                    {stage?.color ? (
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                    ) : null}
                    <span className="truncate">{stage?.name ?? "—"}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="sm:hidden">{t("createdAt")}:</span>
                    {dateLabel && <CalendarDays className="size-3.5 shrink-0" />}
                    {dateLabel ?? "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
