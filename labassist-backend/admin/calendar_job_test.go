package admin

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"labassist/config"
	"labassist/database"
	"labassist/models"
	"labassist/ocrjob"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

// The calendar preview answers 202 at once, reads the file in the background
// and keeps the result for the admin until it is cleared.
func TestCalendarPreviewRunsInBackground(t *testing.T) {
	dsn := os.Getenv("LABASSIST_TEST_MYSQL_DSN")
	if dsn == "" {
		t.Skip("set LABASSIST_TEST_MYSQL_DSN to an empty disposable MySQL database")
	}
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true})
	if err != nil {
		t.Fatal(err)
	}
	old := database.DB
	database.DB = db
	t.Cleanup(func() { database.DB = old })
	tables := []any{&models.CalendarDate{}, &models.AcademicTerm{}}
	if err := db.Migrator().DropTable(tables...); err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(tables...); err != nil {
		t.Fatal(err)
	}

	// A fake OCR service that takes a moment, like the real one.
	release := make(chan struct{})
	ocr := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release
		json.NewEncoder(w).Encode(map[string]any{
			"entries":                []any{},
			"detected_academic_year": 2569,
			"used_ocr":               true,
			"terms": []map[string]any{
				{"semester": "1", "open_date": "2026-07-06", "close_date": "2026-11-08", "open_name": "วันเปิดเรียน", "close_name": "วันปิดเรียนภาคการศึกษา", "page": 2},
			},
		})
	}))
	defer ocr.Close()

	h := NewHandler(&config.Config{OCRServiceURL: ocr.URL})
	const adminID = 4242
	t.Cleanup(func() { ocrjob.Clear(adminID, ocrjob.Calendar) })

	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, _ := mw.CreateFormFile("file", "calendar2569.pdf")
	fw.Write([]byte("%PDF-1.4 test"))
	mw.WriteField("academic_year", "2569")
	mw.Close()

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/admin/calendar/import/preview", &body)
	c.Request.Header.Set("Content-Type", mw.FormDataContentType())
	c.Set("user_id", uint(adminID))

	start := time.Now()
	h.PreviewCalendarImport(c)
	if w.Code != http.StatusAccepted {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if time.Since(start) > time.Second {
		t.Fatal("the request must not wait for the OCR")
	}

	// While the OCR runs: processing, and a second upload is refused.
	job := ocrjob.Get(adminID, ocrjob.Calendar)
	if job == nil || job.Status != ocrjob.StatusProcessing {
		t.Fatalf("want processing, got %+v", job)
	}
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request = httptest.NewRequest(http.MethodPost, "/admin/calendar/import/preview", bytes.NewReader(nil))
	c2.Set("user_id", uint(adminID))
	h.PreviewCalendarImport(c2) // fails validation before reaching the job: still not a 202
	if w2.Code == http.StatusAccepted {
		t.Fatal("an invalid request must not start a job")
	}
	wc := httptest.NewRecorder()
	cc, _ := gin.CreateTestContext(wc)
	cc.Set("user_id", uint(adminID))
	h.ClearCalendarJob(cc)
	if wc.Code != http.StatusConflict {
		t.Fatalf("clearing a running job = %d, want 409", wc.Code)
	}

	close(release)
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if j := ocrjob.Get(adminID, ocrjob.Calendar); j != nil && j.Status != ocrjob.StatusProcessing {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	job = ocrjob.Get(adminID, ocrjob.Calendar)
	if job == nil || job.Status != ocrjob.StatusDone {
		t.Fatalf("want done, got %+v", job)
	}
	res, ok := job.Result.(*CalendarPreviewResponse)
	if !ok || len(res.Terms) != 3 || res.Terms[0].OpenDate != "2026-07-06" || res.Terms[0].CloseDate != "2026-11-08" {
		t.Fatalf("result not kept as read: %+v", job.Result)
	}

	// The admin's job is theirs alone.
	if ocrjob.Get(adminID+1, ocrjob.Calendar) != nil {
		t.Fatal("another admin must not see this job")
	}

	wd := httptest.NewRecorder()
	cd, _ := gin.CreateTestContext(wd)
	cd.Set("user_id", uint(adminID))
	h.ClearCalendarJob(cd)
	if ocrjob.Get(adminID, ocrjob.Calendar) != nil {
		t.Fatal("job should be gone after clearing")
	}
}
