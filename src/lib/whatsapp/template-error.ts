export function formatTemplateSubmissionError(
  message: string,
  labels: {
    invalidParameter: string;
    unknownError: string;
    details: string;
  }
): string {
  const match = /^\s*(?:\(#\d+\)\s*)?invalid parameter\.?\s*(?:—\s*(.*))?$/i.exec(message);
  if (match) {
    return match[1]
      ? `${labels.invalidParameter} ${labels.details}: ${match[1]}`
      : labels.invalidParameter;
  }
  return `${labels.unknownError} ${labels.details}: ${message}`;
}
