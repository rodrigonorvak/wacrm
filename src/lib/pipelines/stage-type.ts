export const PIPELINE_STAGE_TYPES = ["other", "lead", "schedule", "purchase"] as const;

export type PipelineStageType = (typeof PIPELINE_STAGE_TYPES)[number];
export type MetaStageEventName = "Lead" | "Schedule" | "Purchase";

const META_EVENT_BY_STAGE_TYPE: Record<PipelineStageType, MetaStageEventName | null> = {
  other: null,
  lead: "Lead",
  schedule: "Schedule",
  purchase: "Purchase",
};

export function getMetaEventForStageType(
  stageType: PipelineStageType | null | undefined,
): MetaStageEventName | null {
  return stageType ? META_EVENT_BY_STAGE_TYPE[stageType] : null;
}
