package student

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"labassist/database"
	"labassist/models"
)

const maxAvatarBytes = 5 << 20

// Normalize uploads to a small JPEG, discarding metadata and bounding storage.
func avatarDataURL(data []byte) (string, error) {
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "jpeg" && format != "png") {
		return "", fmt.Errorf("กรุณาเลือกไฟล์รูป JPG หรือ PNG ที่ถูกต้อง")
	}
	if cfg.Width < 1 || cfg.Height < 1 || cfg.Width > 8192 || cfg.Height > 8192 || int64(cfg.Width)*int64(cfg.Height) > 20_000_000 {
		return "", fmt.Errorf("รูปมีขนาดใหญ่เกินไป กรุณาใช้รูปไม่เกิน 20 ล้านพิกเซลและด้านละ 8192 พิกเซล")
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return "", fmt.Errorf("ไม่สามารถอ่านรูปภาพได้")
	}
	const size = 256
	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	side := min(cfg.Width, cfg.Height)
	x0, y0 := (cfg.Width-side)/2, (cfg.Height-side)/2
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			r, g, b, a := src.At(x0+x*side/size, y0+y*side/size).RGBA()
			// Composite transparent PNG pixels onto white.
			dst.SetRGBA(x, y, color.RGBA{uint8((r + 65535 - a) >> 8), uint8((g + 65535 - a) >> 8), uint8((b + 65535 - a) >> 8), 255})
		}
	}
	var out bytes.Buffer
	if err := jpeg.Encode(&out, dst, &jpeg.Options{Quality: 85}); err != nil {
		return "", err
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(out.Bytes()), nil
}

func (h *Handler) UploadAvatar(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAvatarBytes+(64<<10))
	if err := c.Request.ParseMultipartForm(maxAvatarBytes); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาเลือกไฟล์ JPG หรือ PNG ขนาดไม่เกิน 5 MB"})
		return
	}
	defer c.Request.MultipartForm.RemoveAll()
	f, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาเลือกรูปภาพ"})
		return
	}
	defer f.Close()
	if header.Size > maxAvatarBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปภาพต้องมีขนาดไม่เกิน 5 MB"})
		return
	}
	data, err := io.ReadAll(io.LimitReader(f, maxAvatarBytes+1))
	if err != nil || len(data) > maxAvatarBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่สามารถอ่านไฟล์รูปภาพได้"})
		return
	}
	url, err := avatarDataURL(data)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id := c.MustGet("user_id").(uint)
	// Update only this authenticated student's avatar, preserving profile fields.
	result := database.DB.Model(&models.User{}).Where("id = ? AND role = ?", id, models.RoleStudent).Update("avatar_url", url)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกรูปภาพไม่สำเร็จ"})
		return
	}
	user, ok := database.UserByID(id)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบผู้ใช้"})
		return
	}
	c.JSON(http.StatusOK, user)
}
