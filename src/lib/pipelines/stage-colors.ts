export const PIPELINE_STAGE_COLOR_OPTIONS = [
  { name: "blue", value: "#3b82f6" },
  { name: "indigo", value: "#6366f1" },
  { name: "violet", value: "#8b5cf6" },
  { name: "pink", value: "#ec4899" },
  { name: "rose", value: "#f43f5e" },
  { name: "orange", value: "#f97316" },
  { name: "yellow", value: "#eab308" },
  { name: "green", value: "#22c55e" },
  { name: "teal", value: "#14b8a6" },
  { name: "cyan", value: "#06b6d4" },
] as const;

export const PIPELINE_STAGE_COLORS = PIPELINE_STAGE_COLOR_OPTIONS.map((option) => option.value);
export const PIPELINE_STAGE_NO_COLOR = "";