package docxgen

import (
	"archive/zip"
	"bytes"
	"fmt"
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

func TestRenderLabBoyHiringNotice_Basic(t *testing.T) {
	in := LabBoyHiringNoticeInput{
		FormDate:       "13 กันยายน 2569",
		CourseCode:     "517122",
		CourseTitle:    "ทักษะการเขียนโปรแกรมคอมพิวเตอร์ II",
		InstructorName: "ผศ.ดร.ทดสอบ อาจารย์",
		Semester:       1,
		AcademicYear:   "2568",
		Students: []HiringNoticeStudent{
			{StudentCode: "650710001", StudentName: "TESTSTUDENT_MARKER_A"},
			{StudentCode: "650710002", StudentName: "TESTSTUDENT_MARKER_B"},
			{StudentCode: "650710003", StudentName: "TESTSTUDENT_MARKER_C"},
		},
	}
	data, err := RenderLabBoyHiringNotice(in)
	if err != nil {
		t.Fatalf("RenderLabBoyHiringNotice: %v", err)
	}
	xml := assertValidDocx(t, data)

	if !strings.Contains(xml, "517122") {
		t.Error("expected course code in output")
	}
	if got := strings.Count(xml, "TESTSTUDENT_MARKER_"); got != 3 {
		t.Errorf("expected 3 student rows, found %d", got)
	}
	// Selected semester (ต้น) should be marked with filled box.
	if !strings.Contains(xml, "■") {
		t.Error("expected filled checkbox (■) in output")
	}
}

func TestRenderLabBoyHiringNotice_ZeroStudents(t *testing.T) {
	in := LabBoyHiringNoticeInput{
		FormDate:       "1 มกราคม 2569",
		CourseCode:     "517122",
		CourseTitle:    "TEST COURSE",
		InstructorName: "อาจารย์ทดสอบ",
		Semester:       2,
		AcademicYear:   "2568",
		Students:       nil,
	}
	data, err := RenderLabBoyHiringNotice(in)
	if err != nil {
		t.Fatalf("RenderLabBoyHiringNotice with zero students: %v", err)
	}
	assertValidDocx(t, data)
}

func TestPrepareHiringNoticeTemplate_InjectsTokens(t *testing.T) {
	// Load the raw template XML and verify that after preparation, the expected
	// tokens are present and no Wingdings F0A3 symbols remain.
	raw, err := templateFS.ReadFile("templates/lab_boy_hiring_notice.docx")
	if err != nil {
		t.Fatalf("reading template: %v", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		t.Fatalf("opening template zip: %v", err)
	}
	var docXML string
	for _, f := range zr.File {
		if f.Name == "word/document.xml" {
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
	if docXML == "" {
		t.Fatal("template word/document.xml is empty")
	}

	prepared := prepareHiringNoticeTemplate(docXML)

	for _, tok := range []string{
		"{{FORM_DATE}}", "{{COURSE_CODE}}", "{{COURSE_TITLE}}",
		"{{INSTRUCTOR_NAME}}", "{{ACADEMIC_YEAR}}",
		"{{SEMESTER_1_BOX}}", "{{SEMESTER_2_BOX}}", "{{SEMESTER_3_BOX}}",
		"{{TYPE_TA_BOX}}", "{{TYPE_LABBOY_BOX}}",
		"{{ROW_NUM}}", "{{STUDENT_CODE}}", "{{STUDENT_NAME}}",
	} {
		if !strings.Contains(prepared, tok) {
			t.Errorf("missing token %s after prepare", tok)
		}
	}
	if strings.Contains(prepared, `w:char="F0A3"`) {
		t.Error("F0A3 Wingdings symbols should all be replaced by tokens")
	}
	// Rows 2-10 should be removed; row 1 is now the RowGroup template.
	for n := 2; n <= 10; n++ {
		needle := fmt.Sprintf("<w:t>%d.</w:t>", n)
		if strings.Contains(prepared, needle) {
			t.Errorf("row %d should have been deleted from template", n)
		}
	}
}
