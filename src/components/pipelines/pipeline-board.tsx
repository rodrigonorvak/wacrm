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
import { PIPELINE_STAGE_TYPES, type PipelineStageType } from "@/lib/pipelines/stage-type";
import type { PipelineCardField } from "@/lib/pipelines/card-fields";
import { PIPELINE_STAGE_COLOR_OPTIONS, PIPELINE_STAGE_NO_COLOR } from "@/lib/pipelines/stage-colors";
import { DealCard } from "./deal-card";
import { Button } from "@/components/ui/button";
import {
  Check,
  CircleSlash2,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useTranslations } from "next-intl";
import { useScheduledContacts } from "@/hooks/use-scheduled-contacts";
import { isFollowUpDueToday, isScheduledDateToday } from "@/lib/pipelines/follow-up";
import { compareBoardDeals } from "@/lib/pipelines/date-filter";

interface PipelineBoardProps {
  stages: PipelineStage[];
  deals: Deal[];
  visibleCardFields: PipelineCardField[];
  canEditStageColors: boolean;
  onStageColorChange: (stageId: string, color: string) => void;
  onStageTypeChange: (stageId: string, stageType: PipelineStageType) => void;
  onPaidLeadsOnlyChange?: (stageId: string, paidLeadsOnly: boolean) => void;
  onDealMoved: (dealId: string, newStageId: string) => void;
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: Deal) => void;
  onEditLabels?: (deal: Deal) => void;
  onEditSchedule?: (deal: Deal) => void;
  onDismissAttention?: (deal: Deal) => void;
}

const INITIAL_VISIBLE_DEALS = 6;
const DEALS_PER_REVEAL = 6;

export function PipelineBoard({
  stages,
  deals,
  visibleCardFields,
  canEditStageColors,
  onStageColorChange,
  onStageTypeChange,
  onPaidLeadsOnlyChange,
  onDealMoved,
  onAddDeal,
  onEditDeal,
  onEditLabels,
  onEditSchedule,
  onDismissAttention,
}: PipelineBoardProps) {
  const [activeDealId, setActiveDealId] = useState<string | null>(null);
  const scheduledContacts = useScheduledContacts();

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.position - b.position),
    [stages],
  );

  const dealsByStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const stage of sortedStages) map.set(stage.id, []);
    for (const deal of deals) {
      const stage = sortedStages.find((item) => item.id === deal.stage_id);
      if (!stage) continue;
      if (stage.paid_leads_only && !deal.contact?.has_ad_referral) continue;
      const bucket = map.get(deal.stage_id);
      if (bucket) bucket.push(deal);
    }
    for (const stage of sortedStages) {
      const bucket = map.get(stage.id);
      if (!bucket) continue;
      bucket.sort((a, b) =>
        compareBoardDeals(
          {
            created_at: a.created_at,
            updated_at: a.updated_at,
            needs_attention: a.needs_attention,
            scheduled_date: a.scheduled_date,
            scheduled_time: a.scheduled_time,
            scheduled_due: isScheduledDateToday(a.scheduled_date),
            follow_up_due: isFollowUpDueToday(stage.stage_type, a.scheduled_date),
          },
          {
            created_at: b.created_at,
            updated_at: b.updated_at,
            needs_attention: b.needs_attention,
            scheduled_date: b.scheduled_date,
            scheduled_time: b.scheduled_time,
            scheduled_due: isScheduledDateToday(b.scheduled_date),
            follow_up_due: isFollowUpDueToday(stage.stage_type, b.scheduled_date),
          },
        ),
      );
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
            canEditStageColors={canEditStageColors}
            onStageColorChange={onStageColorChange}
            onStageTypeChange={onStageTypeChange}
            onPaidLeadsOnlyChange={onPaidLeadsOnlyChange}
            onAddDeal={onAddDeal}
            onEditDeal={onEditDeal}
            onEditLabels={onEditLabels}
            onEditSchedule={onEditSchedule}
            onDismissAttention={onDismissAttention}
            scheduledContacts={scheduledContacts}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDeal ? (
          <div className="opacity-90">
            <DealCard
              deal={activeDeal}
              visibleFields={visibleCardFields}
              onEdit={() => {}}
              isOverlay
              hasScheduledMessage={!!activeDeal.contact_id && scheduledContacts.has(activeDeal.contact_id)}
              scheduledDue={isScheduledDateToday(activeDeal.scheduled_date)}
              followUpDue={isFollowUpDueToday(
                sortedStages.find((stage) => stage.id === activeDeal.stage_id)?.stage_type,
                activeDeal.scheduled_date,
              )}
            />
          </div>
        ) : null}
      </DragOverlay>

      <style jsx>{`
        .pipeline-scroll {
          scroll-behavior: auto;
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
  canEditStageColors,
  onStageColorChange,
  onStageTypeChange,
  onPaidLeadsOnlyChange,
  onAddDeal,
  onEditDeal,
  onEditLabels,
  onEditSchedule,
  onDismissAttention,
  scheduledContacts,
}: {
  stage: PipelineStage;
  deals: Deal[];
  visibleCardFields: PipelineCardField[];
  canEditStageColors: boolean;
  onStageColorChange: (stageId: string, color: string) => void;
  onStageTypeChange: (stageId: string, stageType: PipelineStageType) => void;
  onPaidLeadsOnlyChange?: (stageId: string, paidLeadsOnly: boolean) => void;
  onAddDeal: (stageId: string) => void;
  onEditDeal: (deal: Deal) => void;
  onEditLabels?: (deal: Deal) => void;
  onEditSchedule?: (deal: Deal) => void;
  onDismissAttention?: (deal: Deal) => void;
  scheduledContacts: Set<string>;
}) {
  const t = useTranslations("Pipelines.board");
  const tStageType = useTranslations("Pipelines.stageTypes");
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_DEALS);
  const visibleDeals = deals.slice(0, visibleCount);
  const hiddenCount = deals.length - visibleDeals.length;
  const isLeadColumn = (stage.stage_type ?? "other") === "lead";

  return (
    <section className="flex w-[84vw] min-w-[250px] max-w-[320px] shrink-0 snap-start flex-col rounded-2xl bg-white/70 p-3 sm:p-4 lg:w-[205px] lg:min-w-[190px] lg:max-w-[250px] lg:flex-1 lg:basis-[205px] lg:snap-none">
      <header
        className="-mx-3 -mt-3 mb-3 flex items-center justify-between gap-2 rounded-t-xl border-b border-border px-3 py-3 sm:-mx-4 sm:-mt-4 sm:px-4"
        style={stage.color ? { backgroundColor: `${stage.color}14` } : undefined}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: stage.color || "transparent" }}
          />
          <h3 className="min-w-0 break-words text-sm font-semibold text-foreground">
            {stage.name}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-md bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {deals.length}
          </span>
          {canEditStageColors && (
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t("columnSettings", { stage: stage.name })}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="cursor-pointer">
                    {t("columnType")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    {PIPELINE_STAGE_TYPES.map((type) => (
                      <DropdownMenuItem
                        key={type}
                        onClick={() => onStageTypeChange(stage.id, type)}
                        className="cursor-pointer"
                      >
                        {tStageType(type)}
                        {type === (stage.stage_type ?? "other") && (
                          <Check className="ml-auto size-4 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="cursor-pointer">
                    {t("columnColor")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    <div className="grid grid-cols-5 gap-1 p-1">
                      {PIPELINE_STAGE_COLOR_OPTIONS.map(({ name, value }) => (
                        <DropdownMenuItem
                          key={value}
                          aria-label={t("selectColumnColor", { color: t(`colors.${name}`) })}
                          title={t(`colors.${name}`)}
                          onClick={() => onStageColorChange(stage.id, value)}
                          className="flex size-7 cursor-pointer items-center justify-center p-0 focus:bg-muted"
                        >
                          <span
                            className="size-4 rounded-full border border-black/10"
                            style={{ backgroundColor: value }}
                          />
                        </DropdownMenuItem>
                      ))}
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onStageColorChange(stage.id, PIPELINE_STAGE_NO_COLOR)}
                      className="cursor-pointer"
                    >
                      <CircleSlash2 className="size-4" />
                      {t("noColumnColor")}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {isLeadColumn && onPaidLeadsOnlyChange && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      <div
                        className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-1.5 py-1.5 text-sm outline-hidden select-none"
                        onClick={(event) => {
                          event.preventDefault();
                          onPaidLeadsOnlyChange(stage.id, !stage.paid_leads_only);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onPaidLeadsOnlyChange(stage.id, !stage.paid_leads_only);
                          }
                        }}
                        role="menuitemcheckbox"
                        aria-checked={Boolean(stage.paid_leads_only)}
                        tabIndex={0}
                      >
                        <span className="min-w-0 flex-1">{t("paidLeadsOnly")}</span>
                        <Switch
                          checked={Boolean(stage.paid_leads_only)}
                          onCheckedChange={(checked) =>
                            onPaidLeadsOnlyChange(stage.id, checked)
                          }
                          onClick={(event) => event.stopPropagation()}
                          aria-label={t("paidLeadsOnly")}
                        />
                      </div>
                    </DropdownMenuGroup>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
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
              onEditLabels={onEditLabels}
              onEditSchedule={onEditSchedule}
              onDismissAttention={onDismissAttention}
              hasScheduledMessage={!!deal.contact_id && scheduledContacts.has(deal.contact_id)}
              scheduledDue={isScheduledDateToday(deal.scheduled_date)}
              followUpDue={isFollowUpDueToday(stage.stage_type, deal.scheduled_date)}
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
  onEditLabels,
  onEditSchedule,
  onDismissAttention,
  hasScheduledMessage,
  scheduledDue,
  followUpDue,
}: {
  deal: Deal;
  visibleCardFields: PipelineCardField[];
  onEdit: (deal: Deal) => void;
  onEditLabels?: (deal: Deal) => void;
  onEditSchedule?: (deal: Deal) => void;
  onDismissAttention?: (deal: Deal) => void;
  hasScheduledMessage: boolean;
  scheduledDue: boolean;
  followUpDue: boolean;
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
      <DealCard
        deal={deal}
        visibleFields={visibleCardFields}
        onEdit={onEdit}
        onEditLabels={onEditLabels}
        onEditSchedule={onEditSchedule}
        onDismissAttention={onDismissAttention}
        hasScheduledMessage={hasScheduledMessage}
        scheduledDue={scheduledDue}
        followUpDue={followUpDue}
      />
    </div>
  );
}
