export function visibleLeadSource(source: string | null | undefined): string | null {
  const value = source?.trim();
  if (!value) return null;
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return normalized === 'organico' || normalized === 'organic' ? null : value;
}
