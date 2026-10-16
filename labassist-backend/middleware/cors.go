package middleware

import (
	"labassist/config"
	"os"
	"regexp"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

// matches http://localhost:<port> or http://127.0.0.1:<port>, any port -
// Vite bumps to the next free port whenever 5173 is taken, so pinning to one
// exact origin makes CORS break every time that happens in local dev.
var localOriginRe = regexp.MustCompile(`^https?://(localhost|127\.0\.0\.1)(:\d+)?$`)

// codespaceOriginRe matches this Codespace's own forwarded ports
// (https://<name>-<port>.app.github.dev). The browser sends that Origin even
// through the Vite proxy, so without it every login from a Codespace URL is
// rejected with 403. Nil outside Codespaces.
var codespaceOriginRe = func() *regexp.Regexp {
	name, domain := os.Getenv("CODESPACE_NAME"), os.Getenv("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN")
	if name == "" || domain == "" {
		return nil
	}
	return regexp.MustCompile(`^https://` + regexp.QuoteMeta(name) + `-\d+\.` + regexp.QuoteMeta(strings.TrimPrefix(domain, ".")) + `$`)
}()

func CORS(cfg *config.Config) gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			return origin == cfg.ClientURL || localOriginRe.MatchString(origin) ||
				(codespaceOriginRe != nil && codespaceOriginRe.MatchString(origin))
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	})
}
