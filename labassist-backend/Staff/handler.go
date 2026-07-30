// Package staff holds every backend endpoint under /api/v1/staff:
// profile management, form review (verifying instructor postings), and
// document management for the hiring/payment workflow.
package staff

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }
