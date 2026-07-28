package handlers

import (
	"labassist/database"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

type CourseHandler struct{}

func NewCourseHandler() *CourseHandler { return &CourseHandler{} }

// List godoc
// @Summary      รายการวิชาทั้งหมด (สาธารณะ)
// @Tags         courses
// @Produce      json
// @Param        status  query  string  false  "กรองตามสถานะ" Enums(open, closing_soon, closed, draft, archived)
// @Param        q       query  string  false  "ค้นหาด้วยชื่อหรือรหัสวิชา"
// @Success      200     {array}   models.Course
// @Failure      500     {object}  ErrorResponse
// @Router       /courses [get]
func (h *CourseHandler) List(c *gin.Context) {
	courses := database.ListCourses(c.Query("status"), c.Query("q"), nil)
	c.JSON(http.StatusOK, courses)
}

// Get godoc
// @Summary      ดูรายละเอียดวิชา (สาธารณะ)
// @Tags         courses
// @Produce      json
// @Param        id  path  int  true  "Course ID"
// @Success      200  {object}  models.Course
// @Failure      404  {object}  ErrorResponse
// @Router       /courses/{id} [get]
func (h *CourseHandler) Get(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	course, ok := database.CourseByID(uint(id))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "course not found"})
		return
	}
	c.JSON(http.StatusOK, course)
}
