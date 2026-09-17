export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function normalizeFieldKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function isMatchingFieldKey(key: string, fieldId: string): boolean {
  const normalizedKey = normalizeFieldKey(key);
  const normalizedId = normalizeFieldKey(fieldId);
  if (!normalizedKey || !normalizedId) return false;

  const aliases: Record<string, string[]> = {
    name: ["nome", "nomedocompleto", "nomelabelname"],
    phone: ["whatsapp", "telefone", "celular", "nomelabelphone"],
    email: ["email", "nomelabelemail"],
    company: ["empresa", "nomelabelempresa"],
  };
  const acceptedKeys = new Set([normalizedId, ...(aliases[normalizedId] ?? [])]);
  return acceptedKeys.has(normalizedKey) || normalizedKey.endsWith(normalizedId);
}

/** Reads both flat Elementor payloads and the nested `fields` shape. */
export function readElementorField(
  payload: JsonObject,
  fieldId: string,
): string | null {
  const fieldList = Array.isArray(payload.fields) ? payload.fields : [];
  const candidates = [
    payload[fieldId],
    asObject(payload.fields)?.[fieldId],
    asObject(payload.data)?.[fieldId],
    ...Object.entries(payload)
      .filter(([key]) => isMatchingFieldKey(key, fieldId))
      .map(([, value]) => value),
    ...fieldList.filter((field) => asObject(field)?.id === fieldId),
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
