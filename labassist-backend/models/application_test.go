package models

import (
	"sync"
	"testing"

	"gorm.io/gorm/schema"
)

func TestApplicationReferencesUserPrimaryKey(t *testing.T) {
	s, err := schema.Parse(&Application{}, &sync.Map{}, schema.NamingStrategy{})
	if err != nil {
		t.Fatal(err)
	}
	r := s.Relationships.Relations["Student"]
	if r.Type != schema.BelongsTo || len(r.References) != 1 {
		t.Fatalf("unexpected student relationship: %v", r.Type)
	}
	ref := r.References[0]
	if ref.PrimaryKey.Name != "ID" || ref.ForeignKey.Name != "StudentID" || ref.OwnPrimaryKey {
		t.Fatal("application must reference users.id, not users.student_id")
	}
}
