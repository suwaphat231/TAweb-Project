package staff

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"labassist/models"

	"github.com/gin-gonic/gin"
)

// The staff page lists the documents in the order the department issues
// them; each one is built on the one before.
func TestPreWorkSteps_Order(t *testing.T) {
	want := []models.DocType{models.DocHiringNotice, models.DocApprovalMemo, models.DocPaymentRequest, models.DocWorkReport}
	if len(preWorkSteps) != len(want) {
		t.Fatalf("steps = %+v, want %v", preWorkSteps, want)
	}
	for i, s := range preWorkSteps {
		if s.Type != want[i] || s.Step != i+1 {
			t.Errorf("step %d = %s (#%d), want %s", i+1, s.Type, s.Step, want[i])
		}
		if i > 0 && (s.Requires == nil || *s.Requires != want[i-1]) {
			t.Errorf("%s requires %v, want %s", s.Type, s.Requires, want[i-1])
		}
		if !templateReady[s.Type] {
			t.Errorf("%s must be templateReady", s.Type)
		}
	}
	if _, ok := stepFor(models.DocLabNotice); ok {
		t.Error("lab_notice is no longer a workflow step")
	}
}

// buildStepDocument names documents from docTypeLabel, so every workflow
// step needs a label.
func TestDocTypeLabel_AllWorkflowSteps(t *testing.T) {
	for _, s := range preWorkSteps {
		if docTypeLabel[s.Type] == "" {
			t.Errorf("docTypeLabel missing %q", s.Type)
		}
	}
}

func TestMemoStaffOfficer_DefaultsToCurrentUserForMemoTemplates(t *testing.T) {
	for _, tc := range []struct {
		typ  models.DocType
		in   string
		want string
	}{
		{models.DocApprovalMemo, "", "Current User"},
		{models.DocLabNotice, "", "Current User"},
		{models.DocPaymentRequest, "", "Current User"},
		{models.DocApprovalMemo, "Given Name", "Given Name"},
		{models.DocHiringNotice, "", ""},
	} {
		if got := memoStaffOfficer(tc.typ, tc.in, "Current User"); got != tc.want {
			t.Errorf("memoStaffOfficer(%s, %q) = %q, want %q", tc.typ, tc.in, got, tc.want)
		}
	}
}

// Bad dates are rejected before anything is written (no DB needed).
func TestUpdateCase_RejectsBadDates(t *testing.T) {
	for _, body := range []string{
		`{"work_start_date":"2026/12/01"}`,
		`{"work_end_date":"31-12-2026"}`,
		`{"work_start_date":"2026-12-31","work_end_date":"2026-12-01"}`,
		`{"work_start_date":"2026-12-01","work_end_date":"2026-12-01"}`,
	} {
		gin.SetMode(gin.TestMode)
		r := gin.New()
		h := NewHandler()
		r.PUT("/staff/cases/:id", func(c *gin.Context) {
			c.Set("user_id", uint(1))
			h.UpdateCase(c)
		})
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPut, "/staff/cases/1", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("body %s: status = %d, want 400", body, w.Code)
		}
	}
}

// A monthly work report or payment request shares its type with workflow
// steps 3-4 but must not count as (or satisfy) those steps.
func TestScheduleConfirmBlockers_IgnoresMonthlyDocuments(t *testing.T) {
	period := uint(7)
	accepted := []models.Application{{StudentID: 1}}
	var docs []models.StaffDocument
	for _, st := range preWorkSteps[:2] {
		docs = append(docs, models.StaffDocument{Type: st.Type, Status: models.DocSigned})
	}
	for _, st := range preWorkSteps[2:] {
		docs = append(docs, models.StaffDocument{Type: st.Type, Status: models.DocSigned, MonthlyPeriodID: &period})
	}
	if got := scheduleConfirmBlockers(accepted, docs); len(got) != 2 {
		t.Fatalf("want steps 3 and 4 still blocking, got %v", got)
	}
	if !isMonthlyDoc(docs[2]) || isMonthlyDoc(docs[0]) {
		t.Fatal("isMonthlyDoc must follow monthly_period_id")
	}
}
