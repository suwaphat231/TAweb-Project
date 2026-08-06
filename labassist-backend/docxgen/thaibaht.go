package docxgen

import (
	"math"
	"strconv"
	"strings"
)

var thaiDigits = [10]string{"", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"}
var thaiPlaces = [7]string{"", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"}

// BahtText spells out a baht amount in Thai words, e.g. 3300 ->
// "สามพันสามร้อยบาทถ้วน", following the standard reading rules: a units
// digit of 1 reads as "เอ็ด" whenever the group has more than one digit, a
// tens digit of 2 reads as "ยี่" (never "สอง"), a tens digit of 1 is silent,
// and every full "ล้าน" group beyond the first recurses using the same rules.
func BahtText(amount float64) string {
	rounded := math.Round(amount * 100)
	baht := int64(rounded) / 100
	satang := int64(rounded) % 100

	var b strings.Builder
	b.WriteString(readThaiInt(baht))
	b.WriteString("บาท")
	if satang == 0 {
		b.WriteString("ถ้วน")
	} else {
		b.WriteString(readThaiInt(satang))
		b.WriteString("สตางค์")
	}
	return b.String()
}

func readThaiInt(n int64) string {
	if n == 0 {
		return "ศูนย์"
	}
	if n < 0 {
		return "ลบ" + readThaiInt(-n)
	}

	var b strings.Builder
	// Split into 6-digit (ล้าน) groups, most significant first.
	groups := make([]int64, 0, 4)
	for n > 0 {
		groups = append(groups, n%1000000)
		n /= 1000000
	}
	hasHigherNonzero := false
	for i := len(groups) - 1; i >= 0; i-- {
		g := groups[i]
		if g == 0 {
			continue
		}
		// The final (least-significant) group's units digit reads as "เอ็ด"
		// whenever it's not the number's only significant digit overall —
		// either this group has more than one digit itself, or an earlier
		// (more significant) group already contributed digits.
		lastGroupEd := i == 0 && hasHigherNonzero
		b.WriteString(readGroup(g, lastGroupEd))
		for j := 0; j < i; j++ {
			b.WriteString("ล้าน")
		}
		hasHigherNonzero = true
	}
	return b.String()
}

// readGroup reads a 0-999999 chunk. forceEdOnSingleDigit makes a lone "1"
// (a group that is otherwise just one digit) read as "เอ็ด" instead of
// "หนึ่ง" — used when this group's units digit is actually the overall
// number's final digit and earlier groups already contributed digits.
func readGroup(g int64, forceEdOnSingleDigit bool) string {
	digits := strconv.FormatInt(g, 10)
	n := len(digits)
	var b strings.Builder
	for i, ch := range digits {
		d := int(ch - '0')
		if d == 0 {
			continue
		}
		place := n - i - 1 // 0=units, 1=tens, 2=hundreds, ...
		switch {
		case place == 0:
			if d == 1 && (n > 1 || forceEdOnSingleDigit) {
				b.WriteString("เอ็ด")
			} else {
				b.WriteString(thaiDigits[d])
			}
		case place == 1 && d == 1:
			// silent "หนึ่ง" before สิบ
			b.WriteString(thaiPlaces[1])
		case place == 1 && d == 2:
			b.WriteString("ยี่")
			b.WriteString(thaiPlaces[1])
		default:
			b.WriteString(thaiDigits[d])
			b.WriteString(thaiPlaces[place])
		}
	}
	return b.String()
}
