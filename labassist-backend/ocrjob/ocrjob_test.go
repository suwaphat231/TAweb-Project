package ocrjob

import (
	"errors"
	"testing"
	"time"
)

func waitGone(t *testing.T, uid uint, kind Kind, want string) *State {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		s := Get(uid, kind)
		if (want == "" && s == nil) || (s != nil && s.Status == want) {
			return s
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("job never reached %q", want)
	return nil
}

func TestStartRejectsSecondJobWhileProcessing(t *testing.T) {
	release := make(chan struct{})
	if !Start(1, Transcript, func() error { <-release; return nil }) {
		t.Fatal("first job should start")
	}
	if s := Get(1, Transcript); s == nil || s.Status != StatusProcessing {
		t.Fatalf("want processing, got %+v", s)
	}
	if Start(1, Transcript, func() error { return nil }) {
		t.Fatal("second job must not start while the first is processing")
	}
	// Another kind, or another student, is independent.
	if !Start(1, StudentInfo, func() error { return nil }) {
		t.Fatal("other kind should start")
	}
	close(release)
	waitGone(t, 1, Transcript, "")
}

func TestFailedJobKeepsErrorUntilRetried(t *testing.T) {
	Start(2, StudentInfo, func() error { return errors.New("อ่านไม่ได้") })
	s := waitGone(t, 2, StudentInfo, StatusFailed)
	if s.Error != "อ่านไม่ได้" {
		t.Fatalf("want error kept, got %q", s.Error)
	}
	if !Start(2, StudentInfo, func() error { return nil }) {
		t.Fatal("a failed job can be retried")
	}
	waitGone(t, 2, StudentInfo, "")
}

func TestPanicBecomesFailure(t *testing.T) {
	Start(3, Transcript, func() error { panic("boom") })
	waitGone(t, 3, Transcript, StatusFailed)
}
