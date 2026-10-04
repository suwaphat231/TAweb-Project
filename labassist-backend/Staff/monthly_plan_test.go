package staff

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

// --- isValidHHMM ---

func TestIsValidHHMM_Valid(t *testing.T) {
	cases := []string{"00:00", "09:00", "12:30", "23:59"}
	for _, tc := range cases {
		if !isValidHHMM(tc) {
			t.Errorf("isValidHHMM(%q) = false, want true", tc)
		}
	}
}

func TestIsValidHHMM_Invalid(t *testing.T) {
	cases := []string{"", "9:00", "09:0", "24:00", "12:60", "ab:cd", "12:3x"}
	for _, tc := range cases {
		if isValidHHMM(tc) {
			t.Errorf("isValidHHMM(%q) = true, want false", tc)
		}
	}
}

// --- handler param validation (no DB) ---

func newTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	return r
}

func TestGetMonthlyPlan_InvalidID(t *testing.T) {
	r := newTestRouter()
	h := NewHandler()
	r.GET("/staff/cases/:id/monthly-plan", func(c *gin.Context) {
		c.Set("user_id", uint(1))
		h.GetMonthlyPlan(c)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/staff/cases/abc/monthly-plan", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestSetGroupMonthDatesList_InvalidYear(t *testing.T) {
	r := newTestRouter()
	h := NewHandler()
	r.POST("/staff/cases/:id/schedule-groups/:groupId/months/:year/:month/set-dates", func(c *gin.Context) {
		c.Set("user_id", uint(1))
		h.SetGroupMonthDatesList(c)
	})

	body, _ := json.Marshal(map[string]interface{}{"dates": []string{"2026-11-10"}})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost,
		"/staff/cases/1/schedule-groups/1/months/notayear/11/set-dates",
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestSetGroupMonthDatesList_InvalidMonth(t *testing.T) {
	r := newTestRouter()
	h := NewHandler()
	r.POST("/staff/cases/:id/schedule-groups/:groupId/months/:year/:month/set-dates", func(c *gin.Context) {
		c.Set("user_id", uint(1))
		h.SetGroupMonthDatesList(c)
	})

	body, _ := json.Marshal(map[string]interface{}{"dates": []string{"2026-13-10"}})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost,
		"/staff/cases/1/schedule-groups/1/months/2026/13/set-dates",
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestAddGroupMonthOccurrence_InvalidTime(t *testing.T) {
	r := newTestRouter()
	h := NewHandler()
	r.POST("/staff/cases/:id/schedule-groups/:groupId/months/:year/:month/occurrences", func(c *gin.Context) {
		c.Set("user_id", uint(1))
		h.AddGroupMonthOccurrence(c)
	})

	payload := map[string]interface{}{
		"date":       "2026-11-10",
		"start_time": "9:00", // invalid — must be HH:MM
		"end_time":   "12:00",
	}
	body, _ := json.Marshal(payload)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost,
		"/staff/cases/1/schedule-groups/1/months/2026/11/occurrences",
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestAddGroupMonthOccurrence_DateOutsideMonth(t *testing.T) {
	r := newTestRouter()
	h := NewHandler()
	r.POST("/staff/cases/:id/schedule-groups/:groupId/months/:year/:month/occurrences", func(c *gin.Context) {
		c.Set("user_id", uint(1))
		h.AddGroupMonthOccurrence(c)
	})

	payload := map[string]interface{}{
		"date":       "2026-12-01", // December, but the route says month=11
		"start_time": "09:00",
		"end_time":   "12:00",
	}
	body, _ := json.Marshal(payload)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost,
		"/staff/cases/1/schedule-groups/1/months/2026/11/occurrences",
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestPatchOccurrence_InvalidID(t *testing.T) {
	r := newTestRouter()
	h := NewHandler()
	r.PATCH("/staff/occurrences/:id", func(c *gin.Context) {
		c.Set("user_id", uint(1))
		h.PatchOccurrence(c)
	})

	body, _ := json.Marshal(map[string]interface{}{"reason": "test"})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/staff/occurrences/xyz",
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestPatchOccurrence_InvalidDate(t *testing.T) {
	r := newTestRouter()
	h := NewHandler()
	r.PATCH("/staff/occurrences/:id", func(c *gin.Context) {
		c.Set("user_id", uint(1))
		h.PatchOccurrence(c)
	})

	body, _ := json.Marshal(map[string]interface{}{"date": "not-a-date"})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/staff/occurrences/1",
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestDeleteOccurrenceHandler_InvalidID(t *testing.T) {
	r := newTestRouter()
	h := NewHandler()
	r.DELETE("/staff/occurrences/:id", func(c *gin.Context) {
		h.DeleteOccurrenceHandler(c)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/staff/occurrences/abc", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}
