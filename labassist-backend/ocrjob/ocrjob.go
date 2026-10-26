// Package ocrjob runs a student's OCR upload in the background so leaving the
// page doesn't lose it, and tells the student over WebSocket when it ends.
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
)

const (
	StatusProcessing = "processing"
	StatusFailed     = "failed"
)

// State is the job a student last started for one Kind. A job that finished
// successfully is forgotten — its result is already saved with the profile.
type State struct {
	Status    string    `json:"status" example:"processing"`
	Error     string    `json:"error,omitempty"`
	StartedAt time.Time `json:"started_at"`
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
