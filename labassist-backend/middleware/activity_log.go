package middleware

import (
	"labassist/database"
	"labassist/models"
	"time"

	"github.com/gin-gonic/gin"
)

func ActivityLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method == "OPTIONS" {
			c.Next()
			return
		}

		start := time.Now()
		c.Next()
		durationMs := time.Since(start).Milliseconds()

		entry := &models.ActivityLog{
			Method:     c.Request.Method,
			Path:       c.Request.URL.Path,
			StatusCode: c.Writer.Status(),
			IP:         c.ClientIP(),
			DurationMs: durationMs,
		}

		if uid, ok := c.Get("user_id"); ok {
			if id, ok := uid.(uint); ok {
				entry.UserID = &id
			}
		}
		if name, ok := c.Get("name"); ok {
			if n, ok := name.(string); ok {
				entry.UserName = n
			}
		}
		if role, ok := c.Get("role"); ok {
			if r, ok := role.(string); ok {
				entry.Role = r
			}
		}

		go database.DB.Create(entry)
	}
}
