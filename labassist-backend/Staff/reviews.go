package staff

import (
	"labassist/database"
	"net/http"

	"github.com/gin-gonic/gin"
)

// ListReviews godoc
// @Summary      รายการแบบฟอร์มที่รอตรวจสอบ (ทุก course ที่เปิดรับ Lab Boy)
// @Tags         staff
// @Produce      json
// @Security     BearerAuth
// @Param        status  query  string  false  "pending | verified | returned"
// @Param        q       query  string  false  "ค้นหารหัสวิชา / อาจารย์"
// @Success      200  {array}   models.FormReview
// @Router       /staff/reviews [get]
func (h *Handler) ListReviews(c *gin.Context) {
	status := c.Query("status")
	search := c.Query("q")
	reviews, err := database.ListFormReviews(status, search)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, reviews)
}
