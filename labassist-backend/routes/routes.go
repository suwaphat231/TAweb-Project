package routes

import (
	"labassist/Staff"
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
	studentH := student.NewHandler(cfg)
	staffH := staff.NewHandler()

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
			studentGroup.POST("/student/profile/avatar", studentH.UploadAvatar)
			studentGroup.GET("/student/notifications", studentH.MyNotifications)
			studentGroup.PUT("/student/notifications/read-all", studentH.MarkAllRead)
			studentGroup.PUT("/student/notifications/:id/read", studentH.MarkRead)
			studentGroup.POST("/student/transcript", studentH.UploadTranscript)
			studentGroup.GET("/student/transcript", studentH.GetTranscript)
			studentGroup.GET("/student/transcript/file", studentH.DownloadTranscript)
			// OCR: อ่านเกรดจากใบเกรด/ทรานสคริปต์ แล้วจับคู่กับรายวิชาใน core_courses
			// (คนละอันกับ /student/transcript ด้านบน ซึ่งแค่เก็บไฟล์ PDF ไว้เฉยๆ)
			studentGroup.POST("/student/profile/transcript", authH.UploadTranscript)
			studentGroup.POST("/student/applications/:id/grade-proof", studentH.UploadGradeProof)
			studentGroup.GET("/student/applications/:id/grade-proof", studentH.GetGradeProof)
			studentGroup.GET("/student/applications/:id/history", studentH.ApplicationHistory)
			studentGroup.GET("/student/work-schedule", studentH.WorkSchedule)
				studentGroup.GET("/student/labboy-assignments", studentH.LabBoyAssignments)
			studentGroup.POST("/student/profile/class-schedule", studentH.UploadClassSchedule)
			studentGroup.GET("/student/profile/class-schedule", studentH.GetClassSchedule)
			studentGroup.GET("/student/profile/class-schedule/file", studentH.GetClassScheduleImage)
			studentGroup.GET("/student/profile/term-schedule", studentH.GetTermSchedule)
			studentGroup.PUT("/student/profile/term-schedule", studentH.SaveTermSchedule)
			studentGroup.GET("/student/available-terms", studentH.GetAvailableTerms)
		}

		// Instructor
		instructor := authed.Group("")
		instructor.Use(middleware.RequireRole("instructor", "admin"))
		{
			instructor.GET("/instructor/courses", teacherH.InstructorList)
			instructor.GET("/instructor/course-catalog", teacherH.CourseCatalog)
			instructor.GET("/instructor/course-catalog/sections", teacherH.CourseCatalogSections)
			instructor.POST("/instructor/courses", teacherH.Create)
			instructor.PUT("/instructor/courses/:id", teacherH.Update)
			instructor.PUT("/instructor/courses/:id/status", teacherH.UpdateStatus)
			instructor.DELETE("/instructor/courses/:id", teacherH.Delete)
			instructor.POST("/instructor/courses/:id/sections", teacherH.AddSection)
			instructor.GET("/instructor/profile", teacherH.GetInstructorProfile)
			instructor.PUT("/instructor/profile", teacherH.UpdateInstructorProfile)
			instructor.GET("/instructor/notifications", teacherH.MyNotifications)
			instructor.PUT("/instructor/notifications/read-all", teacherH.MarkAllRead)
			instructor.PUT("/instructor/notifications/:id/read", teacherH.MarkRead)
		}

		// Instructor + Staff + Admin for applicants and reviews
		review := authed.Group("")
		review.Use(middleware.RequireRole("instructor", "staff", "admin"))
		{
			review.GET("/instructor/courses/:id/applicants", teacherH.Applicants)
			review.POST("/instructor/courses/:id/notify", teacherH.NotifyCourse)
			review.PUT("/instructor/applications/:id/review", teacherH.Review)
			review.PUT("/instructor/applications/bulk-review", teacherH.BulkReview)
			review.GET("/instructor/applications/:id/grade-proof", teacherH.GradeProof)
			review.POST("/instructor/courses/:id/confirm-schedule", teacherH.ConfirmSchedule)
		}

		// Staff
		staffGroup := authed.Group("")
		staffGroup.Use(middleware.RequireRole("staff", "admin"))
		{
			staffGroup.GET("/staff/profile",              staffH.GetProfile)
			staffGroup.PUT("/staff/profile",              staffH.UpdateProfile)
			staffGroup.GET("/staff/reviews",              staffH.ListReviews)
			staffGroup.PUT("/staff/reviews/:courseId/verify", staffH.VerifyForm)
			staffGroup.PUT("/staff/reviews/:courseId/return", staffH.ReturnForm)
			staffGroup.GET("/staff/documents",                staffH.ListDocuments)
			staffGroup.POST("/staff/documents",               staffH.CreateDocument)
			staffGroup.PUT("/staff/documents/:id/status",     staffH.UpdateDocumentStatus)
			staffGroup.GET("/staff/documents/:id/file",       staffH.DownloadDocument)
			staffGroup.PUT("/staff/documents/:id/reg-verify", staffH.RegVerifyRosterEntry)
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
			adminGroup.GET("/admin/core-courses", adminH.CoreCourseCatalog)
			adminGroup.GET("/admin/logs", adminH.Logs)
			adminGroup.POST("/admin/courses/import", adminH.ImportCourses)
			adminGroup.POST("/admin/courses/import/resolve", adminH.ResolveImportConflicts)
			adminGroup.DELETE("/admin/courses/term", adminH.DeleteCoursesByTerm)
		}
	}
}
