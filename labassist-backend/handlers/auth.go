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
		c.JSON(http.StatusBadRequest, gin.H{"error": "username and password required"})
		return
	}

	var user models.User
	if err := database.DB.Where("username = ? AND is_active = true", body.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	if user.PasswordHash == nil || bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(body.Password)) != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token, err := middleware.SignToken(h.cfg, user.ID, string(user.Role), user.FullName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token error"})
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
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid Google token"})
		return
	}

	googleSub := payload.Subject
	email, _ := payload.Claims["email"].(string)
	name, _ := payload.Claims["name"].(string)

	var user models.User
	result := database.DB.Where("google_sub = ?", googleSub).First(&user)
	if result.Error != nil {
		// Auto-create student
		user = models.User{
			FullName:  name,
			Email:     email,
			Role:      models.RoleStudent,
			GoogleSub: &googleSub,
		}
		if err := database.DB.Create(&user).Error; err != nil {
			// Try to find by email if already exists
			database.DB.Where("email = ?", email).First(&user)
		}
	}

	if !user.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "account suspended"})
		return
	}

	token, err := middleware.SignToken(h.cfg, user.ID, string(user.Role), user.FullName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token error"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "user": user})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get("user_id")
	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}
