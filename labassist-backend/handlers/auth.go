package handlers

import (
	"context"
	"labassist/config"
	"labassist/database"
	"labassist/middleware"
	"labassist/models"
	"net/http"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/api/idtoken"
)

type AuthHandler struct{ cfg *config.Config }

func NewAuthHandler(cfg *config.Config) *AuthHandler { return &AuthHandler{cfg: cfg} }

func (h *AuthHandler) Login(c *gin.Context) {
	var body struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอก username และ password"})
		return
	}

	var user models.User
	if err := database.DB.Where("username = ? AND role != 'student'", body.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"})
		return
	}

	if user.PasswordHash == nil || bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(body.Password)) != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"})
		return
	}

	if !user.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "บัญชีถูกระงับ"})
		return
	}

	token, err := middleware.SignToken(h.cfg, user.ID, string(user.Role), user.FullName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้าง token ได้"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "user": user})
}

func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	var body struct {
		Credential string `json:"credential" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "credential required"})
		return
	}

	payload, err := idtoken.Validate(context.Background(), body.Credential, h.cfg.GoogleClientID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Google token ไม่ถูกต้อง"})
		return
	}

	googleSub := payload.Subject
	email, _ := payload.Claims["email"].(string)
	name, _ := payload.Claims["name"].(string)

	var user models.User
	isNewUser := false

	// ค้นหาจาก google_sub ก่อน แล้วค่อย fallback ไป email
	err = database.DB.Where("google_sub = ?", googleSub).First(&user).Error
	if err != nil {
		err = database.DB.Where("email = ?", email).First(&user).Error
		if err != nil {
			// ไม่เจอเลย → สร้าง student ใหม่
			user = models.User{
				FullName:  name,
				Email:     email,
				Role:      models.RoleStudent,
				GoogleSub: &googleSub,
			}
			if dbErr := database.DB.Create(&user).Error; dbErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างบัญชีได้"})
				return
			}
			isNewUser = true
		} else if user.GoogleSub == nil {
			// เจอด้วย email แต่ยังไม่มี google_sub → อัพเดต
			database.DB.Model(&user).Update("google_sub", googleSub)
			user.GoogleSub = &googleSub
		}
	}

	if !user.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "บัญชีถูกระงับ"})
		return
	}

	token, err := middleware.SignToken(h.cfg, user.ID, string(user.Role), user.FullName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้าง token ได้"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "user": user, "is_new_user": isNewUser})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบผู้ใช้"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "ออกจากระบบแล้ว"})
}
