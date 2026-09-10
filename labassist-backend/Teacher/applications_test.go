package teacher

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRejectInvalidReviewsBeforeDatabaseAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewHandler()
	for _, tc := range []struct {
		name, body string
		handler    gin.HandlerFunc
	}{
		{"unknown status", `{"status":"unknown"}`, h.Review},
		{"withdraw via review", `{"status":"withdrawn"}`, h.Review},
		{"pending via review", `{"status":"pending"}`, h.Review},
		{"bulk invalid status", `{"application_ids":[1],"status":"unknown"}`, h.BulkReview},
		{"empty bulk", `{"application_ids":[],"status":"accepted"}`, h.BulkReview},
		{"zero id", `{"application_ids":[0],"status":"accepted"}`, h.BulkReview},
		{"negative slots", `{"code":"517121","title":"Course","semester":"1","academic_year":2569,"labboy_slots":-1}`, h.Create},
		{"invalid course status", `{"code":"517121","title":"Course","semester":"1","academic_year":2569,"status":"invalid"}`, h.Create},
		{"invalid deadline", `{"code":"517121","title":"Course","semester":"1","academic_year":2569,"deadline":"2026-02-30"}`, h.Create},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := gin.New()
			r.POST("/test", func(c *gin.Context) { c.Set("user_id", uint(1)); c.Set("role", "admin") }, tc.handler)
			req := httptest.NewRequest(http.MethodPost, "/test", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("status = %d; body = %s", w.Code, w.Body.String())
			}
		})
	}
}
