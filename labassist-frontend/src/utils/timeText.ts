// formatTyping keeps only digits and puts the colon in as the user types, so
// "1300" reads "13:00".
export function formatTyping(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

// normalizeTime pads a finished entry to HH:MM: "930" → "09:30", "9" → "09:00".
// Anything that is not a real 24-hour time is left as typed for the form to flag.
export function normalizeTime(value: string): string {
  const digits = value.replace(/\D/g, '')
  let h: string, m: string
  if (digits.length <= 2) [h, m] = [digits, '00']
  else if (digits.length === 3) [h, m] = [digits.slice(0, 1), digits.slice(1)]
  else [h, m] = [digits.slice(0, 2), digits.slice(2, 4)]
  if (!h || Number(h) > 23 || Number(m) > 59) return value
  return `${h.padStart(2, '0')}:${m}`
}
