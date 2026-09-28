package student

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

// ocrStudentInfoResponse mirrors the OCR service's StudentInfoExtractResult.
// Only allowlisted fields are present; sensitive fields are never returned
// by the OCR service and are never stored here.
type ocrStudentInfoResponse struct {
	StudentID      *string `json:"student_id"`
	FullNameTh     *string `json:"full_name_th"`
	FullNameEn     *string `json:"full_name_en"`
	EducationLevel *string `json:"education_level"`
	Curriculum     *string `json:"curriculum"`
	Faculty        *string `json:"faculty"`
	Campus         *string `json:"campus"`
	Confidence     float64 `json:"confidence"`
}

// StudentInfoFieldStr is a side-by-side comparison for a string field.
type StudentInfoFieldStr struct {
	OCR     *string `json:"ocr"`
	Current *string `json:"current"`
	Match   bool    `json:"match"`
}

// StudentInfoComparison is the field-by-field comparison between OCR result
// and the student's current profile. Fields without a profile counterpart
// (education_level, curriculum, campus, full_name_en) always have Current=nil.
type StudentInfoComparison struct {
	StudentID      StudentInfoFieldStr `json:"student_id"`
	FullNameTh     StudentInfoFieldStr `json:"full_name_th"`
	FullNameEn     StudentInfoFieldStr `json:"full_name_en"`
	EducationLevel StudentInfoFieldStr `json:"education_level"`
	Curriculum     StudentInfoFieldStr `json:"curriculum"`
	Faculty        StudentInfoFieldStr `json:"faculty"`
	Campus         StudentInfoFieldStr `json:"campus"`
}

// StudentInfoUploadResponse is returned by both the upload and GET endpoints.
type StudentInfoUploadResponse struct {
	Document   models.StudentInfoDocument `json:"document"`
	Comparison StudentInfoComparison      `json:"comparison"`
}

var allowedStudentInfoExt = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".pdf": true,
}

const (
	maxPDFPages    = 5
	minTextRunes   = 50
	maxFileBytes   = 10 * 1024 * 1024
)

// ── Text-layer regex patterns (used when PDF has a searchable text layer) ────

var (
	reTextStudentID  = regexp.MustCompile(`\b(\d{10})\b`)
	reTextFullNameTH = regexp.MustCompile(`(?:ชื่อ[-–]?นามสกุล|ชื่อนามสกุล|ชื่อ[-–]?สกุล)[^\n]*[:\s：]+([^\n]{2,200})`)
	reTextFullNameEN = regexp.MustCompile(`(?i)(?:full[\s_-]?name|ชื่อ[^\n]*อังกฤษ[^\n]*)[:\s：]+([A-Za-z][^\n]{2,100})`)
	reTextEduLevel   = regexp.MustCompile(`(?:ระดับการศึกษา|ระดับ\s)[:\s：]*([^\n]{2,100})`)
	reTextCurriculum = regexp.MustCompile(`หลักสูตร[:\s：]*([^\n]{2,200})`)
	reTextFaculty    = regexp.MustCompile(`(?:ภาควิชา|คณะ\s)[:\s：]*([^\n]{2,200})`)
	reTextCampus     = regexp.MustCompile(`วิทยาเขต[:\s：]*([^\n]{2,100})`)
)

// ── Magic-byte helpers ────────────────────────────────────────────────────────

func validateFileMagic(ext string, data []byte) bool {
	switch ext {
	case ".pdf":
		return len(data) >= 5 && string(data[:5]) == "%PDF-"
	case ".png":
		return len(data) >= 4 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47
	case ".jpg", ".jpeg":
		return len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF
	}
	return false
}

// detectImageContentType inspects magic bytes to choose the Content-Type for serving.
func detectImageContentType(data []byte) string {
	if len(data) >= 4 && data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 {
		return "image/png"
	}
	if len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
		return "image/jpeg"
	}
	return "application/octet-stream"
}

// ── PDF helpers (require poppler-utils in $PATH) ──────────────────────────────

func pdfPageCount(path string) (int, error) {
	out, err := exec.Command("pdfinfo", path).Output()
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(string(out), "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "Pages:") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				var n int
				if _, err := fmt.Sscanf(strings.TrimSpace(parts[1]), "%d", &n); err == nil {
					return n, nil
				}
			}
		}
	}
	return 0, fmt.Errorf("could not parse page count from pdfinfo output")
}

func extractPDFText(path string) string {
	out, err := exec.Command("pdftotext", "-enc", "UTF-8", "-q", path, "-").Output()
	if err != nil {
		return ""
	}
	return string(out)
}

func renderPDFFirstPage(path string) ([]byte, error) {
	dir, err := os.MkdirTemp("", "labassist-pdf-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)

	outPrefix := filepath.Join(dir, "p")
	if err := exec.Command(
		"pdftoppm", "-r", "200", "-png", "-f", "1", "-l", "1", path, outPrefix,
	).Run(); err != nil {
		return nil, fmt.Errorf("pdftoppm: %w", err)
	}

	files, _ := filepath.Glob(outPrefix + "*.png")
	if len(files) == 0 {
		return nil, fmt.Errorf("pdftoppm produced no output")
	}
	return os.ReadFile(files[0])
}

// ── Text-layer field parser ───────────────────────────────────────────────────

func parseTextLayerFields(text string) *ocrStudentInfoResponse {
	r := &ocrStudentInfoResponse{Confidence: 1.0}

	if m := reTextStudentID.FindStringSubmatch(text); len(m) > 1 {
		v := m[1]
		r.StudentID = &v
	}
	setStr := func(re *regexp.Regexp) *string {
		m := re.FindStringSubmatch(text)
		if len(m) > 1 {
			v := strings.TrimSpace(m[1])
			if v != "" {
				return &v
			}
		}
		return nil
	}
	r.FullNameTh = setStr(reTextFullNameTH)
	r.FullNameEn = setStr(reTextFullNameEN)
	r.EducationLevel = setStr(reTextEduLevel)
	r.Curriculum = setStr(reTextCurriculum)
	r.Faculty = setStr(reTextFaculty)
	r.Campus = setStr(reTextCampus)
	return r
}

// ── OCR service call ──────────────────────────────────────────────────────────

func callStudentInfoOCR(ocrURL, filename string, imageBytes []byte) (*ocrStudentInfoResponse, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("internal error")
	}
	if _, err := part.Write(imageBytes); err != nil {
		return nil, fmt.Errorf("internal error")
	}
	writer.Close()

	req, err := http.NewRequest(http.MethodPost, ocrURL+"/api/ocr/student-information/extract", &body)
	if err != nil {
		return nil, fmt.Errorf("internal error")
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ไม่สามารถติดต่อบริการ OCR ได้ กรุณาลองใหม่อีกครั้ง")
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errBody struct {
			Detail string `json:"detail"`
		}
		if jsonErr := json.NewDecoder(resp.Body).Decode(&errBody); jsonErr == nil && errBody.Detail != "" {
			return nil, fmt.Errorf("บริการ OCR แจ้งข้อผิดพลาด: %s", errBody.Detail)
		}
		return nil, fmt.Errorf("บริการ OCR ตอบกลับ HTTP %d", resp.StatusCode)
	}

	var result ocrStudentInfoResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("บริการ OCR ส่งข้อมูลกลับมาไม่ถูกต้อง")
	}
	return &result, nil
}

// ── Comparison builder ────────────────────────────────────────────────────────

func buildComparison(doc models.StudentInfoDocument, user models.User) StudentInfoComparison {
	strMatch := func(a, b *string) bool {
		if a == nil || b == nil {
			return false
		}
		return strings.EqualFold(strings.TrimSpace(*a), strings.TrimSpace(*b))
	}

	currentFullName := user.FullName
	return StudentInfoComparison{
		StudentID: StudentInfoFieldStr{
			OCR:     doc.OcrStudentID,
			Current: user.StudentID,
			Match:   strMatch(doc.OcrStudentID, user.StudentID),
		},
		FullNameTh: StudentInfoFieldStr{
			OCR:     doc.OcrFullNameTh,
			Current: &currentFullName,
			Match:   strMatch(doc.OcrFullNameTh, &currentFullName),
		},
		FullNameEn: StudentInfoFieldStr{
			OCR:     doc.OcrFullNameEn,
			Current: nil,
			Match:   false,
		},
		EducationLevel: StudentInfoFieldStr{
			OCR:     doc.OcrEducationLevel,
			Current: nil,
			Match:   false,
		},
		Curriculum: StudentInfoFieldStr{
			OCR:     doc.OcrCurriculum,
			Current: nil,
			Match:   false,
		},
		Faculty: StudentInfoFieldStr{
			OCR:     doc.OcrFaculty,
			Current: user.Faculty,
			Match:   facultyMatch(doc.OcrFaculty, user.Faculty),
		},
		Campus: StudentInfoFieldStr{
			OCR:     doc.OcrCampus,
			Current: nil,
			Match:   false,
		},
	}
}

// facultyMatch returns true when both sides normalise to the same known faculty.
func facultyMatch(ocr, current *string) bool {
	if ocr == nil || current == nil {
		return false
	}
	return normalizeFaculty(*ocr) == normalizeFaculty(*current)
}

func normalizeFaculty(s string) string {
	lower := strings.ToLower(s)
	if strings.Contains(lower, "สารสนเทศ") || strings.Contains(lower, "it") {
		return "it"
	}
	if strings.Contains(lower, "คอมพิวเตอร์") || strings.Contains(lower, "cs") {
		return "cs"
	}
	return strings.TrimSpace(s)
}

func knownFacultyName(s string) string {
	lower := strings.ToLower(s)
	if strings.Contains(lower, "สารสนเทศ") || strings.Contains(lower, "it") {
		return "เทคโนโลยีสารสนเทศ"
	}
	if strings.Contains(lower, "คอมพิวเตอร์") || strings.Contains(lower, "cs") {
		return "วิทยาการคอมพิวเตอร์"
	}
	return strings.TrimSpace(s)
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// UploadStudentInfo godoc
// @Summary      อัปโหลดเอกสารข้อมูลนักศึกษาเพื่อให้ระบบ OCR อ่านข้อมูล
// @Tags         student
// @Accept       mpfd
// @Produce      json
// @Security     BearerAuth
// @Param        file  formData  file  true  "เอกสาร/บัตรนักศึกษา (PDF/PNG/JPG, สูงสุด 10 MB)"
// @Success      200   {object}  StudentInfoUploadResponse
// @Failure      400   {object}  map[string]string
// @Failure      502   {object}  map[string]string
// @Router       /student/profile/student-info [post]
func (h *Handler) UploadStudentInfo(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid := userID.(uint)

	user, ok := database.UserByID(uid)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่พบข้อมูลนักศึกษา"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาแนบไฟล์"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	if !allowedStudentInfoExt[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf(
			"ไม่รองรับไฟล์นามสกุล '%s' กรุณาอัปโหลด PDF, PNG หรือ JPG", ext,
		)})
		return
	}
	if fileHeader.Size > maxFileBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไฟล์ขนาดใหญ่เกินไป กรุณาอัปโหลดไฟล์ไม่เกิน 10 MB"})
		return
	}

	src, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่สามารถอ่านไฟล์ได้"})
		return
	}
	defer src.Close()

	fileBytes, err := io.ReadAll(src)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}

	if !validateFileMagic(ext, fileBytes) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "เนื้อหาไฟล์ไม่ตรงกับนามสกุลที่ระบุ"})
		return
	}

	var ocrResult *ocrStudentInfoResponse
	storeFileName := fileHeader.Filename
	storeData := fileBytes

	if ext == ".pdf" {
		// Write to temp file — Go backend must process PDF, never forward raw PDF to OCR service
		tmpFile, err := os.CreateTemp("", "labassist-si-*.pdf")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
		tmpPath := tmpFile.Name()
		defer os.Remove(tmpPath)
		if _, wErr := tmpFile.Write(fileBytes); wErr != nil {
			tmpFile.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
			return
		}
		tmpFile.Close()

		// Enforce page limit
		pages, pErr := pdfPageCount(tmpPath)
		if pErr == nil && pages > maxPDFPages {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf(
				"PDF มี %d หน้า กรุณาอัปโหลด PDF ที่มีไม่เกิน %d หน้า", pages, maxPDFPages,
			)})
			return
		}

		// Render page 1 to PNG for storage and display
		pngBytes, renderErr := renderPDFFirstPage(tmpPath)

		// Check for searchable text layer
		text := extractPDFText(tmpPath)
		hasTextLayer := len([]rune(strings.TrimSpace(text))) >= minTextRunes

		if hasTextLayer {
			// Extract fields directly from text — no OCR needed
			ocrResult = parseTextLayerFields(text)
		} else if renderErr == nil {
			// No text layer — run OCR on the rendered PNG
			ocrResult, err = callStudentInfoOCR(h.cfg.OCRServiceURL, "page.png", pngBytes)
			if err != nil {
				c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
				return
			}
		} else {
			c.JSON(http.StatusBadGateway, gin.H{"error": "ไม่สามารถประมวลผล PDF ได้ กรุณาลองอัปโหลดไฟล์รูปภาพแทน"})
			return
		}

		// Always store the rendered PNG for display (not the original PDF)
		if renderErr == nil {
			storeData = pngBytes
			base := strings.TrimSuffix(fileHeader.Filename, ext)
			storeFileName = base + "_p1.png"
		}
	} else {
		// Image file — call OCR service directly (images are safe to forward)
		ocrResult, err = callStudentInfoOCR(h.cfg.OCRServiceURL, fileHeader.Filename, fileBytes)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
	}

	doc, dbErr := database.UpsertStudentInfoDocument(uid, storeFileName, storeData, database.StudentInfoOCR{
		StudentID:      ocrResult.StudentID,
		FullNameTh:     ocrResult.FullNameTh,
		FullNameEn:     ocrResult.FullNameEn,
		EducationLevel: ocrResult.EducationLevel,
		Curriculum:     ocrResult.Curriculum,
		Faculty:        ocrResult.Faculty,
		Campus:         ocrResult.Campus,
		Confidence:     ocrResult.Confidence,
	})
	if dbErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกข้อมูลไม่สำเร็จ"})
		return
	}

	c.JSON(http.StatusOK, StudentInfoUploadResponse{
		Document:   doc,
		Comparison: buildComparison(doc, user),
	})
}

// GetStudentInfo godoc
// @Summary      ดูสถานะเอกสารข้อมูลนักศึกษาและผลการเปรียบเทียบ
// @Tags         student
// @Produce      json
// @Security     BearerAuth
// @Success      200  {object}  StudentInfoUploadResponse
// @Failure      404  {object}  map[string]string
// @Router       /student/profile/student-info [get]
func (h *Handler) GetStudentInfo(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid := userID.(uint)

	doc, ok := database.StudentInfoDocumentByUserID(uid)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "ยังไม่มีเอกสาร"})
		return
	}
	user, ok := database.UserByID(uid)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, StudentInfoUploadResponse{
		Document:   doc,
		Comparison: buildComparison(doc, user),
	})
}

// ConfirmStudentInfo godoc
// @Summary      ยืนยันข้อมูลที่ OCR อ่านได้ และเลือกว่าจะอัปเดตโปรไฟล์หรือไม่
// @Tags         student
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body  map[string]bool  false  "{ \"apply_to_profile\": true }"
// @Success      200   {object}  StudentInfoUploadResponse
// @Failure      404   {object}  map[string]string
// @Router       /student/profile/student-info/confirm [post]
func (h *Handler) ConfirmStudentInfo(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid := userID.(uint)

	var body struct {
		ApplyToProfile bool `json:"apply_to_profile"`
	}
	_ = c.ShouldBindJSON(&body)

	doc, ok := database.StudentInfoDocumentByUserID(uid)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "ยังไม่มีเอกสาร"})
		return
	}

	if body.ApplyToProfile {
		_, _ = database.UpdateUser(uid, func(u *models.User) {
			if doc.OcrStudentID != nil {
				v := *doc.OcrStudentID
				u.StudentID = &v
			}
			// Apply Thai name to profile FullName (prefer Thai over English)
			if doc.OcrFullNameTh != nil {
				u.FullName = *doc.OcrFullNameTh
			}
			if doc.OcrFaculty != nil {
				normalized := knownFacultyName(*doc.OcrFaculty)
				u.Faculty = &normalized
			}
		})
	}

	confirmed, ok := database.ConfirmStudentInfoDocument(uid)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกข้อมูลไม่สำเร็จ"})
		return
	}
	user, ok := database.UserByID(uid)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	c.JSON(http.StatusOK, StudentInfoUploadResponse{
		Document:   confirmed,
		Comparison: buildComparison(confirmed, user),
	})
}

// GetStudentInfoFile godoc
// @Summary      ดาวน์โหลดภาพเอกสารข้อมูลนักศึกษาที่อัปโหลดไว้
// @Tags         student
// @Produce      image/jpeg
// @Security     BearerAuth
// @Success      200  {file}   binary
// @Failure      404  {object} map[string]string
// @Router       /student/profile/student-info/file [get]
func (h *Handler) GetStudentInfoFile(c *gin.Context) {
	userID, _ := c.Get("user_id")
	fileName, data, ok := database.StudentInfoImageByUserID(userID.(uint))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบเอกสาร"})
		return
	}
	contentType := detectImageContentType(data)
	c.Header("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, fileName))
	c.Data(http.StatusOK, contentType, data)
}
