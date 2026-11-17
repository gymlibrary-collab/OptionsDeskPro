const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Formats an ISO date string "YYYY-MM-DD" as "D Mon YYYY" (e.g. "25 Jun 2026").
 * Returns the original string unchanged if it cannot be parsed.
 * Safe to call on API payloads — only use on values displayed to users.
 */
export function fmtCalDate(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const [yyyy, mm, dd] = parts
  const month = MONTHS[parseInt(mm, 10) - 1]
  const day = parseInt(dd, 10)
  if (!month || isNaN(day)) return iso
  return `${day} ${month} ${yyyy}`
}
