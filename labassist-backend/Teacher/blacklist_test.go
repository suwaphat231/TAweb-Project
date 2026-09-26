package teacher

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestRejectInvalidBlacklistBeforeDatabaseAccess(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewHandler()
	for _, tc := range []struct{ name, body string }{
		{"missing application", `{"reason":"ไม่มาทำงาน"}`},
		{"zero application", `{"application_id":0,"reason":"ไม่มาทำงาน"}`},
		{"missing reason", `{"application_id":1}`},
		{"blank reason", `{"application_id":1,"reason":"   "}`},
		{"reason too long", `{"application_id":1,"reason":"` + strings.Repeat("ก", maxBlacklistReasonLen+1) + `"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := gin.New()
			r.POST("/test", func(c *gin.Context) { c.Set("user_id", uint(1)); c.Set("role", "instructor") }, h.CreateBlacklist)
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
