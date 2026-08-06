package docxgen

import (
	"archive/zip"
	"bytes"
	"regexp"
	"strings"
	"testing"

	"labassist/models"
)

var leftoverTokenRe = regexp.MustCompile(`\{\{[A-Z_0-9]+\}\}`)

// assertValidDocx round-trips data through zip.NewReader (proves it's a
// structurally valid OOXML package), checks word/document.xml is present,
// and fails if any {{TOKEN}} was left unsubstituted.
func assertValidDocx(t *testing.T, data []byte) string {
	t.Helper()
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("output is not a valid zip: %v", err)
	}
	var docXML string
	found := false
	for _, f := range zr.File {
		if f.Name == "word/document.xml" {
			found = true
			rc, err := f.Open()
			if err != nil {
				t.Fatalf("opening word/document.xml: %v", err)
			}
			var buf bytes.Buffer
			buf.ReadFrom(rc)
			rc.Close()
			docXML = buf.String()
		}
	}
	if !found {
		t.Fatal("word/document.xml missing from output")
	}
	if docXML == "" {
		t.Fatal("word/document.xml is empty")
	}
	if m := leftoverTokenRe.FindAllString(docXML, -1); len(m) > 0 {
		t.Errorf("leftover unsubstituted tokens: %v", m)
	}
	return docXML
}

func sampleCourse() models.Course {
	return models.Course{Code: "517122-165", Title: "COMPUTER PROGRAMMING SKILL II", Section: 2}
}

func sampleRoster(n int) []models.RosterEntry {
	roster := make([]models.RosterEntry, n)
	for i := range roster {
		roster[i] = models.RosterEntry{
			StudentID:   uint(i + 1),
			StudentName: "TESTSTUDENT_MARKER",
			StudentCode: "650710000",
			Hours:       6,
			Amount:      300,
		}
	}
	return roster
}

func TestRenderPaymentEvidence_RowCount(t *testing.T) {
	doc := models.StaffDocument{
		Name:            "หลักฐานการจ่ายเงิน ทดสอบ",
		Type:            models.DocPaymentEvidence,
		Period:          &models.DocumentPeriod{Month: 12, Year: 2568},
		SessionDates:    []int{3, 17, 24},
		HoursPerSession: 2,
		Rate:            50,
		Roster:          sampleRoster(5),
	}
	data, err := renderPaymentEvidence(doc, sampleCourse())
	if err != nil {
		t.Fatalf("renderPaymentEvidence: %v", err)
	}
	xml := assertValidDocx(t, data)
	if got := strings.Count(xml, "TESTSTUDENT_MARKER"); got != 5 {
		t.Errorf("expected 5 student rows, found %d occurrences of marker", got)
	}
}

func TestRenderPaymentEvidence_ZeroStudents(t *testing.T) {
	doc := models.StaffDocument{
		Type:            models.DocPaymentEvidence,
		Period:          &models.DocumentPeriod{Month: 1, Year: 2569},
		SessionDates:    []int{5},
		HoursPerSession: 2,
		Rate:            50,
		Roster:          nil,
	}
	data, err := renderPaymentEvidence(doc, sampleCourse())
	if err != nil {
		t.Fatalf("renderPaymentEvidence with zero students: %v", err)
	}
	assertValidDocx(t, data)
}

func TestRenderPaymentRequest(t *testing.T) {
	doc := models.StaffDocument{
		Type:             models.DocPaymentRequest,
		Period:           &models.DocumentPeriod{Month: 12, Year: 2568},
		TotalAmount:      3300,
		RefNumber:        "อว 8613.7/999",
		PriorMemoRef:     "อว 8613.7/171",
		PriorMemoDate:    "1 ธันวาคม 2568",
		DeptHeadName:     "ทดสอบ หัวหน้าภาค",
		StaffOfficerName: "ทดสอบ เจ้าหน้าที่",
	}
	data, err := renderPaymentRequest(doc, sampleCourse())
	if err != nil {
		t.Fatalf("renderPaymentRequest: %v", err)
	}
	xml := assertValidDocx(t, data)
	if !strings.Contains(xml, "สามพันสามร้อยบาทถ้วน") {
		t.Error("expected baht-text total amount in output")
	}
}

func TestRenderWorkReport_TwoRowGroups(t *testing.T) {
	doc := models.StaffDocument{
		Type:            models.DocWorkReport,
		Period:          &models.DocumentPeriod{Month: 12, Year: 2568},
		SessionDates:    []int{3, 17, 24},
		HoursPerSession: 2,
		DeptHeadName:    "ทดสอบ หัวหน้าภาค",
		DeanName:        "ทดสอบ คณบดี",
		Roster:          sampleRoster(4),
	}
	data, err := renderWorkReport(doc, sampleCourse())
	if err != nil {
		t.Fatalf("renderWorkReport: %v", err)
	}
	xml := assertValidDocx(t, data)
	if got := strings.Count(xml, "TESTSTUDENT_MARKER"); got != 4 {
		t.Errorf("expected 4 name rows, found %d", got)
	}
	if got := strings.Count(xml, "517122-165"); got != 3 {
		t.Errorf("expected course code in all 3 session rows, found %d", got)
	}
}

func TestRenderDocument_NoTemplateForApprovalMemo(t *testing.T) {
	// approval_memo has no CourseID, so RenderDocument must return
	// ErrNoTemplate before ever attempting a database lookup.
	doc := models.StaffDocument{Type: models.DocApprovalMemo}
	_, _, err := RenderDocument(doc)
	if err != ErrNoTemplate {
		t.Fatalf("expected ErrNoTemplate, got %v", err)
	}
}
