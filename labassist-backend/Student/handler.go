// Package student holds every backend endpoint under /api/v1/student:
// dashboard, applications, profile, and notifications. Keeping it separate
// from the other resource handlers means student-facing functionality
// always lives in one place that can be reviewed and edited on its own,
// the same way the admin and Teacher packages are split out for their
// own roles.
package student

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }
