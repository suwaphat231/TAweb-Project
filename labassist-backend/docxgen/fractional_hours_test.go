package docxgen

import (
	"strings"
	"testing"

	"labassist/models"
)

func TestPaymentEvidencePreservesFractionalHoursAndRate(t *testing.T) {
	doc := models.StaffDocument{
		Period:       &models.DocumentPeriod{Month: 10, Year: 2569},
		SessionDates: []int{6, 13, 20}, HoursPerSession: 2.5, Rate: 50.25,
		Roster: []models.RosterEntry{{StudentName: "Fractional hours", Hours: 7.5, Amount: 376.88}},
	}
	data, err := renderPaymentEvidence(doc, sampleCourse())
	if err != nil {
		t.Fatal(err)
	}
	xml := assertValidDocx(t, data)
	for _, value := range []string{">2.5<", ">7.5<", ">50.25<", ">376.88<", "2569"} {
		if !strings.Contains(xml, value) {
			t.Errorf("generated document is missing %s", value)
		}
	}
	if got := strings.Count(xml, ">2.5<"); got != 3 {
		t.Errorf("expected hours in all 3 scheduled daily cells, got %d", got)
	}
}

func TestWorkReportPreservesFractionalHours(t *testing.T) {
	doc := models.StaffDocument{
		Period:       &models.DocumentPeriod{Month: 10, Year: 2569},
		SessionDates: []int{6}, HoursPerSession: 2.5,
		Roster: []models.RosterEntry{{StudentName: "Fractional hours"}},
	}
	data, err := renderWorkReport(doc, sampleCourse())
	if err != nil {
		t.Fatal(err)
	}
	xml := assertValidDocx(t, data)
	for _, value := range []string{"รวม 2.5 ชั่วโมง", "6 ต.ค. 2569"} {
		if !strings.Contains(xml, value) {
			t.Errorf("generated document is missing %s", value)
		}
	}
}
