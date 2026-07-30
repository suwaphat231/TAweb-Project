package staff

import (
	"labassist/database"
	"labassist/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

type updateProfileRequest struct {
	FullName *string `json:"full_name,omitempty"`
	Email    *string `json:"email,omitempty"`
	Faculty  *string `json:"faculty,omitempty"`
}

// GetProfile godoc
// @Summary      ข้อมูลโปรไฟล์ของเจ้าหน้าที่ (ตัวเอง)
// @Tags         staff
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  models.User
// @Router       /staff/profile [get]
func (h *Handler) GetProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")
	user, _ := database.UserByID(userID.(uint))
	c.JSON(http.StatusOK, user)
}

// UpdateProfile godoc
// @Summary      แก้ไขโปรไฟล์ของเจ้าหน้าที่ (ตัวเอง)
// @Tags         staff
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      updateProfileRequest  true  "ข้อมูลโปรไฟล์"
// @Success      200   {object}  models.User
// @Router       /staff/profile [put]
func (h *Handler) UpdateProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var body updateProfileRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updated, ok := database.UpdateUser(userID.(uint), func(u *models.User) {
		if body.FullName != nil {
			u.FullName = *body.FullName
		}
		if body.Email != nil {
			u.Email = *body.Email
		}
		if body.Faculty != nil {
			u.Faculty = body.Faculty
		}
	})
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, updated)
}
