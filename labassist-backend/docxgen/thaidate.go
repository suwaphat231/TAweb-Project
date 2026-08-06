package docxgen

import "fmt"

var thaiMonths = [...]string{
	"", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
	"กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
}

var thaiMonthAbbrevs = [...]string{
	"", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
	"ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
}

// thaiMonthName returns the Thai month name for 1-12, or a numeric
// fallback for an out-of-range value rather than panicking on bad input.
func thaiMonthName(month int) string {
	if month < 1 || month > 12 {
		return fmt.Sprintf("%d", month)
	}
	return thaiMonths[month]
}

// thaiShortDate renders "3 ธ.ค. 2568" for a day-of-month within period.
func thaiShortDate(day, month, year int) string {
	abbrev := fmt.Sprintf("%d", month)
	if month >= 1 && month <= 12 {
		abbrev = thaiMonthAbbrevs[month]
	}
	return fmt.Sprintf("%d %s %d", day, abbrev, year)
}
