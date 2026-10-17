package staff

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"labassist/models"

	"github.com/gin-gonic/gin"
)

// lab_notice is issued on the approval memo template once the memo exists,
// so it is step 3 and requires step 2.
func TestStepFor_LabNoticeIsStep3AfterApprovalMemo(t *testing.T) {
	s, ok := stepFor(models.DocLabNotice)
	if !ok {
		t.Fatal("lab_notice is not a workflow step")
	}
	if s.Step != 3 {
		t.Errorf("step = %d, want 3", s.Step)
	}
	if s.Requires == nil || *s.Requires != models.DocApprovalMemo {
		t.Errorf("requires = %v, want approval_memo", s.Requires)
	}
	if !templateReady[models.DocLabNotice] {
		t.Error("lab_notice must be marked templateReady (docxgen renders it)")
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
