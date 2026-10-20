package database

import "strings"

// IsNormalStudentStatus reports whether a registrar student status (สถานภาพ
// นักศึกษา, read from the student's document) means the student is enrolled
// as normal — the only status that may apply for Lab Boy.
func IsNormalStudentStatus(status string) bool {
	status = strings.TrimSpace(status)
	if strings.Contains(status, "ไม่ปกติ") {
		return false
	}
	return strings.Contains(status, "ปกติ") || strings.Contains(status, "กำลังศึกษา")
}

// VerifiedStudentStatus returns the student status from the student's
// confirmed document, or "" when no document has been confirmed yet.
func VerifiedStudentStatus(userID uint) string {
	doc, ok := StudentInfoDocumentByUserID(userID)
	if !ok || doc.ConfirmedAt == nil || doc.OcrStudentStatus == nil {
		return ""
	}
	return strings.TrimSpace(*doc.OcrStudentStatus)
}

// NormalizeStudentID turns what a student typed into a bare student ID:
// Thai digits become ASCII and spaces/dashes are dropped. ok is false when
// anything else is left (e.g. "ุ" from pressing 6 on a Thai keyboard) or the
// result is not 9-10 digits. "" is returned as-is with ok true (clears it).
func NormalizeStudentID(raw string) (string, bool) {
	var b strings.Builder
	for _, r := range raw {
		switch {
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r >= '๐' && r <= '๙':
			b.WriteRune('0' + (r - '๐'))
		case r == ' ' || r == '-':
		default:
			return "", false
		}
	}
	id := b.String()
	if id != "" && (len(id) < 9 || len(id) > 10) {
		return "", false
	}
	return id, true
}

// namePrefixes are the titles a registrar document may print before a name.
// Longer prefixes come first so "นางสาว" is not cut down to "สาว…".
var namePrefixes = []string{"นางสาว", "น.ส.", "นาย", "นาง", "miss", "mrs.", "mrs", "mr.", "mr", "ms.", "ms"}

// NormalizePersonName reduces a name to the form used to decide whether the
// profile name matches the registrar document: title dropped, whitespace
// collapsed, case folded. "นาย  สมชาย ใจดี" and "สมชาย ใจดี" compare equal.
func NormalizePersonName(name string) string {
	s := strings.ToLower(strings.Join(strings.Fields(name), " "))
	for _, p := range namePrefixes {
		if strings.HasPrefix(s, p) {
			rest := strings.TrimSpace(strings.TrimPrefix(s, p))
			// "mr"/"ms" without a dot must be a separate word ("mrsomchai" is a name).
			if rest != "" && (strings.HasSuffix(p, ".") || !isASCIILetter(p) || strings.HasPrefix(s, p+" ")) {
				s = rest
			}
			break
		}
	}
	return s
}

func isASCIILetter(s string) bool {
	return s != "" && s[0] >= 'a' && s[0] <= 'z'
}

// SamePersonName reports whether two names refer to the same person once
// titles and spacing are ignored.
func SamePersonName(a, b string) bool {
	na, nb := NormalizePersonName(a), NormalizePersonName(b)
	return na != "" && na == nb
}

// VerifiedFullName returns the Thai full name from the student's confirmed
// registrar document, or "" when no document has been confirmed or the name
// could not be read.
func VerifiedFullName(userID uint) string {
	th, _ := VerifiedNames(userID)
	return th
}

// VerifiedNames returns the Thai and English full names from the student's
// confirmed registrar document; either is "" when it was not read.
func VerifiedNames(userID uint) (th, en string) {
	doc, ok := StudentInfoDocumentByUserID(userID)
	if !ok || doc.ConfirmedAt == nil {
		return "", ""
	}
	if doc.OcrFullNameTh != nil {
		th = strings.TrimSpace(*doc.OcrFullNameTh)
	}
	if doc.OcrFullNameEn != nil {
		en = strings.TrimSpace(*doc.OcrFullNameEn)
	}
	return th, en
}

// HasThaiLetter reports whether s contains at least one Thai character, so a
// Thai-name field cannot be filled with the English spelling.
func HasThaiLetter(s string) bool {
	for _, r := range s {
		if r >= 0x0E01 && r <= 0x0E5B {
			return true
		}
	}
	return false
}

// IsEnglishName reports whether s is spelled with Latin letters only (plus
// spaces, dots, hyphens and apostrophes).
func IsEnglishName(s string) bool {
	hasLetter := false
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z':
			hasLetter = true
		case r == ' ' || r == '.' || r == '-' || r == '\'':
		default:
			return false
		}
	}
	return hasLetter
}
