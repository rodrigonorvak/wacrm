export interface WhatsAppDeliveryError {
  code?: number | string;
  title?: string;
  message?: string;
  error_data?: {
    details?: string;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

export function formatMessageDeliveryError(errors?: unknown): string | null {
  const error = Array.isArray(errors) ? asRecord(errors[0]) : null;
  if (!error) return null;
  const errorData = asRecord(error.error_data);

  const details = [
    error.title,
    error.message,
    errorData?.details,
  ].filter(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0,
  );
  const uniqueDetails = [...new Set(details)];
  const code = error.code;
  if (typeof code === 'number' || typeof code === 'string') {
    uniqueDetails.push(`code ${code}`);
  }

  return uniqueDetails.length > 0 ? uniqueDetails.join(' — ') : null;
}
