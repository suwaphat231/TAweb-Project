// Staff pay whole hours only: a partial hour is rounded up, counted from the
// start time (13:00–16:35 is paid as 13:00–17:00 = 4 h). Displayed times stay
// as scheduled; only hours/pay use this. Mirrors database.PayableMinutes in
// the backend.
export function payableMinutes(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  const mins = (eh * 60 + em) - (sh * 60 + sm)
  if (!Number.isFinite(mins) || mins <= 0) return 0
  return Math.ceil(mins / 60) * 60
}

export function payableHours(start: string, end: string): number {
  return payableMinutes(start, end) / 60
}
