package routes

import (
	"labassist/config"
	"labassist/handlers"
	"labassist/middleware"

	"github.com/gin-gonic/gin"
)

func Setup(r *gin.Engine, cfg *config.Config) {
	r.Use(middleware.ActivityLogger())

	authH := handlers.NewAuthHandler(cfg)
	courseH := handlers.NewCourseHandler()
	appH := handlers.NewApplicationHandler()
	adminH := handlers.NewAdminHandler()

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
		student := authed.Group("")
		student.Use(middleware.RequireRole("student"))
		{
			student.GET("/student/dashboard", appH.StudentDashboard)
			student.GET("/student/applications", appH.MyApplications)
			student.POST("/student/applications", appH.Apply)
			student.PUT("/student/applications/:id/withdraw", appH.Withdraw)
			student.GET("/student/profile", appH.GetProfile)
			student.PUT("/student/profile", appH.UpdateProfile)
		}

		// Instructor
		instructor := authed.Group("")
		instructor.Use(middleware.RequireRole("instructor", "admin"))
		{
			instructor.GET("/instructor/courses", courseH.InstructorList)
			instructor.POST("/instructor/courses", courseH.Create)
			instructor.PUT("/instructor/courses/:id", courseH.Update)
			instructor.PUT("/instructor/courses/:id/status", courseH.UpdateStatus)
		}

		// Instructor + Staff + Admin for applicants and reviews
		review := authed.Group("")
		review.Use(middleware.RequireRole("instructor", "staff", "admin"))
		{
			review.GET("/instructor/courses/:id/applicants", courseH.Applicants)
			review.PUT("/instructor/applications/:id/review", appH.Review)
			review.PUT("/instructor/applications/bulk-review", appH.BulkReview)
		}

		// Staff
		staff := authed.Group("")
		staff.Use(middleware.RequireRole("staff", "admin"))
		{
			staff.GET("/staff/documents", func(c *gin.Context) { c.JSON(200, []interface{}{}) })
			staff.POST("/staff/documents", func(c *gin.Context) { c.JSON(201, gin.H{"message": "created"}) })
			staff.PUT("/staff/documents/:id", func(c *gin.Context) { c.JSON(200, gin.H{"message": "updated"}) })
		}

		// Admin
		admin := authed.Group("")
		admin.Use(middleware.RequireRole("admin"))
		{
			admin.GET("/admin/stats", adminH.Stats)
			admin.GET("/admin/users", adminH.Users)
			admin.POST("/admin/users", adminH.CreateUser)
			admin.PUT("/admin/users/:id/status", adminH.UpdateUserStatus)
			admin.GET("/admin/logs", adminH.Logs)
		}
	}
}
