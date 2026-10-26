package database

import (
	"sync"
	"time"

	"labassist/ws"

	"gorm.io/gorm"
)

// liveEventDelay lets the transaction that changed a row commit, and folds a
// burst of changes (one save touches several rows) into a single push, before
// clients are told to refetch.
const liveEventDelay = 500 * time.Millisecond

// liveEventTables maps a watched table to the event pushed when it changes.
var liveEventTables = map[string]string{
	"postings":     "courses_updated",
	"applications": "application_updated",
}

var (
	liveEventMu     sync.Mutex
	liveEventTimers = map[string]*time.Timer{}
)

// registerPostingEvents tells every connected client to refetch whenever a
// posting or an application is created, updated or deleted, so the student
// "สมัคร Lab Boy" page shows a course the moment an instructor opens it and
// applicants/instructors see a status change without reloading. Hooking GORM
// covers every code path that changes those rows. The push carries no data;
// each client refetches through the API, which applies its own access rules.
func registerPostingEvents(db *gorm.DB) error {
	notify := func(tx *gorm.DB) {
		if tx.Error != nil || tx.RowsAffected == 0 {
			return
		}
		if event, ok := liveEventTables[tx.Statement.Table]; ok {
			scheduleLiveEvent(event)
		}
	}
	if err := db.Callback().Create().After("gorm:create").Register("labassist:live_created", notify); err != nil {
		return err
	}
	if err := db.Callback().Update().After("gorm:update").Register("labassist:live_updated", notify); err != nil {
		return err
	}
	return db.Callback().Delete().After("gorm:delete").Register("labassist:live_deleted", notify)
}

func scheduleLiveEvent(event string) {
	liveEventMu.Lock()
	defer liveEventMu.Unlock()
	if t := liveEventTimers[event]; t != nil {
		t.Stop()
	}
	liveEventTimers[event] = time.AfterFunc(liveEventDelay, func() {
		ws.GetHub().Broadcast(event, nil)
	})
}
