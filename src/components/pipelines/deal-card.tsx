"use client";

import type { Deal } from "@/types";
import { CalendarDays } from "lucide-react";
import { useLocale } from "next-intl";

export type DealCardField = "company" | "phone" | "assignee";

interface DealCardProps {
  deal: Deal;
  visibleFields?: DealCardField[];
  onEdit: (deal: Deal) => void;
  isOverlay?: boolean;
}

export function DealCard({
  deal,
  visibleFields = ["company"],
  onEdit,
  isOverlay,
}: DealCardProps) {
  const locale = useLocale();
  const createdAt = new Date(deal.created_at);
  const createdAtLabel = Number.isNaN(createdAt.getTime())
    ? null
    : createdAt.toLocaleDateString(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
  const details = visibleFields.flatMap((field) => {
    if (field === "company" && deal.contact?.company) return [deal.contact.company];
    if (field === "phone" && deal.contact?.phone) return [deal.contact.phone];
    if (field === "assignee" && deal.assignee?.full_name) return [deal.assignee.full_name];
    return [];
  });

  return (
    <button
      type="button"
      onClick={(e) => {
        // `onClick` still fires after a non-drag tap because the PointerSensor
        // requires 5px movement before it counts as a drag.
        if (isOverlay) return;
        e.stopPropagation();
        onEdit(deal);
      }}
      className={`group w-full cursor-pointer rounded-md border border-border bg-card px-3 py-2.5 text-left shadow-[0_2px_8px_rgb(15_23_42_/_7%)] transition-colors ${
        isOverlay
          ? "shadow-lg"
          : "hover:border-primary/40 hover:bg-muted/30"
      }`}
    >
      <div className="min-w-0">
        <h4 className="truncate text-sm font-semibold leading-snug text-foreground">
          {deal.title}
        </h4>
      </div>
      {details.map((detail, index) => (
        <p key={`${index}-${detail}`} className="mt-1 truncate text-xs text-muted-foreground">
          {detail}
        </p>
      ))}
      {createdAtLabel && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
          <CalendarDays className="size-3.5 shrink-0" />
          <time dateTime={deal.created_at}>{createdAtLabel}</time>
        </div>
      )}
    </button>
  );
}
