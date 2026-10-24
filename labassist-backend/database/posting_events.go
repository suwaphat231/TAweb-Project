package database

import (
	"sync"
	"time"

	"labassist/ws"

	"gorm.io/gorm"
)

// coursesUpdatedDelay lets the transaction that changed a posting commit, and
// folds a burst of changes (one save touches several postings) into a single
// push, before clients are told to refetch.
const coursesUpdatedDelay = 500 * time.Millisecond

var (
	coursesUpdatedMu    sync.Mutex
	coursesUpdatedTimer *time.Timer
)

// registerPostingEvents tells every connected client that the course list
// changed whenever a posting is created, updated or deleted, so the student
// "สมัคร Lab Boy" page shows a course the moment an instructor opens it.
// Hooking GORM covers every code path that opens, closes or resets a posting.
func registerPostingEvents(db *gorm.DB) error {
	notify := func(tx *gorm.DB) {
		if tx.Error == nil && tx.Statement.Table == "postings" && tx.RowsAffected > 0 {
			scheduleCoursesUpdated()
		}
	}
	if err := db.Callback().Create().After("gorm:create").Register("labassist:posting_created", notify); err != nil {
		return err
	}
	if err := db.Callback().Update().After("gorm:update").Register("labassist:posting_updated", notify); err != nil {
		return err
	}
	return db.Callback().Delete().After("gorm:delete").Register("labassist:posting_deleted", notify)
}

func scheduleCoursesUpdated() {
	coursesUpdatedMu.Lock()
	defer coursesUpdatedMu.Unlock()
	if coursesUpdatedTimer != nil {
		coursesUpdatedTimer.Stop()
	}
	coursesUpdatedTimer = time.AfterFunc(coursesUpdatedDelay, func() {
		ws.GetHub().Broadcast("courses_updated", nil)
	})
}
