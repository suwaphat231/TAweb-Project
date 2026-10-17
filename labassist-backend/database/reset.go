package database

import (
	"context"
	"fmt"
	"log"

	"gorm.io/gorm"
)

// resetSchema drops every table in the connected database so the startup
// migrations and seeds rebuild it from scratch (RESET_DB_ON_START). Foreign
// key checks are a session setting, so all statements share one connection
// and the setting is restored before it goes back to the pool.
func resetSchema(db *gorm.DB) error {
	return db.Connection(func(tx *gorm.DB) (err error) {
		if err := tx.Exec("SET FOREIGN_KEY_CHECKS = 0").Error; err != nil {
			return fmt.Errorf("disable foreign key checks: %w", err)
		}
		// tx keeps its first error and skips every later statement, so restore
		// directly on the pinned connection.
		defer func() {
			if _, restoreErr := tx.Statement.ConnPool.ExecContext(context.Background(), "SET FOREIGN_KEY_CHECKS = 1"); restoreErr != nil && err == nil {
				err = fmt.Errorf("restore foreign key checks: %w", restoreErr)
			}
		}()

		var tables []string
		if err := tx.Raw(`SELECT table_name FROM information_schema.tables
			WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`).Scan(&tables).Error; err != nil {
			return fmt.Errorf("list tables: %w", err)
		}
		for _, table := range tables {
			if err := tx.Exec("DROP TABLE `" + table + "`").Error; err != nil {
				return fmt.Errorf("drop table %s: %w", table, err)
			}
		}
		log.Printf("RESET_DB_ON_START: dropped %d tables", len(tables))
		return nil
	})
}
