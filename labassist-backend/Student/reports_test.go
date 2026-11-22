package student

import (
	"strings"
	"testing"
	"time"
)

func TestValidateStudentReportInput(t *testing.T) {
	today := time.Now().Format("2006-01-02")
	valid := StudentCreateReportInput{
		ApplicationID: 12,
		IncidentDate:  today,
		Category:      "ABSENCE",
		Description:   "ไม่มาปฏิบัติงาน",
	}
	if _, _, description, _, err := validateStudentReportInput(valid); err != nil || description != "ไม่มาปฏิบัติงาน" {
		t.Fatalf("valid report rejected: description=%q err=%v", description, err)
	}

	cases := []struct {
		name  string
		input StudentCreateReportInput
	}{
		{"bad date", StudentCreateReportInput{IncidentDate: "bad", Category: "ABSENCE", Description: "เหตุการณ์"}},
		{"future date", StudentCreateReportInput{IncidentDate: time.Now().AddDate(0, 0, 2).Format("2006-01-02"), Category: "ABSENCE", Description: "เหตุการณ์"}},
		{"bad category", StudentCreateReportInput{IncidentDate: today, Category: "STEALING", Description: "เหตุการณ์"}},
		{"empty text", StudentCreateReportInput{IncidentDate: today, Category: "ABSENCE", Description: "   "}},
		{"long text", StudentCreateReportInput{IncidentDate: today, Category: "ABSENCE", Description: strings.Repeat("ก", 2001)}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, _, _, _, err := validateStudentReportInput(tc.input); err == nil {
				t.Fatal("invalid report must be rejected")
			}
		})
	}
}
