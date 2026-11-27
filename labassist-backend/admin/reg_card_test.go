package admin

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"labassist/database"
	"labassist/models"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

// The admin checks each student's สถานภาพ from the OCR result on the
// student's profile and suspends those who are not ปกติ: the user list must
// carry the status and the REG card image must open for the admin.
func TestAdminSeesStudentRegCard(t *testing.T) {
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
	tables := []any{&models.User{}, &models.StudentInfoDocument{}}
	if err := db.Migrator().DropTable(tables...); err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(tables...); err != nil {
		t.Fatal(err)
	}

	sfx := time.Now().Format("150405.000000")
	mk := func(name string, role models.UserRole) models.User {
		u, err := database.CreateUser(models.User{FullName: name, Email: fmt.Sprintf("%s.%s@test.invalid", name, sfx), Role: role, IsActive: true})
		if err != nil {
			t.Fatal(err)
		}
		return u
	}
	withCard := mk("withcard", models.RoleStudent)
	noCard := mk("nocard", models.RoleStudent)
	inst := mk("inst", models.RoleInstructor)

	png := []byte("\x89PNG\r\n\x1a\n0000000000000000")
	status := "พ้นสภาพ"
	if err := db.Create(&models.StudentInfoDocument{UserID: withCard.ID, FileName: "reg.png", FileData: png, OcrStudentStatus: &status}).Error; err != nil {
		t.Fatal(err)
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := &Handler{}
	r.GET("/admin/users", h.Users)
	r.GET("/admin/users/:id/student-info/file", h.StudentRegCardFile)
	get := func(path string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w
	}

	t.Run("user list carries the OCR status for students only", func(t *testing.T) {
		w := get("/admin/users")
		if w.Code != http.StatusOK {
			t.Fatalf("GET /admin/users = %d %s", w.Code, w.Body)
		}
		var rows []map[string]any
		if err := json.Unmarshal(w.Body.Bytes(), &rows); err != nil {
			t.Fatal(err)
		}
		byID := map[float64]map[string]any{}
		for _, row := range rows {
			byID[row["id"].(float64)] = row
		}
		wc := byID[float64(withCard.ID)]
		if wc["ocr_student_status"] != status || wc["has_reg_card"] != true {
			t.Errorf("student with card = %v", wc)
		}
		if _, ok := wc["display_name"]; !ok {
			t.Errorf("User.MarshalJSON fields lost: %v", wc)
		}
		nc := byID[float64(noCard.ID)]
		if nc["ocr_student_status"] != nil || nc["has_reg_card"] != false {
			t.Errorf("student without card = %v", nc)
		}
		if _, ok := byID[float64(inst.ID)]["has_reg_card"]; ok {
			t.Errorf("instructor row has REG card fields: %v", byID[float64(inst.ID)])
		}
	})

	t.Run("REG card image opens for the admin", func(t *testing.T) {
		w := get(fmt.Sprintf("/admin/users/%d/student-info/file", withCard.ID))
		if w.Code != http.StatusOK || w.Header().Get("Content-Type") != "image/png" || w.Body.Len() != len(png) {
			t.Fatalf("card = %d %q %d bytes", w.Code, w.Header().Get("Content-Type"), w.Body.Len())
		}
		if w := get(fmt.Sprintf("/admin/users/%d/student-info/file", noCard.ID)); w.Code != http.StatusNotFound {
			t.Errorf("student without card = %d, want 404", w.Code)
		}
		if w := get(fmt.Sprintf("/admin/users/%d/student-info/file", inst.ID)); w.Code != http.StatusNotFound {
			t.Errorf("non-student = %d, want 404", w.Code)
		}
	})
}
