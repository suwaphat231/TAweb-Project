package middleware

import (
	"labassist/config"
	"labassist/models"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func TestAuthAccountAndTokenValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{JWTSecret: "test-secret"}
	valid, err := SignToken(cfg, 7, "admin", "Old name")
	if err != nil {
		t.Fatal(err)
	}
	sign := func(method jwt.SigningMethod, expiry *jwt.NumericDate) string {
		t.Helper()
		token, err := jwt.NewWithClaims(method, Claims{UserID: 7, Role: "admin", RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: expiry}}).SignedString([]byte(cfg.JWTSecret))
		if err != nil {
			t.Fatal(err)
		}
		return token
	}
	for _, tc := range []struct {
		name, token    string
		active, exists bool
		want           int
	}{
		{"current role overrides token role", valid, true, true, http.StatusOK},
		{"suspended account", valid, false, true, http.StatusUnauthorized},
		{"deleted account", valid, true, false, http.StatusUnauthorized},
		{"expired", sign(jwt.SigningMethodHS256, jwt.NewNumericDate(time.Now().Add(-time.Minute))), true, true, http.StatusUnauthorized},
		{"missing expiry", sign(jwt.SigningMethodHS256, nil), true, true, http.StatusUnauthorized},
		{"unexpected algorithm", sign(jwt.SigningMethodHS512, jwt.NewNumericDate(time.Now().Add(time.Hour))), true, true, http.StatusUnauthorized},
		{"invalid token", "invalid", true, true, http.StatusUnauthorized},
		{"missing token", "", true, true, http.StatusUnauthorized},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := gin.New()
			r.Use(authWithUserLookup(cfg, func(id uint) (models.User, bool) {
				if id != 7 {
					t.Fatalf("unexpected user id: %d", id)
				}
				return models.User{ID: id, IsActive: tc.active, Role: models.RoleStudent, FullName: "Current name"}, tc.exists
			}))
			r.GET("/private", RequireRole("student"), func(c *gin.Context) {
				if c.GetString("name") != "Current name" {
					t.Error("stale name from token")
				}
				c.Status(http.StatusOK)
			})
			req := httptest.NewRequest(http.MethodGet, "/private", nil)
			if tc.token != "" {
				req.Header.Set("Authorization", "Bearer "+tc.token)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != tc.want {
				t.Fatalf("status = %d; want %d: %s", w.Code, tc.want, w.Body.String())
			}
		})
	}
}

func TestSignTokenExpiresWithinOneDay(t *testing.T) {
	cfg := &config.Config{JWTSecret: "test-secret"}
	encoded, err := SignToken(cfg, 1, "student", "Student")
	if err != nil {
		t.Fatal(err)
	}
	claims := &Claims{}
	_, err = jwt.ParseWithClaims(encoded, claims, func(*jwt.Token) (interface{}, error) { return []byte(cfg.JWTSecret), nil })
	if err != nil {
		t.Fatal(err)
	}
	if claims.IssuedAt == nil || claims.ExpiresAt == nil || claims.ExpiresAt.Sub(claims.IssuedAt.Time) != 24*time.Hour {
		t.Fatalf("unexpected token lifetime: %+v", claims.RegisteredClaims)
	}
}

func TestRequireRoleWithoutAuthDoesNotPanic(t *testing.T) {
	r := gin.New()
	r.GET("/private", RequireRole("admin"), func(c *gin.Context) { c.Status(http.StatusOK) })
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/private", nil))
	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d", w.Code)
	}
}
