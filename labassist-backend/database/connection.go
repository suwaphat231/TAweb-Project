package database

import (
	"database/sql"
	_ "embed"
	"fmt"
	"log"
	"net"
	"os"
	"strings"
	"time"

	"labassist/config"
	"labassist/models"

	mysqldriver "github.com/go-sql-driver/mysql"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
)

// migrateDecimalColumns changes monetary and hour columns in staff_documents
// from FLOAT/DOUBLE to DECIMAL so the database stores exact fixed-point values
// instead of IEEE-754 approximations.
//
// Columns changed:
//
//	hours_per_session  FLOAT  → DECIMAL(8,2)   — at most 99999.99 hours
//	rate               FLOAT  → DECIMAL(10,2)  — at most 99999999.99 ฿/hr
//	total_amount       FLOAT  → DECIMAL(12,2)  — at most 9999999999.99 ฿
//
// MySQL preserves all existing values during the MODIFY (they are all
// representable as DECIMAL(n,2) in the ranges used).
// The function is idempotent: rows already of type "decimal" are skipped.
func migrateDecimalColumns(db *gorm.DB) error {
	type colChange struct{ table, col, decl string }
	changes := []colChange{
		{"staff_documents", "hours_per_session", "DECIMAL(8,2) NOT NULL DEFAULT 0"},
		{"staff_documents", "rate", "DECIMAL(10,2) NOT NULL DEFAULT 0"},
		{"staff_documents", "total_amount", "DECIMAL(12,2) NOT NULL DEFAULT 0"},
	}
	for _, c := range changes {
		var dataType string
		if err := db.Raw(`SELECT DATA_TYPE FROM information_schema.COLUMNS
			WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
			c.table, c.col).Scan(&dataType).Error; err != nil {
			return fmt.Errorf("check column type %s.%s: %w", c.table, c.col, err)
		}
		if dataType == "" || strings.EqualFold(dataType, "decimal") {
			continue // not yet created (AutoMigrate will use the model tag) or already decimal
		}
		if err := db.Exec(fmt.Sprintf(
			"ALTER TABLE `%s` MODIFY COLUMN `%s` %s", c.table, c.col, c.decl,
		)).Error; err != nil {
			return fmt.Errorf("alter %s.%s to decimal: %w", c.table, c.col, err)
		}
		log.Printf("migrated %s.%s to %s", c.table, c.col, c.decl)
	}
	return nil
}

// migrateToPostingFKs is the Round 2 step of the course/posting separation.
// It backfills posting_id on the four child tables and adjusts indexes so
// applications, history, form reviews, and staff documents reference the
// Posting row rather than the Course row directly.
// The function is idempotent: each step checks current DB state before acting.
func migrateToPostingFKs(db *gorm.DB) error {
	// Keep a separate non-unique index for the legacy course FK before
	// removing the old per-course unique key (also safe on restart).
	if !db.Migrator().HasIndex("form_reviews", "idx_form_reviews_course_lookup") {
		if err := db.Exec("CREATE INDEX idx_form_reviews_course_lookup ON form_reviews(course_id)").Error; err != nil {
			return err
		}
	}
	if !db.Migrator().HasIndex("postings", "idx_postings_active_course") {
		if err := db.Exec("CREATE UNIQUE INDEX idx_postings_active_course ON postings ((CASE WHEN is_active = 1 THEN course_id ELSE NULL END))").Error; err != nil {
			return fmt.Errorf("enforce one active posting per course: %w", err)
		}
	}
	// Backfill posting_id from course_id for each table.
	// Only rows whose posting_id is still 0 / NULL need updating.
	backfills := []struct{ table, join, where string }{
		{
			"applications a",
			"postings p ON p.course_id = a.course_id AND p.is_active = true",
			"(a.posting_id = 0 OR a.posting_id IS NULL) AND a.course_id > 0",
		},
		{
			"application_history ah",
			"postings p ON p.course_id = ah.course_id AND p.is_active = true",
			"(ah.posting_id = 0 OR ah.posting_id IS NULL) AND ah.course_id > 0",
		},
		{
			"form_reviews fr",
			"postings p ON p.course_id = fr.course_id AND p.is_active = true",
			"(fr.posting_id = 0 OR fr.posting_id IS NULL) AND fr.course_id > 0",
		},
	}
	for _, b := range backfills {
		alias := b.table[strings.Index(b.table, " ")+1:]
		col := alias + ".posting_id"
		sql := fmt.Sprintf("UPDATE %s JOIN %s SET %s = p.id WHERE %s", b.table, b.join, col, b.where)
		if err := db.Exec(sql).Error; err != nil {
			return fmt.Errorf("backfill posting_id on %s: %w", b.table, err)
		}
	}
	// staff_documents uses nullable posting_id
	if err := db.Exec(`UPDATE staff_documents sd
		JOIN postings p ON p.course_id = sd.course_id AND p.is_active = true
		SET sd.posting_id = p.id
		WHERE sd.posting_id IS NULL AND sd.course_id IS NOT NULL`).Error; err != nil {
		return fmt.Errorf("backfill posting_id on staff_documents: %w", err)
	}

	indexOps := []struct {
		table, drop, dropIdx, create, createIdx, createCols string
	}{
		// Replace the (student_id, course_id) unique index with (student_id, posting_id).
		{
			table: "applications",
			drop:  "idx_application_student_course", dropIdx: "idx_application_student_course",
			create: "idx_application_student_posting", createIdx: "idx_application_student_posting", createCols: "(student_id, posting_id)",
		},
		// Replace the per-course unique index with a per-posting unique index.
		{
			table: "form_reviews",
			drop:  "idx_form_reviews_course_id", dropIdx: "idx_form_reviews_course_id",
			create: "idx_form_reviews_posting_unique", createIdx: "idx_form_reviews_posting_unique", createCols: "(posting_id)",
		},
	}
	for _, op := range indexOps {
		var n int64
		if err := db.Raw(`SELECT COUNT(*) FROM information_schema.STATISTICS
			WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = ? AND INDEX_NAME = ?`, op.table, op.drop).Scan(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			if err := db.Exec(fmt.Sprintf("ALTER TABLE `%s` DROP INDEX `%s`", op.table, op.dropIdx)).Error; err != nil {
				return fmt.Errorf("drop index %s on %s: %w", op.dropIdx, op.table, err)
			}
		}
		if err := db.Raw(`SELECT COUNT(*) FROM information_schema.STATISTICS
			WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = ? AND INDEX_NAME = ?`, op.table, op.create).Scan(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			stmt := fmt.Sprintf("ALTER TABLE `%s` ADD UNIQUE INDEX `%s` %s", op.table, op.createIdx, op.createCols)
			if err := db.Exec(stmt).Error; err != nil {
				return fmt.Errorf("create index %s on %s: %w", op.createIdx, op.table, err)
			}
		}
	}
	return nil
}

// ensureForeignKeys migrates the sentinel InstructorID=0 rows to NULL and
// then idempotently adds FK constraints with explicit ON DELETE policies.
// Called once per startup after all AutoMigrate steps complete.
//
// Policies:
//   - courses.instructor_id   → users.id          ON DELETE SET NULL
//   - applications.course_id  → courses.id         ON DELETE RESTRICT
//   - application_history.course_id → courses.id   ON DELETE RESTRICT
//   - form_reviews.course_id  → courses.id         ON DELETE CASCADE
//   - notifications.course_id → courses.id         ON DELETE SET NULL
//   - staff_documents.course_id → courses.id       ON DELETE RESTRICT
func ensureForeignKeys(db *gorm.DB) error {
	// InstructorID=0 was the sentinel for unmatched imports; NULL is the
	// canonical representation now that the column is nullable.
	if err := db.Exec("UPDATE courses SET instructor_id = NULL WHERE instructor_id = 0").Error; err != nil {
		return fmt.Errorf("fix instructor_id sentinel: %w", err)
	}

	type fkSpec struct {
		table, column, refTable, refCol, onDelete string
	}
	specs := []fkSpec{
		{"applications", "student_id", "users", "id", "RESTRICT"},
		{"applications", "reviewed_by_id", "users", "id", "SET NULL"},
		{"application_history", "student_id", "users", "id", "RESTRICT"},
		{"application_history", "reviewed_by_id", "users", "id", "SET NULL"},
		{"form_reviews", "reviewer_id", "users", "id", "RESTRICT"},
		{"staff_documents", "staff_id", "users", "id", "RESTRICT"},
		{"notifications", "user_id", "users", "id", "CASCADE"},
		{"transcripts", "user_id", "users", "id", "CASCADE"},
		{"class_schedules", "user_id", "users", "id", "CASCADE"},
		{"term_schedules", "user_id", "users", "id", "CASCADE"},
		{"student_info_documents", "user_id", "users", "id", "CASCADE"},
		{"courses", "instructor_id", "users", "id", "SET NULL"},
		{"postings", "course_id", "courses", "id", "CASCADE"},
		// Legacy course_id FKs on child tables (kept until columns are dropped).
		{"applications", "course_id", "courses", "id", "RESTRICT"},
		{"application_history", "course_id", "courses", "id", "RESTRICT"},
		{"form_reviews", "course_id", "courses", "id", "RESTRICT"},
		{"notifications", "course_id", "courses", "id", "SET NULL"},
		{"staff_documents", "course_id", "courses", "id", "RESTRICT"},
		// Round 2: posting-based FKs.
		{"applications", "posting_id", "postings", "id", "RESTRICT"},
		{"application_history", "posting_id", "postings", "id", "RESTRICT"},
		{"form_reviews", "posting_id", "postings", "id", "CASCADE"},
		{"staff_documents", "posting_id", "postings", "id", "SET NULL"},
		// M:N course-instructor junction.
		{"course_instructors", "course_id", "courses", "id", "CASCADE"},
		{"course_instructors", "instructor_id", "users", "id", "CASCADE"},
	}
	for _, s := range specs {
		name := fmt.Sprintf("fk_%s_%s", s.table, s.column)
		var n int64
		if err := db.Raw(`SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
			WHERE TABLE_SCHEMA = DATABASE()
			AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
			AND CONSTRAINT_TYPE = 'FOREIGN KEY'`, s.table, name).Scan(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		stmt := fmt.Sprintf(
			"ALTER TABLE `%s` ADD CONSTRAINT `%s` FOREIGN KEY (`%s`) REFERENCES `%s`(`%s`) ON DELETE %s",
			s.table, name, s.column, s.refTable, s.refCol, s.onDelete,
		)
		if err := db.Exec(stmt).Error; err != nil {
			return fmt.Errorf("add FK %s: %w", name, err)
		}
	}
	return nil
}

// ensurePostingCourseConsistency does three things on every startup:
//
//  1. Audit: log the count of rows where course_id disagrees with
//     postings.course_id for the same posting_id (should always be zero after
//     the first run).
//  2. Fix: correct any such rows by overwriting course_id with the value from
//     the postings table.
//  3. Guard: create BEFORE INSERT and BEFORE UPDATE triggers on the four child
//     tables (applications, application_history, form_reviews, staff_documents)
//     so that a future write with a mismatched pair is rejected at the DB level
//     before it can reach the application.
//
// Trigger creation uses the raw *sql.DB handle because trigger bodies contain
// semicolons that GORM's Exec would mis-parse.
// All steps are idempotent — safe to run on every startup.
func ensurePostingCourseConsistency(db *gorm.DB) error {
	// --- 1. Audit ---
	type auditRow struct {
		Count int64
	}
	audits := []struct {
		label, query string
	}{
		{
			"applications",
			`SELECT COUNT(*) AS count FROM applications a
			 JOIN postings p ON p.id = a.posting_id
			 WHERE a.posting_id > 0 AND a.course_id != p.course_id`,
		},
		{
			"application_history",
			`SELECT COUNT(*) AS count FROM application_history ah
			 JOIN postings p ON p.id = ah.posting_id
			 WHERE ah.posting_id > 0 AND ah.course_id != p.course_id`,
		},
		{
			"form_reviews",
			`SELECT COUNT(*) AS count FROM form_reviews fr
			 JOIN postings p ON p.id = fr.posting_id
			 WHERE fr.posting_id > 0 AND fr.course_id != p.course_id`,
		},
		{
			"staff_documents",
			`SELECT COUNT(*) AS count FROM staff_documents sd
			 JOIN postings p ON p.id = sd.posting_id
			 WHERE sd.posting_id IS NOT NULL AND sd.course_id IS NOT NULL AND sd.course_id != p.course_id`,
		},
	}
	for _, a := range audits {
		var r auditRow
		if err := db.Raw(a.query).Scan(&r).Error; err != nil {
			return fmt.Errorf("audit posting/course consistency on %s: %w", a.label, err)
		}
		if r.Count > 0 {
			log.Printf("WARNING: %d mismatched posting/course rows in %s — fixing", r.Count, a.label)
		}
	}

	// --- 2. Fix ---
	fixes := []struct{ label, sql string }{
		{
			"applications",
			`UPDATE applications a JOIN postings p ON p.id = a.posting_id
			 SET a.course_id = p.course_id
			 WHERE a.posting_id > 0 AND a.course_id != p.course_id`,
		},
		{
			"application_history",
			`UPDATE application_history ah JOIN postings p ON p.id = ah.posting_id
			 SET ah.course_id = p.course_id
			 WHERE ah.posting_id > 0 AND ah.course_id != p.course_id`,
		},
		{
			"form_reviews",
			`UPDATE form_reviews fr JOIN postings p ON p.id = fr.posting_id
			 SET fr.course_id = p.course_id
			 WHERE fr.posting_id > 0 AND fr.course_id != p.course_id`,
		},
		{
			"staff_documents",
			`UPDATE staff_documents sd JOIN postings p ON p.id = sd.posting_id
			 SET sd.course_id = p.course_id
			 WHERE sd.posting_id IS NOT NULL AND sd.course_id IS NOT NULL AND sd.course_id != p.course_id`,
		},
	}
	for _, f := range fixes {
		if err := db.Exec(f.sql).Error; err != nil {
			return fmt.Errorf("fix posting/course mismatch on %s: %w", f.label, err)
		}
	}

	// --- 3. Triggers ---
	// Each trigger fires before a write and rejects the row when the supplied
	// course_id does not match postings.course_id for the given posting_id.
	// We skip rows where posting_id = 0 / NULL (legacy or not-yet-backfilled).
	type triggerDef struct{ name, sql string }
	triggers := []triggerDef{
		{
			"trg_applications_posting_course_bi",
			`CREATE TRIGGER trg_applications_posting_course_bi
BEFORE INSERT ON applications FOR EACH ROW
BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id > 0 THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'applications.course_id must match postings.course_id';
    END IF;
  END IF;
END`,
		},
		{
			"trg_applications_posting_course_bu",
			`CREATE TRIGGER trg_applications_posting_course_bu
BEFORE UPDATE ON applications FOR EACH ROW
BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id > 0 THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'applications.course_id must match postings.course_id';
    END IF;
  END IF;
END`,
		},
		{
			"trg_application_history_posting_course_bi",
			`CREATE TRIGGER trg_application_history_posting_course_bi
BEFORE INSERT ON application_history FOR EACH ROW
BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id > 0 THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'application_history.course_id must match postings.course_id';
    END IF;
  END IF;
END`,
		},
		{
			"trg_application_history_posting_course_bu",
			`CREATE TRIGGER trg_application_history_posting_course_bu
BEFORE UPDATE ON application_history FOR EACH ROW
BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id > 0 THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'application_history.course_id must match postings.course_id';
    END IF;
  END IF;
END`,
		},
		{
			"trg_form_reviews_posting_course_bi",
			`CREATE TRIGGER trg_form_reviews_posting_course_bi
BEFORE INSERT ON form_reviews FOR EACH ROW
BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id > 0 THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'form_reviews.course_id must match postings.course_id';
    END IF;
  END IF;
END`,
		},
		{
			"trg_form_reviews_posting_course_bu",
			`CREATE TRIGGER trg_form_reviews_posting_course_bu
BEFORE UPDATE ON form_reviews FOR EACH ROW
BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id > 0 THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'form_reviews.course_id must match postings.course_id';
    END IF;
  END IF;
END`,
		},
		{
			"trg_staff_documents_posting_course_bi",
			`CREATE TRIGGER trg_staff_documents_posting_course_bi
BEFORE INSERT ON staff_documents FOR EACH ROW
BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id IS NOT NULL AND NEW.course_id IS NOT NULL THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'staff_documents.course_id must match postings.course_id';
    END IF;
  END IF;
END`,
		},
		{
			"trg_staff_documents_posting_course_bu",
			`CREATE TRIGGER trg_staff_documents_posting_course_bu
BEFORE UPDATE ON staff_documents FOR EACH ROW
BEGIN
  DECLARE v_cid BIGINT UNSIGNED DEFAULT NULL;
  IF NEW.posting_id IS NOT NULL AND NEW.course_id IS NOT NULL THEN
    SELECT course_id INTO v_cid FROM postings WHERE id = NEW.posting_id;
    IF v_cid IS NOT NULL AND NEW.course_id != v_cid THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'staff_documents.course_id must match postings.course_id';
    END IF;
  END IF;
END`,
		},
	}

	// Trigger bodies contain semicolons, so we bypass GORM and use the
	// underlying *sql.DB which passes statements through unchanged.
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("get raw sql.DB for trigger creation: %w", err)
	}
	for _, t := range triggers {
		var n int64
		if err := db.Raw(`SELECT COUNT(*) FROM information_schema.TRIGGERS
			WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?`, t.name).Scan(&n).Error; err != nil {
			return fmt.Errorf("check trigger %s: %w", t.name, err)
		}
		if n > 0 {
			continue
		}
		if _, err := sqlDB.Exec(t.sql); err != nil {
			return fmt.Errorf("create trigger %s: %w", t.name, err)
		}
	}
	return nil
}

// promoteOwnerCourseLinks marks the link between a course and its own
// instructor (courses.instructor_id) as imported. CreateCourse used to
// record that link as self_added, and backfillCourseInstructors can't add
// the imported one beside it (one link per course/instructor), so the
// instructor failed InstructorOwnsCourse and got "forbidden" opening their
// own course. Links added through AddCourseRelation never touch
// courses.instructor_id, so they stay self_added.
func promoteOwnerCourseLinks(db *gorm.DB) error {
	res := db.Exec(`UPDATE course_instructors SET source = ?
		WHERE source = ? AND archived_at IS NULL AND EXISTS (
			SELECT 1 FROM courses c
			WHERE c.id = course_instructors.course_id AND c.instructor_id = course_instructors.instructor_id)`,
		models.CourseInstructorImported, models.CourseInstructorSelfAdded)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected > 0 {
		log.Printf("Marked %d course owner links as imported", res.RowsAffected)
	}
	return nil
}

// backfillCourseInstructors populates course_instructors from the legacy
// single-FK (courses.instructor_id) and from co-instructor names stored in
// courses.instructors_raw. The function is idempotent — it uses INSERT IGNORE
// so re-running it on an already-populated table is a no-op.
//
// Primary instructor (instructor_id FK) → source='imported'
// Co-instructors matched by normalized name from InstructorsRaw → source='imported'
func backfillCourseInstructors(db *gorm.DB) error {
	// Load all instructor users.
	var users []models.User
	if err := db.Where("role = ?", models.RoleInstructor).Find(&users).Error; err != nil {
		return fmt.Errorf("backfillCourseInstructors load users: %w", err)
	}
	// Build normalized-first-name → users map for co-instructor matching.
	nameMap := make(map[string][]models.User, len(users))
	for _, u := range users {
		norm := NormalizeInstructorName(u.FullName)
		if norm != "" {
			nameMap[norm] = append(nameMap[norm], u)
		}
	}

	var courses []models.Course
	if err := db.Find(&courses).Error; err != nil {
		return fmt.Errorf("backfillCourseInstructors load courses: %w", err)
	}

	type key struct{ courseID, instructorID uint }
	seen := make(map[key]bool)
	toInsert := make([]models.CourseInstructor, 0, len(courses))

	for _, c := range courses {
		// Primary instructor from the FK column.
		if c.InstructorID != nil && *c.InstructorID != 0 {
			k := key{c.ID, *c.InstructorID}
			if !seen[k] {
				seen[k] = true
				toInsert = append(toInsert, models.CourseInstructor{
					CourseID:     c.ID,
					InstructorID: *c.InstructorID,
					Source:       models.CourseInstructorImported,
				})
			}
		}
		// Co-instructors from the raw name list.
		if c.InstructorsRaw != "" {
			for _, name := range SplitInstructorNames(c.InstructorsRaw) {
				norm := NormalizeInstructorName(name)
				if norm == "" {
					continue
				}
				matches := nameMap[norm]
				if len(matches) != 1 {
					// Zero matches → no account; >1 → ambiguous first name. Skip both.
					continue
				}
				k := key{c.ID, matches[0].ID}
				if !seen[k] {
					seen[k] = true
					toInsert = append(toInsert, models.CourseInstructor{
						CourseID:     c.ID,
						InstructorID: matches[0].ID,
						Source:       models.CourseInstructorImported,
					})
				}
			}
		}
	}

	if len(toInsert) == 0 {
		return nil
	}
	if err := db.Clauses(clause.OnConflict{DoNothing: true}).CreateInBatches(toInsert, 200).Error; err != nil {
		return fmt.Errorf("backfillCourseInstructors insert: %w", err)
	}
	log.Printf("backfillCourseInstructors: inserted/updated %d course-instructor links", len(toInsert))
	return nil
}

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

// DB is the MySQL connection backing all persistent application data.
var DB *gorm.DB

// Connect opens the MySQL connection, migrates the users and courses
// tables, and seeds users from user.sql the first time the table is empty.
func Connect(cfg *config.Config) error {
	dsnConfig := mysqldriver.NewConfig()
	dsnConfig.User = cfg.DBUser
	dsnConfig.Passwd = cfg.DBPassword
	dsnConfig.Net = "tcp"
	dsnConfig.Addr = net.JoinHostPort(cfg.DBHost, cfg.DBPort)
	dsnConfig.DBName = cfg.DBName
	dsnConfig.ParseTime = true
	dsnConfig.Loc = time.UTC
	dsnConfig.Params = map[string]string{"charset": "utf8mb4"}
	dsn := dsnConfig.FormatDSN()
	// docker compose up -d db returns before MySQL is actually accepting
	// connections yet, so a run right after starting the container (or right
	// after a codespace resume) would otherwise fail on the first attempt.
	// Retry with backoff instead of failing immediately.
	const maxAttempts = 15
	const retryDelay = 2 * time.Second

	var db *gorm.DB
	var err error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		db, err = gorm.Open(mysql.Open(dsn), &gorm.Config{
			Logger: gormLogger,
			// Add explicit foreign keys only after legacy rows are backfilled.
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
			return fmt.Errorf("connect to mysql after %d attempts: %w", maxAttempts, err)
		}
		log.Printf("mysql not ready yet (attempt %d/%d), retrying in %s: %v", attempt, maxAttempts, retryDelay, err)
		time.Sleep(retryDelay)
	}

	if err := db.AutoMigrate(&models.User{}); err != nil {
		return fmt.Errorf("migrate users table: %w", err)
	}
	// The course key used to be (code, section, semester, year). A section
	// that meets at several times is now one row per time, so the key gained
	// slot under a new index name — drop the old one or AutoMigrate keeps it
	// and the second time of a section fails to insert.
	if db.Migrator().HasTable(&models.Course{}) && db.Migrator().HasIndex(&models.Course{}, "idx_course_slot") {
		if err := db.Migrator().DropIndex(&models.Course{}, "idx_course_slot"); err != nil {
			return fmt.Errorf("drop legacy courses slot index: %w", err)
		}
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
	if db.Migrator().HasIndex(&models.CoreCourse{}, "idx_core_courses_code") {
		if err := db.Migrator().DropIndex(&models.CoreCourse{}, "idx_core_courses_code"); err != nil {
			return fmt.Errorf("drop legacy core_courses code index: %w", err)
		}
	}
	if err := db.AutoMigrate(&models.CoreCourse{}); err != nil {
		return fmt.Errorf("migrate core_courses table: %w", err)
	}
	if err := db.AutoMigrate(&models.CourseInstructor{}); err != nil {
		return fmt.Errorf("migrate course_instructors table: %w", err)
	}

	// Admin-created accounts start with a blank email (filled in later via
	// Google sign-in), so multiple blank emails must be allowed — a plain
	// unique index would reject the second such account.
	if !db.Migrator().HasIndex(&models.User{}, "idx_users_email_unique") {
		if err := db.Exec(`CREATE UNIQUE INDEX idx_users_email_unique ON users ((NULLIF(email, '')))`).Error; err != nil {
			return fmt.Errorf("create users email unique index: %w", err)
		}
	}

	if err := migrateApplicationData(db); err != nil {
		return fmt.Errorf("migrate application data: %w", err)
	}
	if err := migrateDecimalColumns(db); err != nil {
		return fmt.Errorf("migrate decimal columns: %w", err)
	}
	if err := BackfillPostings(db); err != nil {
		return fmt.Errorf("backfill postings: %w", err)
	}
	if err := migrateToPostingFKs(db); err != nil {
		return fmt.Errorf("migrate to posting FKs: %w", err)
	}
	if err := ensureForeignKeys(db); err != nil {
		return fmt.Errorf("ensure foreign keys: %w", err)
	}
	if err := ensurePostingCourseConsistency(db); err != nil {
		return fmt.Errorf("ensure posting/course consistency: %w", err)
	}
	DB = db

	if err := seedCoreCourses(); err != nil {
		return fmt.Errorf("seed core courses: %w", err)
	}

	// Classlist instructors and courses are real production data — seed them
	// regardless of SEED_DEMO_DATA so the system works out of the box.
	if err := seedClasslistInstructors(); err != nil {
		return fmt.Errorf("seed classlist instructors: %w", err)
	}

	if err := seedCoursesFromClasslist(); err != nil {
		return fmt.Errorf("seed courses from classlist: %w", err)
	}
	if err := backfillCourseInstructors(db); err != nil {
		return fmt.Errorf("backfill course instructors: %w", err)
	}
	if err := promoteOwnerCourseLinks(db); err != nil {
		return fmt.Errorf("promote owner course links: %w", err)
	}

	if err := mergeDuplicateCourses(); err != nil {
		return fmt.Errorf("merge duplicate courses: %w", err)
	}
	if err := splitMultiTimeCourses(); err != nil {
		return fmt.Errorf("split multi-time courses: %w", err)
	}
	if err := mergeSameDaySlots(); err != nil {
		return fmt.Errorf("merge same-day course slots: %w", err)
	}

	if err := seedAdminAccount(); err != nil {
		return fmt.Errorf("seed admin account: %w", err)
	}

	if !cfg.SeedDemoData {
		return nil
	}
	log.Println("SEED_DEMO_DATA enabled: populating demo accounts and applications")

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

	if err := seedMockApplicants(); err != nil {
		return fmt.Errorf("seed mock applicants: %w", err)
	}

	return nil
}
