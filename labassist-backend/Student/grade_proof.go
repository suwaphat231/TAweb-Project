package student

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
)

// gradeRank maps letter grades to numeric rank for comparison.
// Higher rank = better grade.
var gradeRank = map[string]int{
	"D": 1, "D+": 2, "C": 3, "C+": 4, "B": 5, "B+": 6, "A": 7,
}

// minGradeRe parses "เกรดเฉลี่ยขั้นต่ำ: X" written at the start of a course's
// requirements text. Longer alternatives (B+, C+, D+) must come before the
// single-letter ones so the regex engine matches them first.
var minGradeRe = regexp.MustCompile(`เกรดเฉลี่ยขั้นต่ำ:\s*(A|B\+|B|C\+|C|D\+|D)`)

func minGradeFromRequirements(req *string) string {
	if req == nil {
		return ""
	}
	m := minGradeRe.FindStringSubmatch(*req)
	if m == nil {
		return ""
	}
	return m[1]
}

// gradeAtLeast returns true when grade meets or exceeds min.
// Returns true for any unknown grade string to avoid false positives.
func gradeAtLeast(grade, min string) bool {
	gv, gok := gradeRank[grade]
	mv, mok := gradeRank[min]
	if !gok || !mok {
		return true
	}
	return gv >= mv
}

// maxGradeProofSize caps the uploaded grade image at 5MB — generous for a
// phone screenshot of MyReg while keeping a single binary row reasonable.
const maxGradeProofSize = 5 << 20

// UploadGradeProof godoc
// @Summary      แนบรูปภาพเกรดยืนยันสำหรับใบสมัคร
// @Description  ใช้เมื่อวิชานั้นเปิดให้ต้องแนบรูปเกรด (require_grade_proof) — อัปโหลดซ้ำจะแทนที่รูปเดิม ระบบจะ OCR เกรดจากรูปโดยอัตโนมัติ
// @Tags         student
// @Accept       multipart/form-data
// @Produce      json
// @Security     BearerAuth
// @Param        id    path      int   true  "Application ID"
// @Param        file  formData  file  true  "รูปภาพเกรด (.jpg, .jpeg, .png, ไม่เกิน 5MB)"
// @Success      200   {object}  models.Application
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      404   {object}  handlers.ErrorResponse
// @Router       /student/applications/{id}/grade-proof [post]
func (h *Handler) UploadGradeProof(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))

	if _, ok := database.ApplicationByIDForStudent(uint(id), studentID.(uint)); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file is required"})
		return
	}
	if fileHeader.Size > maxGradeProofSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file exceeds 5MB limit"})
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
	// cheap sanity check that the file is actually an image.
	contentType := http.DetectContentType(data)
	if contentType != "image/jpeg" && contentType != "image/png" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only .jpg and .png images are allowed"})
		return
	}

	updated, ok := database.SetApplicationGradeProof(uint(id), fileHeader.Filename, data)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	// OCR: extract the grade from the image and compare with what the student
	// self-reported. Per Rule 3, OCR results are advisory only — none of the
	// cases below block the application; all produce a stored warning so the
	// instructor can judge.
	if app, ok := database.ApplicationByID(uint(id)); ok {
		if course, ok := database.CourseByID(app.CourseID); ok {
			minGrade := minGradeFromRequirements(course.Requirements)
			ocrGrade, ocrOK := ocrGradeFromImage(h.cfg.OCRServiceURL, course.Code, data, fileHeader.Filename)

			var warnParts []string
			if !ocrOK {
				warnParts = append(warnParts, "OCR ไม่สามารถอ่านเกรดจากรูปได้ — อาจารย์จะตรวจสอบเอง")
			} else {
				if app.Grade != nil && *app.Grade != ocrGrade {
					warnParts = append(warnParts, fmt.Sprintf(
						"เกรดที่กรอก (%s) ต่างจากที่อ่านได้จากรูป (%s)", *app.Grade, ocrGrade,
					))
				}
				if minGrade != "" && !gradeAtLeast(ocrGrade, minGrade) {
					warnParts = append(warnParts, fmt.Sprintf(
						"เกรดที่อ่านได้ (%s) ต่ำกว่าเกณฑ์ขั้นต่ำ (%s)", ocrGrade, minGrade,
					))
				}
			}

			var warn *string
			if len(warnParts) > 0 {
				s := strings.Join(warnParts, " — ")
				warn = &s
			}

			if u, ok := database.UpdateApplication(uint(id), func(a *models.Application) {
				a.OcrWarning = warn
			}); ok {
				updated = u
			}

			if warn != nil {
				c.JSON(http.StatusOK, gin.H{
					"application": updated.StudentView(),
					"ocr_warning": *warn,
				})
				return
			}
		}
	}

	c.JSON(http.StatusOK, updated.StudentView())
}

// GetGradeProof godoc
// @Summary      ดูรูปภาพเกรดที่แนบไว้ (ของตัวเอง)
// @Tags         student
// @Produce      image/*
// @Security     BearerAuth
// @Param        id  path  int  true  "Application ID"
// @Success      200  {file}    file
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /student/applications/{id}/grade-proof [get]
func (h *Handler) GetGradeProof(c *gin.Context) {
	studentID, _ := c.Get("user_id")
	id, _ := strconv.Atoi(c.Param("id"))

	if _, ok := database.ApplicationByIDForStudent(uint(id), studentID.(uint)); !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}

	fileName, data, ok := database.ApplicationGradeProofData(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "no grade proof uploaded yet"})
		return
	}
	c.Header("Content-Disposition", `inline; filename="`+fileName+`"`)
	c.Data(http.StatusOK, http.DetectContentType(data), data)
}

// ocrGradeFromImage sends the image to the OCR service and returns the grade
// found for courseCode. Returns ("", false) on any failure so callers can
// treat OCR as best-effort without disrupting the upload flow.
func ocrGradeFromImage(ocrURL, courseCode string, data []byte, filename string) (string, bool) {
	codesJSON, err := json.Marshal([]string{courseCode})
	if err != nil {
		return "", false
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", false
	}
	if _, err := io.Copy(part, bytes.NewReader(data)); err != nil {
		return "", false
	}
	if err := writer.WriteField("criteria_json", "[]"); err != nil {
		return "", false
	}
	if err := writer.WriteField("course_codes_json", string(codesJSON)); err != nil {
		return "", false
	}
	writer.Close()

	req, err := http.NewRequest(http.MethodPost, ocrURL+"/api/ocr/process-transcript", &body)
	if err != nil {
		return "", false
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()

	var result struct {
		ExtractedData map[string]string `json:"extracted_data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", false
	}

	grade, found := result.ExtractedData[courseCode]
	return grade, found
}
