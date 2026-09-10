package handlers

import (
	"context"
	"labassist/config"
	"labassist/database"
	"labassist/middleware"
	"labassist/models"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/api/idtoken"
)

// LoginRequest is the request body for login
type LoginRequest struct {
	Username string `json:"username" binding:"required" example:"admin"`
	Password string `json:"password" binding:"required" example:"secret"`
}

// LoginResponse is returned on successful login
type LoginResponse struct {
	Token string      `json:"token" example:"eyJhbGci..."`
	User  models.User `json:"user"`
}

// GoogleLoginRequest is the request body for Google OAuth
type GoogleLoginRequest struct {
	Credential string `json:"credential" binding:"required" example:"eyJhbGci..."`
}

// GoogleLoginResponse is returned on successful Google login
type GoogleLoginResponse struct {
	Token     string      `json:"token" example:"eyJhbGci..."`
	User      models.User `json:"user"`
	IsNewUser bool        `json:"is_new_user" example:"false"`
}

// MeResponse wraps the authenticated user
type MeResponse struct {
	User models.User `json:"user"`
}

type AuthHandler struct{ cfg *config.Config }

func NewAuthHandler(cfg *config.Config) *AuthHandler { return &AuthHandler{cfg: cfg} }

// Login godoc
// @Summary      เข้าสู่ระบบ
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      LoginRequest  true  "ข้อมูลล็อกอิน"
// @Success      200   {object}  LoginResponse
// @Failure      400   {object}  ErrorResponse
// @Failure      401   {object}  ErrorResponse
// @Failure      403   {object}  ErrorResponse
// @Router       /auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var body struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอก username และ password"})
		return
	}

	user, ok := database.UserByUsername(body.Username)
	if !ok {
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

// GoogleLogin godoc
// @Summary      เข้าสู่ระบบด้วย Google
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body  body      GoogleLoginRequest  true  "Google credential"
// @Success      200   {object}  GoogleLoginResponse
// @Failure      400   {object}  ErrorResponse
// @Failure      401   {object}  ErrorResponse
// @Failure      403   {object}  ErrorResponse
// @Router       /auth/google [post]
func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	var body struct {
		Credential string `json:"credential" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "credential required"})
		return
	}

	if strings.TrimSpace(h.cfg.GoogleClientID) == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Google Sign-In ยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	payload, err := idtoken.Validate(ctx, body.Credential, h.cfg.GoogleClientID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Google token ไม่ถูกต้อง"})
		return
	}

	if payload.Issuer != "accounts.google.com" && payload.Issuer != "https://accounts.google.com" || payload.Subject == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Google token ไม่ถูกต้อง"})
		return
	}
	googleSub := payload.Subject
	email, _ := payload.Claims["email"].(string)
	name, _ := payload.Claims["name"].(string)

	if !isUniversityGoogleAccount(payload) {
		c.JSON(http.StatusForbidden, gin.H{"error": "กรุณาใช้อีเมลมหาวิทยาลัย (@silpakorn.edu) เท่านั้น"})
		return
	}

	isNewUser := false

	// ค้นหาจาก google_sub ก่อน แล้วค่อย fallback ไป email
	user, ok := database.UserByGoogleSub(googleSub)
	if !ok {
		user, ok = database.UserByEmail(email)
		if !ok {
			// ไม่เจอเลย → สร้าง student ใหม่
			created, err := database.CreateUser(models.User{
				FullName:  name,
				Email:     email,
				Role:      models.RoleStudent,
				GoogleSub: &googleSub,
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างบัญชีได้"})
				return
			}
			user = created
			isNewUser = true
		} else if !user.IsActive {
			c.JSON(http.StatusForbidden, gin.H{"error": "บัญชีถูกระงับ"})
			return
		} else if user.GoogleSub != nil && *user.GoogleSub != googleSub {
			c.JSON(http.StatusConflict, gin.H{"error": "บัญชีนี้ผูกกับบัญชี Google อื่นแล้ว กรุณาติดต่อผู้ดูแลระบบ"})
			return
		} else if user.GoogleSub == nil {
			// เจอด้วย email แต่ยังไม่มี google_sub → อัพเดต
			updated, saved := database.UpdateUser(user.ID, func(u *models.User) { u.GoogleSub = &googleSub })
			if !saved {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถผูกบัญชี Google ได้ กรุณาลองใหม่"})
				return
			}
			user = updated
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

// Me godoc
// @Summary      ดูข้อมูลผู้ใช้ปัจจุบัน
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  MeResponse
// @Failure      404  {object}  ErrorResponse
// @Router       /auth/me [get]
func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get("user_id")
	user, ok := database.UserByID(userID.(uint))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบผู้ใช้"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user})
}

// Logout godoc
// @Summary      ออกจากระบบ
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  MessageResponse
// @Router       /auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "ออกจากระบบแล้ว"})
}

// Only verified accounts managed by the university may use this sign-in flow.
func isUniversityGoogleAccount(payload *idtoken.Payload) bool {
	email, _ := payload.Claims["email"].(string)
	verified, _ := payload.Claims["email_verified"].(bool)
	domain, _ := payload.Claims["hd"].(string)
	return verified && domain == "silpakorn.edu" && strings.HasSuffix(email, "@silpakorn.edu") && strings.Count(email, "@") == 1 && len(email) > len("@silpakorn.edu")
}
