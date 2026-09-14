package docxgen

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"labassist/database"
	"labassist/models"
)

// ErrNoTemplate is returned by RenderDocument for a DocType with no
// registered template (currently DocApprovalMemo).
var ErrNoTemplate = errors.New("docxgen: no template registered for this document type")

// RenderDocument dispatches a StaffDocument to its type's builder and
// returns the generated .docx bytes plus a suggested filename.
func RenderDocument(doc models.StaffDocument) (data []byte, filename string, err error) {
	var course models.Course
	if doc.CourseID != nil {
		var ok bool
		course, ok = database.CourseByID(*doc.CourseID)
		if !ok {
			return nil, "", fmt.Errorf("docxgen: course %d not found", *doc.CourseID)
		}
	}

	switch doc.Type {
	case models.DocHiringNotice:
		data, err = renderHiringNotice(doc, course)
	case models.DocPaymentEvidence:
		data, err = renderPaymentEvidence(doc, course)
	case models.DocPaymentRequest:
		data, err = renderPaymentRequest(doc, course)
	case models.DocWorkReport:
		data, err = renderWorkReport(doc, course)
	default:
		return nil, "", ErrNoTemplate
	}
	if err != nil {
		return nil, "", err
	}
	return data, doc.Name + ".docx", nil
}

func renderHiringNotice(doc models.StaffDocument, course models.Course) ([]byte, error) {
	students := make([]HiringNoticeStudent, 0, len(doc.Roster))
	for _, r := range doc.Roster {
		students = append(students, HiringNoticeStudent{
			StudentCode: r.StudentCode,
			StudentName: r.StudentName,
		})
	}

	semNum := 1
	switch course.Semester {
	case "2":
		semNum = 2
	case "3":
		semNum = 3
	}

	now := time.Now()
	formDate := fmt.Sprintf("%d %s %d", now.Day(), thaiMonthName(int(now.Month())), now.Year()+543)

	return RenderLabBoyHiringNotice(LabBoyHiringNoticeInput{
		FormDate:       formDate,
		CourseCode:     course.Code,
		CourseTitle:    course.Title,
		InstructorName: course.InstructorName,
		Semester:       semNum,
		AcademicYear:   strconv.Itoa(course.AcademicYear),
		Students:       students,
	})
}

// formatInt renders a whole-number float without a trailing ".0" (hours,
// day marks, etc. are always whole numbers in practice).
func formatInt(f float64) string {
	return strconv.FormatInt(int64(f), 10)
}

// formatThousands renders a whole-number float with comma thousands
// separators, e.g. 3300 -> "3,300", matching the source forms' style.
func formatThousands(f float64) string {
	s := formatInt(f)
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = s[1:]
	}
	var out []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, c)
	}
	if neg {
		return "-" + string(out)
	}
	return string(out)
}
