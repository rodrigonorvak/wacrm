"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { Deal, PipelineStage } from "@/types";
import type { PipelineCardField } from "@/lib/pipelines/card-fields";
import { DealCard } from "./deal-card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

interface PipelineBoardProps {
  stages: PipelineStage[];
  deals: Deal[];
  visibleCardFields: PipelineCardField[];
  onDealMoved: (dealId: string, newStageId: string) => void;
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: Deal) => void;
}

const INITIAL_VISIBLE_DEALS = 6;
const DEALS_PER_REVEAL = 6;

export function PipelineBoard({
  stages,
  deals,
  visibleCardFields,
  onDealMoved,
  onAddDeal,
  onEditDeal,
}: PipelineBoardProps) {
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const stage of sortedStages) map.set(stage.id, []);
    for (const deal of deals) {
      const bucket = map.get(deal.stage_id);
      if (bucket) bucket.push(deal);
    }
    return map;
  }, [sortedStages, deals]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const activeDeal = activeDealId
    ? deals.find((deal) => deal.id === activeDealId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveDealId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDealId(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const targetStageId = String(over.id);
    const deal = deals.find((item) => item.id === dealId);
    if (!deal || deal.stage_id === targetStageId) return;
    if (!sortedStages.some((stage) => stage.id === targetStageId)) return;
    onDealMoved(dealId, targetStageId);
  }

  function handleDragCancel() {
    setActiveDealId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="pipeline-scroll flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 lg:snap-none">
        {sortedStages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            deals={dealsByStage.get(stage.id) ?? []}
            visibleCardFields={visibleCardFields}
            onAddDeal={onAddDeal}
            onEditDeal={onEditDeal}
          />
        ))}
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        }}
      >
        {activeDeal ? (
          <div className="opacity-90">
            <DealCard
              deal={activeDeal}
              visibleFields={visibleCardFields}
              onEdit={() => {}}
              isOverlay
            />
          </div>
        ) : null}
      </DragOverlay>

      <style jsx>{`
        .pipeline-scroll {
          scroll-behavior: smooth;
        }
        @media (hover: none), (pointer: coarse) {
          .pipeline-scroll::-webkit-scrollbar {
            height: 0;
            display: none;
          }
          .pipeline-scroll {
            scrollbar-width: none;
          }
        }
        @media (hover: hover) and (pointer: fine) {
          .pipeline-scroll {
            scrollbar-width: thin;
            scrollbar-color: var(--border) transparent;
          }
          .pipeline-scroll::-webkit-scrollbar {
            height: 8px;
          }
          .pipeline-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .pipeline-scroll::-webkit-scrollbar-thumb {
            background-color: var(--border);
            border-radius: 9999px;
          }
          .pipeline-scroll::-webkit-scrollbar-thumb:hover {
            background-color: var(--muted-foreground);
          }
        }
      `}</style>
    </DndContext>
  );
}

function StageColumn({
  stage,
  deals,
  visibleCardFields,
  onAddDeal,
  onEditDeal,
}: {
  stage: PipelineStage;
  deals: Deal[];
  visibleCardFields: PipelineCardField[];
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: Deal) => void;
}) {
  const t = useTranslations("Pipelines.board");
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_DEALS);
  const visibleDeals = deals.slice(0, visibleCount);
  const hiddenCount = deals.length - visibleDeals.length;

  return (
    <section className="flex w-[84vw] min-w-[250px] max-w-[320px] shrink-0 snap-start flex-col rounded-xl border border-border bg-card p-3 shadow-[0_3px_10px_rgb(15_23_42_/_7%)] sm:p-4 lg:w-[205px] lg:min-w-[190px] lg:max-w-[250px] lg:flex-1 lg:basis-[205px] lg:snap-none">
      <header className="flex items-center justify-between gap-2 border-b border-border pb-3">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {stage.name}
        </h3>
        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {deals.length}
        </span>
      </header>

      <div
        ref={setNodeRef}
        className={`mt-3 flex flex-1 flex-col gap-2 rounded-lg transition-colors ${
          isOver ? "bg-primary/5 outline outline-2 outline-dashed outline-primary outline-offset-2" : ""
        }`}
      >
        {deals.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border py-8 text-xs text-muted-foreground">
            {t("dropDealHere")}
          </div>
        ) : (
          visibleDeals.map((deal) => (
            <DraggableDealCard
              key={deal.id}
              deal={deal}
              visibleCardFields={visibleCardFields}
              onEdit={onEditDeal}
            />
          ))
        )}
      </div>

      {hiddenCount > 0 || visibleCount > INITIAL_VISIBLE_DEALS ? (
        <div className="mt-2 flex min-h-7 items-center justify-between gap-2 px-1 text-xs">
          {hiddenCount > 0 ? (
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + DEALS_PER_REVEAL)}
              className="min-w-0 truncate text-left font-medium text-primary hover:underline"
            >
              {t("showMore", { count: hiddenCount })}
            </button>
          ) : <span />}
          {visibleCount > INITIAL_VISIBLE_DEALS && (
            <button
              type="button"
              onClick={() => setVisibleCount(INITIAL_VISIBLE_DEALS)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              {t("showLess")}
            </button>
          )}
        </div>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onAddDeal(stage.id)}
        className="mt-2 w-full justify-start border border-dashed border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Plus className="mr-1 h-3 w-3" />
        {t("addDeal")}
      </Button>
    </section>
  );
}

function DraggableDealCard({
  deal,
  visibleCardFields,
  onEdit,
}: {
  deal: Deal;
  visibleCardFields: PipelineCardField[];
  onEdit: (deal: Deal) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isDragging ? 0.3 : 1, touchAction: "none" }}
    >
      <DealCard deal={deal} visibleFields={visibleCardFields} onEdit={onEdit} />
    </div>
  );
}
