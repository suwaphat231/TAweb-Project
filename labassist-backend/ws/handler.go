package ws

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// TokenVerifier validates a token string and returns the user ID and role
type TokenVerifier func(tokenStr string) (userID uint, role string, err error)

// Handler serves websocket requests
type Handler struct {
	verifier TokenVerifier
	hub      *Hub
}

func NewHandler(verifier TokenVerifier) *Handler {
	return &Handler{
		verifier: verifier,
		hub:      GetHub(),
	}
}

func (h *Handler) HandleWS(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		authHeader := c.GetHeader("Sec-WebSocket-Protocol")
		if authHeader != "" {
			token = authHeader
		}
	}

	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
		return
	}

	userID, role, err := h.verifier(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	ServeWs(h.hub, c.Writer, c.Request, userID, role)
}
