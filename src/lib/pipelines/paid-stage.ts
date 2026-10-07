export function isPaidStageName(name: string | null | undefined): boolean {
  const normalized = (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return /\b(pago|paga|pagamento|paid)\b/.test(normalized);
}