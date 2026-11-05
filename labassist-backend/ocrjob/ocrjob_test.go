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

func TestStartResultKeepsResultUntilCleared(t *testing.T) {
	if !StartResult(10, Calendar, "calendar.pdf", func() (any, error) { return map[string]int{"entries": 3}, nil }) {
		t.Fatal("job should start")
	}
	s := waitGone(t, 10, Calendar, StatusDone)
	if s.Result == nil || s.Meta != "calendar.pdf" {
		t.Fatalf("want result and meta kept, got %+v", s)
	}
	// Still there when asked again: the admin may come back to it later.
	if Get(10, Calendar) == nil {
		t.Fatal("done job must stay until cleared")
	}
	if !Clear(10, Calendar) || Get(10, Calendar) != nil {
		t.Fatal("Clear should remove a done job")
	}
}

func TestStartResultRejectsSecondAndKeepsFailure(t *testing.T) {
	release := make(chan struct{})
	StartResult(11, Calendar, nil, func() (any, error) { <-release; return nil, errors.New("OCR ล่ม") })
	if StartResult(11, Calendar, nil, func() (any, error) { return nil, nil }) {
		t.Fatal("second job must not start while processing")
	}
	if Clear(11, Calendar) {
		t.Fatal("a running job cannot be cleared")
	}
	close(release)
	s := waitGone(t, 11, Calendar, StatusFailed)
	if s.Error != "OCR ล่ม" || s.Result != nil {
		t.Fatalf("want error kept and no result, got %+v", s)
	}
	if !StartResult(11, Calendar, nil, func() (any, error) { return 1, nil }) {
		t.Fatal("a failed job can be retried")
	}
	waitGone(t, 11, Calendar, StatusDone)
	Clear(11, Calendar)
}
