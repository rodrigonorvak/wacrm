/** Local calendar day match for deal.scheduled_date (YYYY-MM-DD). */
export function isScheduledDateToday(
  scheduledDate: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!scheduledDate || !/^\d{4}-\d{2}-\d{2}/.test(scheduledDate)) return false
  const [year, month, day] = scheduledDate.slice(0, 10).split('-').map(Number)
  return (
    year === now.getFullYear() &&
    month === now.getMonth() + 1 &&
    day === now.getDate()
  )
}

export function isFollowUpDueToday(
  stageType: string | null | undefined,
  scheduledDate: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return stageType === 'follow_up' && isScheduledDateToday(scheduledDate, now)
}
