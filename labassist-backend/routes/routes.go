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
	"labassist/reports"

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
)

func Setup(r *gin.Engine, cfg *config.Config) {
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	r.Use(middleware.ActivityLogger())

	authH := handlers.NewAuthHandler(cfg)
	courseH := handlers.NewCourseHandler()
	adminH := admin.NewHandler(cfg)
	teacherH := teacher.NewHandler()
	studentH := student.NewHandler(cfg)
	staffH := staff.NewHandler()
	reportH := reports.NewHandler()

	v1 := r.Group("/api/v1")

	// Public
	v1.POST("/auth/login", authH.Login)
	v1.POST("/auth/google", authH.GoogleLogin)
	v1.POST("/auth/dev-login", authH.DevLogin)
	v1.GET("/courses", courseH.List)
	v1.GET("/courses/:id", courseH.Get)

	// Authenticated
	authed := v1.Group("")
	authed.Use(middleware.Auth(cfg))
	{
		authed.GET("/auth/me", authH.Me)
		authed.POST("/auth/logout", authH.Logout)
		authed.POST("/auth/password/set", authH.SetPassword)
		authed.POST("/auth/password/change", authH.ChangePassword)
		authed.POST("/auth/password/forgot", authH.ForgotPassword)
		authed.POST("/auth/password/reset", authH.ResetPassword)

		// Lab Boy performance reports shared by every role. The route only
		// requires a login; each handler checks the caller against the
		// report itself (reporter / the student / reviewer / admin).
		authed.GET("/reports/:id", reportH.Detail)
		authed.POST("/reports/:id/actions", reportH.Act)
		authed.POST("/reports/:id/responses", reportH.Respond)
		authed.GET("/reports/:id/evidence/:evidenceId", reportH.DownloadEvidence)

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
			studentGroup.GET("/student/profile/term-schedule/status", studentH.GetTermScheduleStatus)
			studentGroup.PUT("/student/profile/term-schedule", studentH.SaveTermSchedule)
			studentGroup.GET("/student/available-terms", studentH.GetAvailableTerms)
			studentGroup.GET("/student/courses", studentH.StudentCourses)
			// OCR: อ่านข้อมูลนักศึกษาจากเอกสาร/บัตรนักศึกษา
			studentGroup.POST("/student/profile/student-info", studentH.UploadStudentInfo)
			studentGroup.GET("/student/profile/student-info", studentH.GetStudentInfo)
			studentGroup.POST("/student/profile/student-info/confirm", studentH.ConfirmStudentInfo)
			studentGroup.GET("/student/profile/student-info/file", studentH.GetStudentInfoFile)
			studentGroup.GET("/student/reports", reportH.MyReports)
		}

		// Instructor
		instructor := authed.Group("")
		instructor.Use(middleware.RequireRole("instructor", "admin"))
		{
			instructor.GET("/instructor/courses", teacherH.InstructorList)
			instructor.GET("/instructor/my-courses", teacherH.MyCourses)
			instructor.POST("/instructor/my-courses", teacherH.AddMyCourse)
			instructor.DELETE("/instructor/my-courses/:id", teacherH.RemoveMyCourse)
			instructor.GET("/instructor/course-candidates", teacherH.CourseCandidatesList)
			instructor.GET("/instructor/course-catalog", teacherH.CourseCatalog)
			instructor.GET("/instructor/course-catalog/sections", teacherH.CourseCatalogSections)
			instructor.POST("/instructor/courses", teacherH.Create)
			instructor.PUT("/instructor/courses/:id", teacherH.Update)
			instructor.PUT("/instructor/courses/:id/status", teacherH.UpdateStatus)
			instructor.PUT("/instructor/courses/:id/labboy-roster/confirm", teacherH.ConfirmLabBoyRoster)
			instructor.DELETE("/instructor/courses/:id/labboy-roster/confirm", teacherH.ReopenLabBoyRoster)
			instructor.DELETE("/instructor/courses/:id", teacherH.Delete)
			instructor.POST("/instructor/courses/:id/sections", teacherH.AddSection)
			instructor.GET("/instructor/profile", teacherH.GetInstructorProfile)
			instructor.PUT("/instructor/profile", teacherH.UpdateInstructorProfile)
			instructor.GET("/instructor/notifications", teacherH.MyNotifications)
			instructor.PUT("/instructor/notifications/read-all", teacherH.MarkAllRead)
			instructor.PUT("/instructor/notifications/:id/read", teacherH.MarkRead)
			// Makeup days for work days that fall on a holiday
			instructor.GET("/instructor/makeup-days", teacherH.MyMakeupDays)
			instructor.POST("/instructor/occurrences/:id/makeup", teacherH.ChooseMakeupDay)
			instructor.POST("/instructor/occurrences/:id/no-makeup", teacherH.DeclineMakeupDay)
			// Lab Boy performance reports (filed by the course's instructor)
			instructor.GET("/instructor/reports", reportH.ListMine)
			instructor.POST("/instructor/reports", reportH.CreateReport)
			instructor.PUT("/instructor/reports/:id", reportH.UpdateDraft)
			instructor.POST("/instructor/reports/:id/evidence", reportH.UploadEvidence)
		}

		// Instructor + Staff + Admin for applicants and reviews
		review := authed.Group("")
		review.Use(middleware.RequireRole("instructor", "staff", "admin"))
		{
			review.GET("/instructor/courses/:id/applicants", teacherH.Applicants)
			review.POST("/instructor/courses/:id/notify", teacherH.NotifyCourse)
			review.PUT("/instructor/applications/:id/review", teacherH.Review)
			review.PUT("/instructor/applications/:id/cancel", teacherH.CancelAcceptance)
			review.PUT("/instructor/applications/:id/withdraw-request", teacherH.ResolveWithdraw)
			review.PUT("/instructor/applications/bulk-review", teacherH.BulkReview)
			review.GET("/instructor/applications/:id/grade-proof", teacherH.GradeProof)
			review.GET("/instructor/applications/:id/performance-records", reportH.ConfirmedHistory)
		}

		// Staff
		staffGroup := authed.Group("")
		staffGroup.Use(middleware.RequireRole("staff", "admin"))
		{
			staffGroup.GET("/staff/profile", staffH.GetProfile)
			staffGroup.PUT("/staff/profile", staffH.UpdateProfile)
			staffGroup.GET("/staff/reviews", staffH.ListReviews)
			staffGroup.GET("/staff/reports", reportH.ReviewQueue)
			staffGroup.PUT("/staff/reviews/:courseId/verify", staffH.VerifyForm)
			staffGroup.PUT("/staff/reviews/:courseId/return", staffH.ReturnForm)
			staffGroup.GET("/staff/documents", staffH.ListDocuments)
			staffGroup.POST("/staff/documents", staffH.CreateDocument)
			staffGroup.DELETE("/staff/documents/:id", staffH.DeleteDocument)
			staffGroup.PUT("/staff/documents/:id/status", staffH.UpdateDocumentStatus)
			staffGroup.PUT("/staff/documents/:id/schedule", staffH.UpdateDocumentSchedule)
			staffGroup.GET("/staff/documents/:id/file", staffH.DownloadDocument)
			// Per-course document workflow (hiring notice → approval memo → …)
			staffGroup.GET("/staff/courses/:courseId/document-workflow", staffH.GetDocumentWorkflow)
			staffGroup.POST("/staff/courses/:courseId/document-workflow/:type", staffH.CreateWorkflowStep)
			// Staff (not the instructor) confirm the Lab Boy schedule; this opens the staff case.
			staffGroup.POST("/staff/courses/:courseId/confirm-schedule", staffH.ConfirmSchedule)
			staffGroup.PUT("/staff/documents/:id/reg-verify", staffH.RegVerifyRosterEntry)

			// Staff Case management
			staffGroup.POST("/staff/cases/init", staffH.InitCase)
			staffGroup.GET("/staff/cases", staffH.ListCases)
			staffGroup.GET("/staff/cases/:id", staffH.GetCase)
			staffGroup.PUT("/staff/cases/:id", staffH.UpdateCase)
			staffGroup.POST("/staff/cases/:id/lock-plan", staffH.LockPlan)
			staffGroup.GET("/staff/cases/:id/audit", staffH.GetCaseAuditLog)
			staffGroup.GET("/staff/cases/:id/schedule-groups", staffH.GetCaseScheduleGroups)
			staffGroup.POST("/staff/cases/:id/schedule-groups", staffH.AddScheduleGroup)
			staffGroup.PUT("/staff/cases/:id/schedule-groups/:groupId", staffH.UpdateScheduleGroup)
			staffGroup.DELETE("/staff/cases/:id/schedule-groups/:groupId", staffH.DeleteScheduleGroup)
			staffGroup.POST("/staff/cases/:id/schedule-groups/:groupId/lock", staffH.LockScheduleGroup)
			staffGroup.PUT("/staff/cases/:id/schedule-groups/:groupId/students", staffH.AssignGroupStudents)
			staffGroup.GET("/staff/cases/:id/schedule-groups/:groupId/occurrences", staffH.ListGroupOccurrences)
			staffGroup.POST("/staff/cases/:id/schedule-groups/:groupId/generate-occurrences", staffH.GenerateGroupOccurrences)

			// Schedule group months
			staffGroup.GET("/staff/cases/:id/schedule-groups/:groupId/months", staffH.ListGroupMonths)
			staffGroup.POST("/staff/cases/:id/schedule-groups/:groupId/months", staffH.AddGroupMonth)
			staffGroup.DELETE("/staff/cases/:id/schedule-groups/:groupId/months/:year/:month", staffH.DeleteGroupMonth)
			staffGroup.POST("/staff/cases/:id/schedule-groups/:groupId/months/:year/:month/generate", staffH.GenerateGroupMonthOccurrences)
			staffGroup.GET("/staff/cases/:id/schedule-groups/:groupId/months/:year/:month/summary", staffH.GetGroupMonthSummary)
			staffGroup.POST("/staff/cases/:id/schedule-groups/:groupId/months/:year/:month/set-dates", staffH.SetGroupMonthDatesList)
			staffGroup.POST("/staff/cases/:id/schedule-groups/:groupId/months/:year/:month/occurrences", staffH.AddGroupMonthOccurrence)

			// Monthly plan aggregate
			staffGroup.GET("/staff/cases/:id/monthly-plan", staffH.GetMonthlyPlan)
			staffGroup.GET("/staff/cases/:id/hiring-notice-snapshot", staffH.GetHiringNoticeSnapshot)

			// Calendar dates (holidays / no-class days)
			staffGroup.GET("/staff/calendar-dates", staffH.ListCalendarDatesBySemester)
			staffGroup.GET("/staff/cases/:id/calendar-dates", staffH.ListCalendarDates)
			staffGroup.POST("/staff/calendar-dates", staffH.CreateCalendarDate)
			staffGroup.DELETE("/staff/calendar-dates/:id", staffH.DeleteCalendarDate)

			// Work occurrences
			staffGroup.GET("/staff/cases/:id/occurrences", staffH.ListOccurrences)
			staffGroup.POST("/staff/cases/:id/generate-occurrences", staffH.GenerateOccurrences)
			staffGroup.PUT("/staff/occurrences/:id", staffH.UpdateOccurrence)
			staffGroup.PATCH("/staff/occurrences/:id", staffH.PatchOccurrence)
			staffGroup.DELETE("/staff/occurrences/:id", staffH.DeleteOccurrenceHandler)
			staffGroup.POST("/staff/occurrences/:id/reschedule", staffH.RescheduleOccurrence)
			staffGroup.GET("/staff/cases/:id/makeup-days", staffH.ListCaseMakeupDays)
			staffGroup.POST("/staff/occurrences/:id/makeup", staffH.StaffChooseMakeupDay)
			staffGroup.POST("/staff/occurrences/:id/no-makeup", staffH.StaffDeclineMakeupDay)

			// Monthly periods
			staffGroup.GET("/staff/cases/:id/monthly-periods", staffH.ListMonthlyPeriods)
			staffGroup.POST("/staff/cases/:id/monthly-periods", staffH.OpenMonthlyPeriod)
			staffGroup.POST("/staff/monthly-periods/:id/close", staffH.CloseMonthlyPeriod)
			staffGroup.GET("/staff/monthly-periods/:id/occurrences", staffH.GetMonthlyOccurrences)
			staffGroup.POST("/staff/monthly-periods/:id/documents", staffH.GenerateMonthlyDocument)
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
			// Academic calendar: read the PDF for review, then save the chosen dates
			adminGroup.POST("/admin/calendar/import/preview", adminH.PreviewCalendarImport)
			adminGroup.POST("/admin/calendar/import", adminH.ImportCalendar)
		}
	}
}
