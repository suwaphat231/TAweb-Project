package config

import (
	"strings"
	"testing"
)

func TestLoadRejectsUnsafeJWTSecrets(t *testing.T) {
	for _, secret := range []string{
		"", " \t\n", "labassist-secret", "change-me-in-production",
		"labassist-super-secret-key-change-in-production",
		"LABASSIST-SUPER-SECRET-KEY-CHANGE-IN-PRODUCTION",
		"your-secret-key-here", strings.Repeat("x", 31),
		" " + strings.Repeat("x", 32), strings.Repeat("x", 32) + "\n",
	} {
		t.Run(secret, func(t *testing.T) {
			t.Setenv("JWT_SECRET", secret)
			cfg, err := Load()
			if err == nil || cfg != nil {
				t.Fatal("unsafe configuration accepted")
			}
			if secret != "" && strings.Contains(err.Error(), secret) {
				t.Fatal("error exposes the supplied secret")
			}
		})
	}
}

func TestLoadPreservesConfiguredJWTSecret(t *testing.T) {
	t.Setenv("SEED_DEMO_DATA", "false")
	const secret = "0123456789abcdefABCDEF9876543210xy"
	t.Setenv("JWT_SECRET", secret)
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.JWTSecret != secret {
		t.Fatal("configured signing key changed")
	}
}

func TestDemoSeedingRequiresExplicitOptIn(t *testing.T) {
	t.Setenv("JWT_SECRET", "0123456789abcdefABCDEF9876543210xy")
	for _, tc := range []struct {
		value            string
		enabled, invalid bool
	}{
		{"", false, false}, {"false", false, false}, {"true", true, false},
		{"tru", false, true}, {"1", false, true},
	} {
		t.Run(tc.value, func(t *testing.T) {
			t.Setenv("SEED_DEMO_DATA", tc.value)
			cfg, err := Load()
			if tc.invalid {
				if err == nil {
					t.Fatal("invalid flag accepted")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if cfg.SeedDemoData != tc.enabled {
				t.Fatal("unexpected demo seeding setting")
			}
		})
	}
}
