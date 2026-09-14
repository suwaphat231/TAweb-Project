package student

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRejectInvalidStudentRequestsBeforeDatabaseAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewHandler(nil)
	for _, tc := range []struct {
		name, body string
		handler    gin.HandlerFunc
	}{
		{"malformed profile", `{"full_name":`, h.UpdateProfile},
		{"overflowing year", `{"year":260}`, h.UpdateProfile},
		{"negative year", `{"year":-1}`, h.UpdateProfile},
		{"blank name", `{"full_name":"   "}`, h.UpdateProfile},
		{"invalid grade", `{"course_id":1,"role_applied":"labboy","grade":"Z"}`, h.Apply},
		{"invalid role", `{"course_id":1,"role_applied":"admin"}`, h.Apply},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := gin.New()
			r.POST("/test", func(c *gin.Context) { c.Set("user_id", uint(1)) }, tc.handler)
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
