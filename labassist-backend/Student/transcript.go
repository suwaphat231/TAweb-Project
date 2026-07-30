package student

import (
	"io"
	"net/http"
	"strings"
	"time"

	"labassist/database"

	"github.com/gin-gonic/gin"
)

// maxTranscriptSize caps the uploaded PDF at 10MB — generous for a
// transcript scan/export while keeping a single bytea row reasonable.
const maxTranscriptSize = 10 << 20

// TranscriptResponse is the metadata returned after upload or on lookup;
// the raw PDF bytes are only ever served via DownloadTranscript.
type TranscriptResponse struct {
	FileName   string `json:"file_name"`
	FileSize   int64  `json:"file_size"`
	UploadedAt string `json:"uploaded_at"`
}

func toTranscriptResponse(fileName string, fileSize int64, uploadedAt time.Time) TranscriptResponse {
	return TranscriptResponse{
		FileName:   fileName,
		FileSize:   fileSize,
		UploadedAt: uploadedAt.Format(time.RFC3339),
	}
}

// UploadTranscript godoc
// @Summary      อัปโหลด Transcript (PDF) ของตัวเอง
// @Description  แต่ละนักศึกษาเก็บ Transcript ได้ไฟล์เดียว อัปโหลดซ้ำจะแทนที่ไฟล์เดิม
// @Tags         student
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        file  formData  file  true  "ไฟล์ Transcript (.pdf, ไม่เกิน 10MB)"
// @Success      200   {object}  TranscriptResponse
// @Failure      400   {object}  handlers.ErrorResponse
// @Router       /student/transcript [post]
func (h *Handler) UploadTranscript(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	sid := studentID.(uint)

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pdf file is required"})
		return
	}
	if !strings.HasSuffix(strings.ToLower(fileHeader.Filename), ".pdf") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only .pdf files are allowed"})
		return
	}
	if fileHeader.Size > maxTranscriptSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file exceeds 10MB limit"})
		return
	}

	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot open uploaded file"})
		return
	}
	defer f.Close()

	data := make([]byte, fileHeader.Size)
	if _, err := io.ReadFull(f, data); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot read uploaded file"})
		return
	}
	// http.DetectContentType only inspects the first 512 bytes, so this is a
	// cheap sanity check that the .pdf extension isn't hiding something else.
	if http.DetectContentType(data) != "application/pdf" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "uploaded file is not a valid pdf"})
		return
	}

	t, err := database.UpsertTranscript(sid, fileHeader.Filename, data)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save transcript"})
		return
	}

	c.JSON(http.StatusOK, toTranscriptResponse(t.FileName, t.FileSize, t.UploadedAt))
}

// GetTranscript godoc
// @Summary      ดูข้อมูล Transcript ของตัวเอง
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  TranscriptResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /student/transcript [get]
func (h *Handler) GetTranscript(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	sid := studentID.(uint)

	t, ok := database.TranscriptByUserID(sid)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "no transcript uploaded yet"})
		return
	}
	c.JSON(http.StatusOK, toTranscriptResponse(t.FileName, t.FileSize, t.UploadedAt))
}

// DownloadTranscript godoc
// @Summary      ดาวน์โหลดไฟล์ Transcript (PDF) ของตัวเอง
// @Tags         student
// @Produce      application/pdf
// @Security     BearerAuth
// @Success      200  {file}    file
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /student/transcript/file [get]
func (h *Handler) DownloadTranscript(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	sid := studentID.(uint)

	t, ok := database.TranscriptByUserID(sid)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "no transcript uploaded yet"})
		return
	}
	c.Header("Content-Disposition", `inline; filename="`+t.FileName+`"`)
	c.Data(http.StatusOK, "application/pdf", t.FileData)
}
