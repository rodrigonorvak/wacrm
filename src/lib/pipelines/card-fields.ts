export const PIPELINE_CARD_FIELDS = [
  'company',
  'phone',
  'assignee',
] as const;

export type PipelineCardField = (typeof PIPELINE_CARD_FIELDS)[number];

export const DEFAULT_PIPELINE_CARD_FIELDS: PipelineCardField[] = ['company'];

export function normalizePipelineCardFields(value: unknown): PipelineCardField[] {
  if (!Array.isArray(value)) return [...DEFAULT_PIPELINE_CARD_FIELDS];
  return [...new Set(value.filter((field): field is PipelineCardField =>
    typeof field === 'string' && PIPELINE_CARD_FIELDS.includes(field as PipelineCardField),
  ))];
}
