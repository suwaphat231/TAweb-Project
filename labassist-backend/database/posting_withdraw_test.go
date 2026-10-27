package database

import (
	"errors"
	"testing"
	"time"

	"labassist/models"
)

func TestPostingAcceptsWithdrawal_ScheduleConfirmed(t *testing.T) {
	open := models.Posting{IsActive: true, Status: models.StatusOpen}
	if err := postingAcceptsWithdrawal(open); err != nil {
		t.Fatalf("open posting: %v", err)
	}

	scheduled := open
	scheduled.LabBoyScheduleConfirmed = true
	if err := postingAcceptsWithdrawal(scheduled); !errors.Is(err, ErrWithdrawalScheduleConfirmed) {
		t.Fatalf("schedule confirmed: err = %v, want ErrWithdrawalScheduleConfirmed", err)
	}

	// The roster check still comes first when both are confirmed.
	now := time.Now()
	both := scheduled
	both.LabBoyRosterConfirmedAt = &now
	if err := postingAcceptsWithdrawal(both); !errors.Is(err, ErrWithdrawalRosterConfirmed) {
		t.Fatalf("roster and schedule confirmed: err = %v, want ErrWithdrawalRosterConfirmed", err)
	}
}
