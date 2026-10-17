package docxgen

import (
	"encoding/json"
	"strings"
	"testing"

	"labassist/models"
)

// Like the department's sample (บันทึกขออนุมัติเบิกจ่ายเงิน…doc): one memo page
// per month of the approval memo's plan, each billing that month.
func TestRenderPaymentRequest_OnePagePerPlannedMonth(t *testing.T) {
	snap, _ := json.Marshal(models.DocumentDataSnapshot{
		RatePerHourBaht: 50,
		Occurrences: []models.OccurrenceSnapshot{
			{Date: "2025-12-03", StartTime: "13:00", EndTime: "16:00", Status: "scheduled"},
			{Date: "2025-12-10", StartTime: "13:00", EndTime: "16:00", Status: "scheduled"},
			{Date: "2025-12-31", StartTime: "13:00", EndTime: "16:00", Status: "cancelled_holiday"},
			{Date: "2026-01-07", StartTime: "13:00", EndTime: "16:00", Status: "scheduled"},
		},
	})
	doc := models.StaffDocument{
		Type:             models.DocPaymentRequest,
		Roster:           []models.RosterEntry{{StudentName: "ก ข"}, {StudentName: "ค ง"}},
		DataSnapshot:     string(snap),
		PriorMemoRef:     "อว 8613.7/171",
		PriorMemoDate:    "2025-12-01",
		StaffOfficerName: "นายประวิม เหลืองสมานกุล",
	}
	course := models.Course{Code: "517122", Title: "ทักษะการเขียนโปรแกรมคอมพิวเตอร์ 2",
		EnglishTitle: "COMPUTER PROGRAMMING SKILL II", Credits: "4(2-4-6)", Section: 2}

	data, err := renderPaymentRequest(doc, course)
	if err != nil {
		t.Fatal(err)
	}
	xml := assertValidDocx(t, data)

	if n := strings.Count(xml, "มีความประสงค์จะขออนุมัติเบิกเงินค่าตอบแทน"); n != 2 {
		t.Fatalf("%d memo pages, want 2 (December and January)", n)
	}
	// The template's page is nearly full, so a separate page-break paragraph
	// spilled onto a blank page; the next month's first paragraph starts the page.
	if n := strings.Count(xml, `<w:pageBreakBefore/>`); n != 1 {
		t.Errorf("%d page breaks, want 1 between the two months", n)
	}
	// The template's stray section break (inside a paragraph) left a blank
	// page; only the document's final section may remain.
	if n := strings.Count(xml, "<w:sectPr"); n != 1 {
		t.Errorf("%d section breaks, want only the final one", n)
	}
	if strings.Contains(xml, `<w:br w:type="page"/>`) {
		t.Error("separate page-break paragraph adds a blank page")
	}
	dec := strings.Index(xml, "ธันวาคม 2568")
	jan := strings.Index(xml, "มกราคม 2569")
	if dec < 0 || jan < 0 || dec > jan {
		t.Fatalf("months missing or out of order (ธันวาคม at %d, มกราคม at %d)", dec, jan)
	}
	for _, want := range []string{
		"หกร้อยบาทถ้วน",       // December: 2 sessions x 3 h x 50 x 2 Lab Boys = 600
		"สามร้อยบาทถ้วน",      // January: 1 session = 300; the holiday is not billed
		"1 ธันวาคม 2568",      // the approval memo's date, in Thai
		"อว 8613.7/171",       // its reference
		"ที่   อว 8613.7/   ", // this memo's own number is written by hand after the prefix, as in the sample
		"517122 COMPUTER PROGRAMMING SKILL II 4(2-4-6)",
		"2569", // budget year of both months (fiscal year starts in October)
	} {
		if !strings.Contains(xml, want) {
			t.Errorf("missing %q", want)
		}
	}
	if strings.Contains(xml, "{{") {
		t.Error("unfilled placeholder left in the document")
	}
}
