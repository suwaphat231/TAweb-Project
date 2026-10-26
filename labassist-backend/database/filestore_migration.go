package database

import (
	"fmt"
	"log"
	"net/http"

	"labassist/filestore"

	"gorm.io/gorm"
)

// blobColumn is one place an uploaded file used to be kept as a MySQL blob,
// and the key column that now points at it in object storage.
type blobColumn struct {
	table, blob, key, prefix string
	// contentType is the column holding the file's type, if the table has one.
	contentType string
}

var blobColumns = []blobColumn{
	{table: "transcripts", blob: "file_data", key: "file_key", prefix: "transcripts"},
	{table: "transcript_images", blob: "file_data", key: "file_key", prefix: "transcript-images", contentType: "content_type"},
	{table: "student_info_documents", blob: "file_data", key: "file_key", prefix: "student-info"},
	{table: "applications", blob: "grade_proof_data", key: "grade_proof_key", prefix: "grade-proofs"},
	{table: "application_history", blob: "grade_proof_data", key: "grade_proof_key", prefix: "grade-proofs"},
	{table: "class_schedules", blob: "image_data", key: "image_key", prefix: "class-schedules"},
	{table: "labboy_report_evidence", blob: "data", key: "data_key", prefix: "report-evidence", contentType: "content_type"},
}

// migrateBlobColumnsNullable drops NOT NULL from the blob columns that had it:
// a file kept in object storage leaves its blob empty. AutoMigrate does not
// relax an existing column, so this does. Idempotent.
func migrateBlobColumnsNullable(db *gorm.DB) error {
	for _, c := range []struct{ table, col string }{
		{"transcripts", "file_data"},
		{"transcript_images", "file_data"},
		{"labboy_report_evidence", "data"},
	} {
		var nullable string
		if err := db.Raw(`SELECT IS_NULLABLE FROM information_schema.COLUMNS
			WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
			c.table, c.col).Scan(&nullable).Error; err != nil {
			return fmt.Errorf("check %s.%s: %w", c.table, c.col, err)
		}
		if nullable != "NO" {
			continue // not created yet, or already nullable
		}
		if err := db.Exec(fmt.Sprintf("ALTER TABLE `%s` MODIFY COLUMN `%s` LONGBLOB NULL", c.table, c.col)).Error; err != nil {
			return fmt.Errorf("make %s.%s nullable: %w", c.table, c.col, err)
		}
		log.Printf("made %s.%s nullable", c.table, c.col)
	}
	return nil
}

// MigrateBlobsToFileStore moves files still kept as MySQL blobs into object
// storage, one row at a time, then clears the blob. Rows are read through
// filestore.Load either way, so it can run in the background while the app
// serves requests, and is safe to interrupt and re-run on the next start.
func MigrateBlobsToFileStore() {
	if !filestore.Enabled() {
		return
	}
	for _, c := range blobColumns {
		moved, err := migrateBlobColumn(c)
		if moved > 0 {
			log.Printf("[filestore] moved %d file(s) from %s.%s to object storage", moved, c.table, c.blob)
		}
		if err != nil {
			log.Printf("[filestore] moving %s.%s stopped, will retry next start: %v", c.table, c.blob, err)
		}
	}
}

func migrateBlobColumn(c blobColumn) (int, error) {
	pending := fmt.Sprintf("`%s` = '' AND `%s` IS NOT NULL AND LENGTH(`%s`) > 0", c.key, c.blob, c.blob)
	moved := 0
	lastID := uint(0)
	for {
		// IDs only, a batch at a time, so the blobs are loaded one by one.
		var ids []uint
		if err := DB.Table(c.table).Where("id > ? AND "+pending, lastID).
			Order("id").Limit(50).Pluck("id", &ids).Error; err != nil {
			return moved, err
		}
		if len(ids) == 0 {
			return moved, nil
		}
		for _, id := range ids {
			lastID = id
			if err := migrateBlobRow(c, pending, id); err != nil {
				return moved, fmt.Errorf("row %d: %w", id, err)
			}
			moved++
		}
	}
}

func migrateBlobRow(c blobColumn, pending string, id uint) error {
	var row struct {
		Data        []byte
		ContentType string
	}
	cols := fmt.Sprintf("`%s` AS data", c.blob)
	if c.contentType != "" {
		cols += fmt.Sprintf(", `%s` AS content_type", c.contentType)
	}
	if err := DB.Table(c.table).Select(cols).Where("id = ?", id).Take(&row).Error; err != nil {
		return err
	}
	if row.ContentType == "" {
		row.ContentType = http.DetectContentType(row.Data)
	}
	key, _, err := filestore.Save(c.prefix, row.Data, row.ContentType)
	if err != nil {
		return err
	}
	// Only clear a blob that is still the pending one — a new upload may have
	// replaced the row while this file was being copied.
	res := DB.Table(c.table).Where("id = ? AND "+pending, id).
		Updates(map[string]any{c.key: key, c.blob: nil})
	if res.Error != nil || res.RowsAffected == 0 {
		filestore.Remove(key)
	}
	return res.Error
}
