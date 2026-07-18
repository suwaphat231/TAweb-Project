package middleware

import (
	"labassist/config"
	"regexp"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// matches http://localhost:<port> or http://127.0.0.1:<port>, any port -
// Vite bumps to the next free port whenever 5173 is taken, so pinning to one
// exact origin makes CORS break every time that happens in local dev.
var localOriginRe = regexp.MustCompile(`^https?://(localhost|127\.0\.0\.1)(:\d+)?$`)

func CORS(cfg *config.Config) gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			return origin == cfg.ClientURL || localOriginRe.MatchString(origin)
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	})
}
