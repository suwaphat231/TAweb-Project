package docxgen

import (
	"encoding/json"
	"strings"
	"testing"

	"labassist/models"
)

// Like the department's sample (ใบขวาง 517121 ก.1-อังคาร…doc): the ใบขวาง that
// goes with a payment request has one page per month of the same plan.
func TestRenderPaymentRequestEvidence_OnePagePerPlannedMonth(t *testing.T) {
	snap, _ := json.Marshal(models.DocumentDataSnapshot{
		RatePerHourBaht: 50,
		Occurrences: []models.OccurrenceSnapshot{
			{Date: "2025-11-04", StartTime: "13:00", EndTime: "16:00", Status: "scheduled"},
			{Date: "2025-11-18", StartTime: "13:00", EndTime: "16:00", Status: "scheduled"},
			{Date: "2025-11-25", StartTime: "13:00", EndTime: "16:00", Status: "cancelled_holiday"},
			{Date: "2025-12-02", StartTime: "13:00", EndTime: "16:00", Status: "scheduled"},
		},
	})
	doc := models.StaffDocument{
		Type:         models.DocPaymentRequest,
		CourseRef:    "517121 ตอน 1",
		Roster:       []models.RosterEntry{{StudentName: "นางสาวโสภิตา เจ็งศรีวงศ์", StudentCode: "660710178"}, {StudentName: "นายพีรพัชร คล้ายสำเนียง", StudentCode: "660710729"}},
		DataSnapshot: string(snap),
	}

	data, filename, err := RenderPaymentRequestEvidence(doc)
	if err != nil {
		t.Fatal(err)
	}
	if filename != "หลักฐานการจ่ายเงิน 517121 ตอน 1.docx" {
		t.Errorf("filename = %q", filename)
	}
	xml := assertValidDocx(t, data)

	if n := strings.Count(xml, "หลักฐานการจ่ายเงินค่าจ้างนักศึกษาปฏิบัติงาน"); n != 2 {
		t.Fatalf("%d pages, want 2 (November and December)", n)
	}
	if n := strings.Count(xml, "<w:sectPr"); n != 1 {
		t.Errorf("%d section breaks, want only the final one", n)
	}
	nov := strings.Index(xml, "พฤศจิกายน")
	dec := strings.Index(xml, "ธันวาคม")
	if nov < 0 || dec < 0 || nov > dec {
		t.Fatalf("months missing or out of order (พฤศจิกายน at %d, ธันวาคม at %d)", nov, dec)
	}
	// November has 30 days: its header drops 31, December's keeps it.
	if strings.Contains(xml[:dec], "<w:t>31</w:t>") {
		t.Error("November page still numbers day 31")
	}
	if !strings.Contains(xml[dec:], "<w:t>31</w:t>") {
		t.Error("December page lost day 31")
	}
	// The template's trailing page break left a blank page after each month.
	if strings.Contains(xml, `<w:br w:type="page"/>`) {
		t.Error("page-break paragraph adds a blank page")
	}
	// As on the sample, the surname has its own cell beside the first name.
	if !strings.Contains(xml, ">นางสาวโสภิตา<") || !strings.Contains(xml, ">เจ็งศรีวงศ์<") {
		t.Error("first name and surname not in separate cells")
	}
	// Day cells keep the template's Thai font instead of Word's default.
	if strings.Contains(xml, "<w:r><w:t>") {
		t.Error("unformatted run added to the sheet")
	}
	if n := strings.Count(xml, "660710178"); n != 2 {
		t.Errorf("Lab Boy listed on %d pages, want 2", n)
	}
	for _, want := range []string{
		"หกร้อยบาทถ้วน",  // November: 2 sessions x 3 h x 50 x 2 Lab Boys = 600; the holiday is not billed
		"สามร้อยบาทถ้วน", // December: 1 session = 300
		"2568",           // Buddhist year
	} {
		if !strings.Contains(xml, want) {
			t.Errorf("missing %q", want)
		}
	}
	if strings.Contains(xml, "{{") {
		t.Error("unfilled placeholder left in the document")
	}
}

func TestRenderPaymentRequestEvidence_OnlyForPaymentRequest(t *testing.T) {
	_, _, err := RenderPaymentRequestEvidence(models.StaffDocument{Type: models.DocWorkReport})
	if err != ErrNoTemplate {
		t.Fatalf("err = %v, want ErrNoTemplate", err)
	}
}
