// Package ocrjob runs a user's OCR upload in the background so leaving the
// page doesn't lose it, and tells the user over WebSocket when it ends.
//
// Job state lives in memory on purpose: a job only runs while this process
// does, so after a restart there is nothing left to report as processing.
package ocrjob

import (
	"fmt"
	"log"
	"sync"
	"time"

	"labassist/ws"
)

type Kind string

const (
	Transcript  Kind = "transcript"
	StudentInfo Kind = "student_info"
	// Calendar is an admin's academic-calendar PDF; its result is kept until
	// the admin has reviewed it (see StartResult).
	Calendar Kind = "calendar"
)

const (
	StatusProcessing = "processing"
	StatusFailed     = "failed"
	StatusDone       = "done" // only for jobs started with StartResult
)

// State is the job a student last started for one Kind. A job that finished
// successfully is forgotten — its result is already saved with the profile.
type State struct {
	Status    string    `json:"status" example:"processing"`
	Error     string    `json:"error,omitempty"`
	StartedAt time.Time `json:"started_at"`
	// Meta describes the input (e.g. the file name) and Result is what a
	// StartResult job produced; both are empty for the student jobs.
	Meta   any `json:"meta,omitempty"`
	Result any `json:"result,omitempty"`
}

// FinishedEvent is the "ocr_finished" WebSocket payload.
type FinishedEvent struct {
	Kind   Kind   `json:"kind"`
	Status string `json:"status"` // "done" or "failed"
	Error  string `json:"error,omitempty"`
}

type key struct {
	userID uint
	kind   Kind
}

var (
	mu   sync.Mutex
	jobs = map[key]State{}
)

// Start runs fn in the background as the student's job of this kind. It
// returns false, without running fn, while an earlier job is still
// processing. The error fn returns is shown to the student as is.
func Start(userID uint, kind Kind, fn func() error) bool {
	k := key{userID, kind}
	mu.Lock()
	if jobs[k].Status == StatusProcessing {
		mu.Unlock()
		return false
	}
	jobs[k] = State{Status: StatusProcessing, StartedAt: time.Now()}
	mu.Unlock()

	go func() {
		err := run(fn)
		event := FinishedEvent{Kind: kind, Status: "done"}
		mu.Lock()
		if err != nil {
			log.Printf("[OCR] %s job for user %d failed: %v", kind, userID, err)
			jobs[k] = State{Status: StatusFailed, Error: err.Error(), StartedAt: jobs[k].StartedAt}
			event.Status, event.Error = StatusFailed, err.Error()
		} else {
			delete(jobs, k)
		}
		mu.Unlock()
		ws.GetHub().SendToUser(userID, "ocr_finished", event)
	}()
	return true
}

// StartResult is Start for a job that produces a result the user reviews
// later: on success the state stays as "done" with the result until Clear is
// called. meta is shown while it runs. It returns false while an earlier job
// of this kind is still processing.
func StartResult(userID uint, kind Kind, meta any, fn func() (any, error)) bool {
	k := key{userID, kind}
	mu.Lock()
	if jobs[k].Status == StatusProcessing {
		mu.Unlock()
		return false
	}
	started := time.Now()
	jobs[k] = State{Status: StatusProcessing, StartedAt: started, Meta: meta}
	mu.Unlock()

	go func() {
		var result any
		err := run(func() error {
			var e error
			result, e = fn()
			return e
		})
		event := FinishedEvent{Kind: kind, Status: "done"}
		mu.Lock()
		if err != nil {
			log.Printf("[OCR] %s job for user %d failed: %v", kind, userID, err)
			jobs[k] = State{Status: StatusFailed, Error: err.Error(), StartedAt: started, Meta: meta}
			event.Status, event.Error = StatusFailed, err.Error()
		} else {
			jobs[k] = State{Status: StatusDone, StartedAt: started, Meta: meta, Result: result}
		}
		mu.Unlock()
		ws.GetHub().SendToUser(userID, "ocr_finished", event)
	}()
	return true
}

// Clear forgets the user's job of this kind unless it is still processing
// (a running job can't be cancelled). It reports whether anything was removed.
func Clear(userID uint, kind Kind) bool {
	k := key{userID, kind}
	mu.Lock()
	defer mu.Unlock()
	s, ok := jobs[k]
	if !ok || s.Status == StatusProcessing {
		return false
	}
	delete(jobs, k)
	return true
}

// run calls fn, turning a panic into an error so the job can't stay
// "processing" forever.
func run(fn func() error) (err error) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[OCR] job panic: %v", r)
			err = fmt.Errorf("เกิดข้อผิดพลาดระหว่างอ่านเอกสาร กรุณาลองใหม่อีกครั้ง")
		}
	}()
	return fn()
}

// Get returns the student's job of this kind, if one is processing or failed.
func Get(userID uint, kind Kind) *State {
	mu.Lock()
	defer mu.Unlock()
	s, ok := jobs[key{userID, kind}]
	if !ok {
		return nil
	}
	return &s
}
