export function isCreatedToday(createdAt: string, now: Date = new Date()): boolean {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return created >= start && created < end;
}
