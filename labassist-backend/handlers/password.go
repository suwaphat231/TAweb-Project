package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"labassist/config"
	"labassist/database"
	"labassist/models"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/smtp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

const (
	minPasswordLength = 6
	resetCodeTTL      = 10 * time.Minute
	resetCodeCooldown = 60 * time.Second
	resetCodeAttempts = 5
)

// ChangePasswordRequest changes the password by proving the current one.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required" example:"oldsecret"`
	NewPassword     string `json:"new_password" binding:"required" example:"newsecret"`
}

// ResetPasswordRequest changes the password by proving the emailed code.
type ResetPasswordRequest struct {
	Code        string `json:"code" binding:"required" example:"123456"`
	NewPassword string `json:"new_password" binding:"required" example:"newsecret"`
}

// ForgotPasswordResponse tells the client where the code was sent.
type ForgotPasswordResponse struct {
	Email string `json:"email" example:"so****@su.ac.th"`
}

// resetCode is one outstanding emailed code. Codes live in memory only: a
// restart simply invalidates them and the user requests a new one.
type resetCode struct {
	hash     [32]byte
	expires  time.Time
	sentAt   time.Time
	attempts int
}

var (
	resetCodesMu sync.Mutex
	resetCodes   = map[uint]*resetCode{}
)

// ChangePassword godoc
// @Summary      เปลี่ยนรหัสผ่าน (ต้องกรอกรหัสผ่านปัจจุบัน)
// @Tags         auth
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      ChangePasswordRequest  true  "รหัสผ่านปัจจุบันและรหัสผ่านใหม่"
// @Success      200   {object}  map[string]string
// @Failure      400   {object}  ErrorResponse
// @Router       /auth/password/change [post]
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var body ChangePasswordRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่"})
		return
	}
	userID := c.GetUint("user_id")
	user, ok := database.UserByID(userID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if user.PasswordHash == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "บัญชีนี้ยังไม่มีรหัสผ่าน กรุณาใช้ \"ลืมรหัสผ่าน\" เพื่อตั้งรหัสผ่านผ่านอีเมล"})
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(*user.PasswordHash), []byte(body.CurrentPassword)) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสผ่านปัจจุบันไม่ถูกต้อง"})
		return
	}
	if !setPassword(c, userID, body.NewPassword) {
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว"})
}

// ForgotPassword godoc
// @Summary      ส่งรหัสยืนยันสำหรับเปลี่ยนรหัสผ่านไปที่อีเมลของผู้ใช้
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200   {object}  ForgotPasswordResponse
// @Failure      400   {object}  ErrorResponse
// @Failure      429   {object}  ErrorResponse
// @Router       /auth/password/forgot [post]
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	userID := c.GetUint("user_id")
	user, ok := database.UserByID(userID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if strings.TrimSpace(user.Email) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "บัญชีนี้ยังไม่มีอีเมล กรุณาเพิ่มอีเมลในข้อมูลส่วนตัวก่อน"})
		return
	}

	resetCodesMu.Lock()
	if prev, ok := resetCodes[userID]; ok && time.Since(prev.sentAt) < resetCodeCooldown {
		resetCodesMu.Unlock()
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "เพิ่งส่งรหัสไปแล้ว กรุณารอสักครู่ก่อนขอใหม่"})
		return
	}
	resetCodesMu.Unlock()

	code, err := randomCode()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถสร้างรหัสยืนยันได้"})
		return
	}
	if err := sendResetCode(h.cfg, user, code); err != nil {
		log.Printf("password reset email to user %d failed: %v", userID, err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ไม่สามารถส่งอีเมลได้ กรุณาติดต่อผู้ดูแลระบบ"})
		return
	}

	now := time.Now()
	resetCodesMu.Lock()
	resetCodes[userID] = &resetCode{hash: sha256.Sum256([]byte(code)), expires: now.Add(resetCodeTTL), sentAt: now}
	resetCodesMu.Unlock()

	c.JSON(http.StatusOK, ForgotPasswordResponse{Email: maskEmail(user.Email)})
}

// ResetPassword godoc
// @Summary      เปลี่ยนรหัสผ่านด้วยรหัสยืนยันที่ส่งไปทางอีเมล
// @Tags         auth
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      ResetPasswordRequest  true  "รหัสยืนยันและรหัสผ่านใหม่"
// @Success      200   {object}  map[string]string
// @Failure      400   {object}  ErrorResponse
// @Router       /auth/password/reset [post]
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var body ResetPasswordRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกรหัสยืนยันและรหัสผ่านใหม่"})
		return
	}
	userID := c.GetUint("user_id")

	resetCodesMu.Lock()
	entry, ok := resetCodes[userID]
	if !ok || time.Now().After(entry.expires) {
		delete(resetCodes, userID)
		resetCodesMu.Unlock()
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสยืนยันหมดอายุแล้ว กรุณาขอรหัสใหม่"})
		return
	}
	got := sha256.Sum256([]byte(strings.TrimSpace(body.Code)))
	if subtle.ConstantTimeCompare(got[:], entry.hash[:]) != 1 {
		entry.attempts++
		if entry.attempts >= resetCodeAttempts {
			delete(resetCodes, userID)
			resetCodesMu.Unlock()
			c.JSON(http.StatusBadRequest, gin.H{"error": "กรอกรหัสผิดเกินจำนวนครั้งที่กำหนด กรุณาขอรหัสใหม่"})
			return
		}
		resetCodesMu.Unlock()
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสยืนยันไม่ถูกต้อง"})
		return
	}
	resetCodesMu.Unlock()

	if !setPassword(c, userID, body.NewPassword) {
		return
	}
	resetCodesMu.Lock()
	delete(resetCodes, userID)
	resetCodesMu.Unlock()
	c.JSON(http.StatusOK, gin.H{"message": "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว"})
}

// setPassword validates and stores a new password, writing the error
// response itself and returning false on failure.
func setPassword(c *gin.Context, userID uint, password string) bool {
	if len(password) < minPasswordLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("รหัสผ่านต้องมีอย่างน้อย %d ตัวอักษร", minPasswordLength)})
		return false
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถบันทึกรหัสผ่านได้"})
		return false
	}
	hashed := string(hash)
	if _, ok := database.UpdateUser(userID, func(u *models.User) { u.PasswordHash = &hashed }); !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถบันทึกรหัสผ่านได้"})
		return false
	}
	return true
}

func randomCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func maskEmail(email string) string {
	at := strings.LastIndex(email, "@")
	if at <= 0 {
		return email
	}
	local := email[:at]
	keep := 2
	if len(local) <= keep {
		keep = 1
	}
	return local[:keep] + strings.Repeat("*", len(local)-keep) + email[at:]
}

func sendResetCode(cfg *config.Config, user models.User, code string) error {
	if cfg.SMTPHost == "" {
		if cfg.DevLogin {
			log.Printf("[dev] SMTP not configured; password reset code for %s is %s", user.Email, code)
			return nil
		}
		return fmt.Errorf("SMTP_HOST is not configured")
	}

	subject := "=?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte("รหัสยืนยันการเปลี่ยนรหัสผ่าน LabAssist")) + "?="
	text := fmt.Sprintf("สวัสดี %s\r\n\r\nรหัสยืนยันสำหรับเปลี่ยนรหัสผ่านของคุณคือ: %s\r\n\r\nรหัสนี้ใช้ได้ภายใน %d นาที หากคุณไม่ได้ขอเปลี่ยนรหัสผ่าน กรุณาเพิกเฉยต่ออีเมลนี้\r\n",
		user.FullName, code, int(resetCodeTTL.Minutes()))
	msg := strings.Join([]string{
		"From: " + cfg.SMTPFrom,
		"To: " + user.Email,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: base64",
		"",
		base64.StdEncoding.EncodeToString([]byte(text)),
	}, "\r\n")

	var auth smtp.Auth
	if cfg.SMTPUser != "" {
		auth = smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPassword, cfg.SMTPHost)
	}
	return smtp.SendMail(net.JoinHostPort(cfg.SMTPHost, cfg.SMTPPort), auth, cfg.SMTPFrom, []string{user.Email}, []byte(msg))
}
