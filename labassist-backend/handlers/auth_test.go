package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"google.golang.org/api/idtoken"
	"labassist/config"
)

func TestUniversityGoogleAccount(t *testing.T) {
	for _, tt := range []struct {
		name, email, domain string
		verified            any
		want                bool
	}{
		{"university", "student@silpakorn.edu", "silpakorn.edu", true, true},
		{"unverified", "student@silpakorn.edu", "silpakorn.edu", false, false},
		{"unmanaged email", "student@silpakorn.edu", "", true, false},
		{"wrong organization", "student@silpakorn.edu", "example.com", true, false},
		{"personal email", "student@gmail.com", "silpakorn.edu", true, false},
		{"suffix spoof", "student@silpakorn.edu.evil.com", "silpakorn.edu", true, false},
		{"missing local part", "@silpakorn.edu", "silpakorn.edu", true, false},
		{"wrong claim type", "student@silpakorn.edu", "silpakorn.edu", "true", false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			payload := &idtoken.Payload{Claims: map[string]interface{}{"email": tt.email, "hd": tt.domain, "email_verified": tt.verified}}
			if got := isUniversityGoogleAccount(payload); got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGoogleLoginRejectsMissingClientID(t *testing.T) {
	router := gin.New()
	router.POST("/auth/google", NewAuthHandler(&config.Config{}).GoogleLogin)
	req := httptest.NewRequest(http.MethodPost, "/auth/google", strings.NewReader(`{"credential":"untrusted-token"}`))
	req.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, req)
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("got %d, want 503", response.Code)
	}
}
