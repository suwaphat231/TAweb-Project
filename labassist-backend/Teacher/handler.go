// Package teacher holds every backend endpoint under /api/v1/instructor:
// course management, applicant review, notifications, and the instructor's
// own profile. Keeping it separate from the other resource handlers means
// instructor-facing functionality always lives in one place that can be
// reviewed and edited on its own, the same way the admin package is split
// out for admin-only endpoints.
package teacher

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }
