package teacher

import (
	"labassist/database"
	"labassist/models"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// ReviewRequest is the request body for reviewing an application
type ReviewRequest struct {
	Status models.AppStatus `json:"status" binding:"required" example:"accepted"`
	Note   *string          `json:"note,omitempty" example:"ผ่านการคัดเลือก"`
}

// BulkReviewRequest is the request body for bulk reviewing applications
type BulkReviewRequest struct {
	ApplicationIDs []uint           `json:"application_ids" binding:"required"`
	Status         models.AppStatus `json:"status" binding:"required" example:"accepted"`
	Note           *string          `json:"note,omitempty"`
}

// Review godoc
// @Summary      ตรวจสอบใบสมัคร (อาจารย์/สตาฟ/แอดมิน)
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        id    path  int            true  "Application ID"
// @Param        body  body  ReviewRequest  true  "ผลการตรวจสอบ"
// @Success      200   {object}  models.Application
// @Failure      400   {object}  handlers.ErrorResponse
// @Failure      403   {object}  handlers.ErrorResponse
// @Failure      404   {object}  handlers.ErrorResponse
// @Router       /instructor/applications/{id}/review [put]
func (h *Handler) Review(c *gin.Context) {
	reviewerID, _ := c.Get("user_id")
	role, _ := c.Get("role")
	id, _ := strconv.Atoi(c.Param("id"))

	var body ReviewRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	app, ok := database.ApplicationByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}
	rid := reviewerID.(uint)
	if role.(string) == "instructor" {
		course, _ := database.CourseByID(app.CourseID)
		if !ownsCourse(c, course) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
	}

	prevStatus := app.Status

	if body.Status == models.AppAccepted && prevStatus != models.AppAccepted {
		course, _ := database.CourseByID(app.CourseID)
		if app.RoleApplied == models.RoleLabBoy && course.LabBoyAccepted >= course.LabBoySlots {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Lab Boy slots are full"})
			return
		}
	}

	now := time.Now()
	updated, _ := database.UpdateApplication(uint(id), func(a *models.Application) {
		a.Status = body.Status
		a.ReviewedAt = &now
		a.ReviewedByID = &rid
		a.Note = body.Note
	})

	// Manage accepted count
	if body.Status == models.AppAccepted && prevStatus != models.AppAccepted {
		database.AdjustCourseAccepted(app.CourseID, app.RoleApplied, 1)
	} else if prevStatus == models.AppAccepted && body.Status != models.AppAccepted {
		database.AdjustCourseAccepted(app.CourseID, app.RoleApplied, -1)
	}

	c.JSON(http.StatusOK, updated)
}

// GradeProof godoc
// @Summary      ดูรูปภาพเกรดที่ผู้สมัครแนบมา (อาจารย์/สตาฟ/แอดมิน)
// @Tags         instructor
// @Produce      image/*
// @Security     BearerAuth
// @Param        id  path  int  true  "Application ID"
// @Success      200  {file}    file
// @Failure      403  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Router       /instructor/applications/{id}/grade-proof [get]
func (h *Handler) GradeProof(c *gin.Context) {
	role, _ := c.Get("role")
	id, _ := strconv.Atoi(c.Param("id"))

	app, ok := database.ApplicationByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "application not found"})
		return
	}
	if role.(string) == "instructor" {
		course, _ := database.CourseByID(app.CourseID)
		if !ownsCourse(c, course) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
	}

	fileName, data, ok := database.ApplicationGradeProofData(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "no grade proof uploaded yet"})
		return
	}
	c.Header("Content-Disposition", `inline; filename="`+fileName+`"`)
	c.Data(http.StatusOK, http.DetectContentType(data), data)
}

// BulkReview godoc
// @Summary      ตรวจสอบใบสมัครแบบกลุ่ม
// @Tags         instructor
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        body  body      BulkReviewRequest  true  "รายการใบสมัครและผลการตรวจสอบ"
// @Success      200   {object}  handlers.BulkReviewResponse
// @Failure      400   {object}  handlers.ErrorResponse
// @Router       /instructor/applications/bulk-review [put]
func (h *Handler) BulkReview(c *gin.Context) {
	reviewerID, _ := c.Get("user_id")
	var body BulkReviewRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	rid := reviewerID.(uint)
	updated := database.BulkUpdateApplications(body.ApplicationIDs, func(a *models.Application) {
		a.Status = body.Status
		a.ReviewedAt = &now
		a.ReviewedByID = &rid
		a.Note = body.Note
	})
	c.JSON(http.StatusOK, gin.H{"updated": updated})
}
