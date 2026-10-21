package teacher

import (
	"errors"
	"log"
	"net/http"
	"strconv"

	"labassist/database"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ConfirmLabBoyRoster godoc
// @Summary      ยืนยันรายชื่อ Lab Boy ที่รับแล้วทั้งหมด
// @Description  หลังยืนยัน เจ้าหน้าที่จึงเห็นรายวิชาในหน้าจัดการเอกสาร และรับหรือยกเลิกการรับนักศึกษาเพิ่มไม่ได้ ต้องรับแล้วอย่างน้อย 1 คน
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Course ID"
// @Success      200  {object}  models.Course
// @Failure      403  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Failure      409  {object}  handlers.ErrorResponse
// @Router       /instructor/courses/{id}/labboy-roster/confirm [put]
func (h *Handler) ConfirmLabBoyRoster(c *gin.Context) {
	setLabBoyRoster(c, true)
}

// ReopenLabBoyRoster godoc
// @Summary      ยกเลิกการยืนยันรายชื่อ Lab Boy
// @Description  ทำได้เมื่อเจ้าหน้าที่ยังไม่ได้เริ่มสร้างเอกสารของรายวิชา — รายวิชาจะหายจากหน้าเจ้าหน้าที่จนกว่าจะยืนยันอีกครั้ง
// @Tags         instructor
// @Produce      json
// @Security     BearerAuth
// @Param        id  path  int  true  "Course ID"
// @Success      200  {object}  models.Course
// @Failure      403  {object}  handlers.ErrorResponse
// @Failure      404  {object}  handlers.ErrorResponse
// @Failure      409  {object}  handlers.ErrorResponse
// @Router       /instructor/courses/{id}/labboy-roster/confirm [delete]
func (h *Handler) ReopenLabBoyRoster(c *gin.Context) {
	setLabBoyRoster(c, false)
}

func setLabBoyRoster(c *gin.Context, confirmed bool) {
	id, _ := strconv.Atoi(c.Param("id"))
	course, ok := database.CourseByID(uint(id))
	if !ok || course.PostingID == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	if !ownsCourse(c, course) {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
		return
	}
	_, err := database.SetLabBoyRosterConfirmed(course.PostingID, confirmed)
	switch {
	case err == nil:
	case errors.Is(err, database.ErrRosterEmpty):
		c.JSON(http.StatusConflict, gin.H{"error": "ยังไม่มีนักศึกษาที่รับเป็น Lab Boy"})
		return
	case errors.Is(err, database.ErrRosterInUse):
		c.JSON(http.StatusConflict, gin.H{"error": "เจ้าหน้าที่เริ่มจัดทำเอกสารของรายวิชานี้แล้ว ยกเลิกการยืนยันไม่ได้"})
		return
	case errors.Is(err, database.ErrPostingArchived):
		c.JSON(http.StatusConflict, gin.H{"error": "รอบรับสมัครนี้ถูกเก็บเป็นประวัติแล้ว"})
		return
	case errors.Is(err, gorm.ErrRecordNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	default:
		log.Printf("set lab boy roster %d: %v", course.ID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
		return
	}
	updated, _ := database.CourseByID(course.ID)
	c.JSON(http.StatusOK, updated)
}
