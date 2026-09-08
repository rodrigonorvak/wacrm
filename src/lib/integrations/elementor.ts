export type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

/** Reads both flat Elementor payloads and the nested `fields` shape. */
export function readElementorField(
  payload: JsonObject,
  fieldId: string,
): string | null {
  const candidates = [
    payload[fieldId],
    asObject(payload.fields)?.[fieldId],
    asObject(payload.data)?.[fieldId],
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    const field = asObject(candidate);
    const value = field?.value ?? field?.raw_value;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length > 0) return value.join(", ").trim();
  }
  return null;
}

export function getElementorEventId(payload: JsonObject): string | null {
  for (const key of ["event_id", "submission_id", "id"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
