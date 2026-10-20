package student

import "strings"

// normalizePhone strips the spaces and dashes people type in a phone number
// ("081-234 5678" → "0812345678"). An empty number is allowed (it clears the
// field); otherwise it must be 9-10 digits.
func normalizePhone(s string) (string, bool) {
	digits := strings.NewReplacer(" ", "", "-", "").Replace(strings.TrimSpace(s))
	if digits == "" {
		return "", true
	}
	if len(digits) < 9 || len(digits) > 10 {
		return "", false
	}
	for _, r := range digits {
		if r < '0' || r > '9' {
			return "", false
		}
	}
	return digits, true
}
