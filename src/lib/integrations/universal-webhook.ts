type JsonRecord = Record<string, unknown>;

const blockedPathSegments = new Set(['__proto__', 'prototype', 'constructor']);

function pathSegments(path: string): string[] {
  const segments = path.match(/[^.[\]]+|(?<=\[\])(?=.)/g) ?? [];
  return segments
    .map((segment) => segment.replace(/^['"]|['"]$/g, ''))
    .filter(
      (segment) => segment.length > 0 && !blockedPathSegments.has(segment)
    );
}

export function readWebhookPath(payload: unknown, path: string): unknown {
  const segments = pathSegments(path);
  if (!segments.length) return undefined;

  let current: unknown = payload;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as JsonRecord)[segment];
  }
  return current;
}

export function stringifyWebhookValue(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (Array.isArray(value)) {
    const values = value
      .map(stringifyWebhookValue)
      .filter((item) => item !== null);
    return values.length ? values.join(', ') : null;
  }
  if (value && typeof value === 'object') return JSON.stringify(value);
  return null;
}

export function flattenWebhookPayload(
  payload: unknown,
  maxDepth = 8
): Array<{ path: string; value: string }> {
  const fields: Array<{ path: string; value: string }> = [];
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > maxDepth || fields.length >= 500) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        visit(item, `${path}[${index}]`, depth + 1)
      );
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (blockedPathSegments.has(key)) continue;
        visit(child, path ? `${path}.${key}` : key, depth + 1);
      }
      return;
    }
    const rendered = stringifyWebhookValue(value);
    if (path && rendered !== null) {
      fields.push({ path, value: rendered.slice(0, 500) });
    }
  };

  visit(payload, '', 0);
  return fields;
}

export function getUniversalWebhookEventId(payload: unknown): string | null {
  for (const path of [
    'notification_id',
    'id',
    'event_id',
    'data.id',
    'event.id',
    'data.event.id',
  ]) {
    const value = stringifyWebhookValue(readWebhookPath(payload, path));
    if (value) return value.slice(0, 255);
  }
  return null;
}
