package routes

import (
	"labassist/Student"
	"labassist/Teacher"
	"labassist/admin"
	"labassist/config"
	_ "labassist/docs"
	"labassist/handlers"
	"labassist/middleware"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func Setup(r *gin.Engine, cfg *config.Config) {
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	r.Use(middleware.ActivityLogger())

	authH := handlers.NewAuthHandler(cfg)
	courseH := handlers.NewCourseHandler()
	adminH := admin.NewHandler()
	teacherH := teacher.NewHandler()
	studentH := student.NewHandler()

	v1 := r.Group("/api/v1")

	// Public
	v1.POST("/auth/login", authH.Login)
	v1.POST("/auth/google", authH.GoogleLogin)
	v1.GET("/courses", courseH.List)
	v1.GET("/courses/:id", courseH.Get)

	// Authenticated
	authed := v1.Group("")
	authed.Use(middleware.Auth(cfg))
	{
		authed.GET("/auth/me", authH.Me)
		authed.POST("/auth/logout", authH.Logout)

		// Student
		studentGroup := authed.Group("")
		studentGroup.Use(middleware.RequireRole("student"))
		{
			studentGroup.GET("/student/dashboard", studentH.StudentDashboard)
			studentGroup.GET("/student/applications", studentH.MyApplications)
			studentGroup.POST("/student/applications", studentH.Apply)
			studentGroup.PUT("/student/applications/:id/withdraw", studentH.Withdraw)
			studentGroup.GET("/student/profile", studentH.GetProfile)
			studentGroup.PUT("/student/profile", studentH.UpdateProfile)
			studentGroup.GET("/student/notifications", studentH.MyNotifications)
			studentGroup.PUT("/student/notifications/read-all", studentH.MarkAllRead)
			studentGroup.PUT("/student/notifications/:id/read", studentH.MarkRead)
		}

		// Instructor
		instructor := authed.Group("")
		instructor.Use(middleware.RequireRole("instructor", "admin"))
		{
			instructor.GET("/instructor/courses", teacherH.InstructorList)
			instructor.GET("/instructor/course-catalog", teacherH.CourseCatalog)
			instructor.POST("/instructor/courses", teacherH.Create)
			instructor.PUT("/instructor/courses/:id", teacherH.Update)
			instructor.PUT("/instructor/courses/:id/status", teacherH.UpdateStatus)
			instructor.DELETE("/instructor/courses/:id", teacherH.Delete)
			instructor.GET("/instructor/profile", teacherH.GetInstructorProfile)
			instructor.PUT("/instructor/profile", teacherH.UpdateInstructorProfile)
		}

		// Instructor + Staff + Admin for applicants and reviews
		review := authed.Group("")
		review.Use(middleware.RequireRole("instructor", "staff", "admin"))
		{
			review.GET("/instructor/courses/:id/applicants", teacherH.Applicants)
			review.POST("/instructor/courses/:id/notify", teacherH.NotifyCourse)
			review.PUT("/instructor/applications/:id/review", teacherH.Review)
			review.PUT("/instructor/applications/bulk-review", teacherH.BulkReview)
		}

		// Admin
		adminGroup := authed.Group("")
		adminGroup.Use(middleware.RequireRole("admin"))
		{
			adminGroup.GET("/admin/stats", adminH.Stats)
			adminGroup.GET("/admin/users", adminH.Users)
			adminGroup.POST("/admin/users", adminH.CreateUser)
			adminGroup.PUT("/admin/users/:id", adminH.UpdateUser)
			adminGroup.PUT("/admin/users/:id/status", adminH.UpdateUserStatus)
			adminGroup.GET("/admin/users/:id/courses", adminH.InstructorCourses)
			adminGroup.GET("/admin/logs", adminH.Logs)
			adminGroup.POST("/admin/courses/import", adminH.ImportCourses)
			adminGroup.DELETE("/admin/courses/term", adminH.DeleteCoursesByTerm)
		}
	}
}
