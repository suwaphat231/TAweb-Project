package teacher

import (
	"labassist/database"
	"labassist/models"
	"net/http"

	"github.com/gin-gonic/gin"
)

// UpdateInstructorProfileRequest is the request body for updating an instructor's own profile
type UpdateInstructorProfileRequest struct {
	FullName *string `json:"full_name,omitempty" example:"ผู้ช่วยศาสตราจารย์ ดร.สมชาย ใจดี"`
	Email    *string `json:"email,omitempty" example:"somchai@su.ac.th"`
	Faculty  *string `json:"faculty,omitempty" example:"ภาควิชาวิทยาการคอมพิวเตอร์"`
}

// GetInstructorProfile godoc
// @Summary      ข้อมูลโปรไฟล์ของอาจารย์ (ตัวเอง)
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  models.User
// @Router       /instructor/profile [get]
func (h *Handler) GetInstructorProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")
	user, _ := database.UserByID(userID.(uint))
	c.JSON(http.StatusOK, user)
}

// UpdateInstructorProfile godoc
// @Summary      แก้ไขโปรไฟล์ของอาจารย์ (ตัวเอง)
// @Description  บันทึกลง database ทันที การเปลี่ยนแปลงจะแสดงในหน้าจัดการผู้ใช้ของแอดมินด้วย เพราะดึงจากข้อมูลผู้ใช้ชุดเดียวกัน
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      UpdateInstructorProfileRequest  true  "ข้อมูลโปรไฟล์ที่ต้องการแก้ไข"
// @Success      200   {object}  models.User
// @Router       /instructor/profile [put]
func (h *Handler) UpdateInstructorProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var body UpdateInstructorProfileRequest
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
