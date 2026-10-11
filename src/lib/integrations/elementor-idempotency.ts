import { createHash } from 'node:crypto';

function stableValue(value: unknown, omitTime = false): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (!value || typeof value !== 'object') return value;

  const object = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(object)
      .filter((key) => !(omitTime && key.trim().toLowerCase() === 'time'))
      .sort()
      .map((key) => [key, stableValue(object[key])]),
  );
}

export function getElementorIdempotencyKey(payload: Record<string, unknown>): string {
  const canonicalPayload = JSON.stringify(stableValue(payload, true));
  return createHash('sha256').update(canonicalPayload).digest('hex');
}
