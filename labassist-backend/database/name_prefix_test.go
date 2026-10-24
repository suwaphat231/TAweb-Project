package database

import (
	"testing"

	"labassist/models"
)

func TestSplitNamePrefix(t *testing.T) {
	cases := []struct{ in, prefix, rest string }{
		{"นาย สมชาย ใจดี", "นาย", "สมชาย ใจดี"},
		{"นายสมชาย ใจดี", "นาย", "สมชาย ใจดี"},
		{"นางสาว สมหญิง ใจดี", "นางสาว", "สมหญิง ใจดี"},
		{"น.ส.สมหญิง ใจดี", "นางสาว", "สมหญิง ใจดี"},
		{"สมชาย ใจดี", "", "สมชาย ใจดี"},
		{"  สมชาย   ใจดี ", "", "สมชาย ใจดี"},
		{"นาย", "", "นาย"},
	}
	for _, c := range cases {
		p, r := SplitNamePrefix(c.in)
		if p != c.prefix || r != c.rest {
			t.Errorf("SplitNamePrefix(%q) = (%q, %q), want (%q, %q)", c.in, p, r, c.prefix, c.rest)
		}
	}
}

func TestUserDisplayName(t *testing.T) {
	u := models.User{FullName: "สมชาย ใจดี", NamePrefix: models.NamePrefixMr}
	if got := u.DisplayName(); got != "นาย สมชาย ใจดี" {
		t.Errorf("DisplayName = %q", got)
	}
	u.NamePrefix = ""
	if got := u.DisplayName(); got != "สมชาย ใจดี" {
		t.Errorf("DisplayName without prefix = %q", got)
	}
}
