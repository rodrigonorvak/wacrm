"use client";

import type { Deal } from "@/types";
import { CalendarDays, ExternalLink, Pencil, Tag } from "lucide-react";
import { useLocale } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type DealCardField = "company" | "phone" | "assignee";

interface DealCardProps {
  deal: Deal;
  entranceDelay?: string;
  visibleFields?: DealCardField[];
  onEdit: (deal: Deal) => void;
  onEditLabels?: (deal: Deal) => void;
  isOverlay?: boolean;
}

export function DealCard({
  deal,
  entranceDelay,
  visibleFields = ["company"],
  onEdit,
  onEditLabels,
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

  const labels = deal.labels ?? [];

  return (
    <div
      style={entranceDelay ? { animationDelay: entranceDelay } : undefined}
      className={`group relative ${
        !isOverlay && entranceDelay
          ? "animate-in fade-in-0 slide-in-from-bottom-1 duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none"
          : ""
      }`}
    >
    {!isOverlay && onEditLabels && (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Editar card"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-md bg-card/90 text-muted-foreground opacity-100 shadow-sm ring-1 ring-border transition-opacity hover:text-foreground lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 data-popup-open:opacity-100"
        >
          <Pencil className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => onEdit(deal)} className="cursor-pointer">
            <ExternalLink className="size-4" />
            Abrir card
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEditLabels(deal)} className="cursor-pointer">
            <Tag className="size-4" />
            Editar etiquetas
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )}
    <button
      type="button"
      onClick={(e) => {
        // `onClick` still fires after a non-drag tap because the PointerSensor
        // requires 5px movement before it counts as a drag.
        if (isOverlay) return;
        e.stopPropagation();
        onEdit(deal);
      }}
      className={`w-full cursor-pointer rounded-md border border-border bg-card px-3 py-2.5 text-left shadow-[0_2px_8px_rgb(15_23_42_/_7%)] transition-colors ${
        isOverlay ? "shadow-lg" : "hover:border-primary/40 hover:bg-muted/30"
      }`}
    >
      {labels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1 pr-7">
          {labels.map((label) => (
            <span
              key={label.id}
              title={label.name || undefined}
              className={`inline-flex h-4 max-w-full items-center rounded-full px-2 text-[10px] font-semibold leading-none text-white ${label.name ? "" : "w-8"}`}
              style={{ backgroundColor: label.color }}
            >
              <span className="truncate">{label.name}</span>
            </span>
          ))}
        </div>
      )}
      <div className={`min-w-0 ${labels.length === 0 ? "pr-7" : ""}`}>
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
    </div>
  );
}
