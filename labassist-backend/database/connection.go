package database

import (
	"database/sql"
	_ "embed"
	"fmt"
	"log"
	"os"
	"time"

	"labassist/config"
	"labassist/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// gormLogger logs slow/failed queries but treats a plain "record not found"
// as routine, not an error — callers like UserByID/CourseByID hit this
// constantly for lookups that are expected to miss (bad login, 404 course,
// InstructorID=0 placeholder on unmatched imports).
var gormLogger = logger.New(
	log.New(os.Stdout, "\r\n", log.LstdFlags),
	logger.Config{
		LogLevel:                  logger.Warn,
		IgnoreRecordNotFoundError: true,
	},
)

//go:embed Docker/user.sql
var userSeedSQL string

// DB is the Postgres connection backing the users and courses tables.
// Other domains (applications, notifications, activity logs) still live in
// the in-memory slices in database.go until they get their own migration.
var DB *gorm.DB

// Connect opens the Postgres connection, migrates the users and courses
// tables, and seeds users from user.sql the first time the table is empty.
func Connect(cfg *config.Config) error {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName,
	)
	// docker compose up -d db returns before Postgres is actually accepting
	// connections yet, so a run right after starting the container (or right
	// after a codespace resume) would otherwise fail on the first attempt.
	// Retry with backoff instead of failing immediately.
	const maxAttempts = 15
	const retryDelay = 2 * time.Second

	var db *gorm.DB
	var err error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
			Logger: gormLogger,
			// Imported courses may have InstructorID=0 (no matching instructor
			// account found in the spreadsheet) — a real FK constraint would
			// reject that placeholder value, so constraints are left to the
			// application layer instead of the database here.
			DisableForeignKeyConstraintWhenMigrating: true,
		})
		if err == nil {
			var sqlDB *sql.DB
			if sqlDB, err = db.DB(); err == nil {
				err = sqlDB.Ping()
			}
		}
		if err == nil {
			break
		}
		if attempt == maxAttempts {
			return fmt.Errorf("connect to postgres after %d attempts: %w", maxAttempts, err)
		}
		log.Printf("postgres not ready yet (attempt %d/%d), retrying in %s: %v", attempt, maxAttempts, retryDelay, err)
		time.Sleep(retryDelay)
	}

	if err := db.Exec(`DO $$ BEGIN
		CREATE TYPE user_role AS ENUM ('student', 'instructor', 'staff', 'admin');
	EXCEPTION
		WHEN duplicate_object THEN NULL;
	END $$;`).Error; err != nil {
		return fmt.Errorf("create user_role enum: %w", err)
	}

	if err := db.Exec(`DO $$ BEGIN
		CREATE TYPE course_status AS ENUM ('open', 'closing_soon', 'closed', 'draft', 'archived');
	EXCEPTION
		WHEN duplicate_object THEN NULL;
	END $$;`).Error; err != nil {
		return fmt.Errorf("create course_status enum: %w", err)
	}

	if err := db.AutoMigrate(&models.User{}); err != nil {
		return fmt.Errorf("migrate users table: %w", err)
	}
	if err := db.AutoMigrate(&models.Course{}); err != nil {
		return fmt.Errorf("migrate courses table: %w", err)
	}
	if err := db.AutoMigrate(&models.Transcript{}); err != nil {
		return fmt.Errorf("migrate transcripts table: %w", err)
	}
	// core_courses used to be unique on code alone. The same course can be in
	// both the IT and CS curricula (e.g. 517121), so the key is now
	// (program, code) — drop the old index first or AutoMigrate keeps it and
	// the second program's copy fails to insert.
	if err := db.Exec(`DROP INDEX IF EXISTS idx_core_courses_code;`).Error; err != nil {
		return fmt.Errorf("drop legacy core_courses code index: %w", err)
	}
	if err := db.AutoMigrate(&models.CoreCourse{}); err != nil {
		return fmt.Errorf("migrate core_courses table: %w", err)
	}

	// Admin-created accounts start with a blank email (filled in later via
	// Google sign-in), so multiple blank emails must be allowed — a plain
	// unique index would reject the second such account.
	if err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
		ON users (email) WHERE email <> '';`).Error; err != nil {
		return fmt.Errorf("create users email unique index: %w", err)
	}

	DB = db

	var count int64
	if err := DB.Model(&models.User{}).Count(&count).Error; err != nil {
		return fmt.Errorf("count users: %w", err)
	}
	if count == 0 {
		if err := DB.Exec(userSeedSQL).Error; err != nil {
			return fmt.Errorf("seed users from user.sql: %w", err)
		}
		log.Println("Seeded users table from database/user.sql")
	}

	if err := seedClasslistInstructors(); err != nil {
		return fmt.Errorf("seed classlist instructors: %w", err)
	}

	if err := seedCoreCourses(); err != nil {
		return fmt.Errorf("seed core courses: %w", err)
	}

	if err := seedMockApplicants(); err != nil {
		return fmt.Errorf("seed mock applicants: %w", err)
	}

	return nil
}
