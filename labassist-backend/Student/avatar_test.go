package student

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAvatarNormalization(t *testing.T) {
	for _, format := range []string{"png", "jpeg"} {
		t.Run(format, func(t *testing.T) {
			src := image.NewRGBA(image.Rect(0, 0, 400, 200))
			for y := 0; y < 200; y++ {
				for x := 100; x < 300; x++ {
					src.Set(x, y, color.White)
				}
			}
			var input bytes.Buffer
			if format == "png" {
				png.Encode(&input, src)
			} else {
				jpeg.Encode(&input, src, nil)
			}
			url, err := avatarDataURL(input.Bytes())
			if err != nil {
				t.Fatal(err)
			}
			data, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(url, "data:image/jpeg;base64,"))
			if err != nil {
				t.Fatal(err)
			}
			out, err := jpeg.Decode(bytes.NewReader(data))
			if err != nil {
				t.Fatal(err)
			}
			if out.Bounds().Dx() != 256 || out.Bounds().Dy() != 256 {
				t.Fatal("wrong avatar dimensions")
			}
			r, _, _, _ := out.At(128, 128).RGBA()
			if r < 60000 {
				t.Fatal("center crop not preserved")
			}
		})
	}
}

func TestAvatarRejectsInvalidUploadsBeforeDatabase(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, data := range [][]byte{[]byte("<svg></svg>"), []byte("not an image"), bytes.Repeat([]byte("x"), maxAvatarBytes+1)} {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, _ := writer.CreateFormFile("file", "avatar.png")
		part.Write(data)
		writer.Close()
		r := gin.New()
		r.POST("/avatar", NewHandler(nil).UploadAvatar)
		req := httptest.NewRequest(http.MethodPost, "/avatar", &body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("status %d: %s", w.Code, w.Body.String())
		}
	}
}
