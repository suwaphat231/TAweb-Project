package database

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrNoPlannedSessions means the approval memo's plan has no payable work
// day in the requested month.
var ErrNoPlannedSessions = errors.New("no planned work sessions in this month")

// PlannedMonth is one month of an approval memo's frozen work plan.
type PlannedMonth struct {
	Year     int // CE
	Month    int
	Sessions int
	Hours    float64 // per Lab Boy
}

// memoPlan returns the payable sessions and hourly rate (baht) frozen on a
// document's snapshot.
func memoPlan(doc models.StaffDocument) ([]models.OccurrenceSnapshot, float64) {
	var ds models.DocumentDataSnapshot
	if doc.DataSnapshot == "" || json.Unmarshal([]byte(doc.DataSnapshot), &ds) != nil {
		return nil, 0
	}
	rate := ds.RatePerHourBaht
	if rate <= 0 {
		rate = float64(DefaultHourlyRateSatang) / 100.0
	}
	var payable []models.OccurrenceSnapshot
	for _, o := range ds.Occurrences {
		if o.Status == string(models.OccurrenceScheduled) || o.Status == string(models.OccurrenceCompleted) {
			payable = append(payable, o)
		}
	}
	sort.Slice(payable, func(i, j int) bool { return payable[i].Date < payable[j].Date })
	return payable, rate
}

func sessionHours(o models.OccurrenceSnapshot) float64 {
	if o.Hours > 0 {
		return o.Hours
	}
	toMin := func(hhmm string) int {
		h, m, _ := strings.Cut(hhmm, ":")
		hi, _ := strconv.Atoi(h)
		mi, _ := strconv.Atoi(m)
		return hi*60 + mi
	}
	if d := toMin(o.EndTime) - toMin(o.StartTime); d > 0 {
		return float64(d) / 60
	}
	return 0
}

func roundBaht(v float64) float64 { return math.Round(v*100) / 100 }

// PlannedMonths lists the months of a memo's plan with their payable
// sessions, plus the rate (baht/hour) the plan was frozen with.
func PlannedMonths(memo models.StaffDocument) ([]PlannedMonth, float64) {
	sessions, rate := memoPlan(memo)
	var out []PlannedMonth
	for _, o := range sessions {
		if len(o.Date) < 7 {
			continue
		}
		y, _ := strconv.Atoi(o.Date[:4])
		m, _ := strconv.Atoi(o.Date[5:7])
		if n := len(out); n == 0 || out[n-1].Year != y || out[n-1].Month != m {
			out = append(out, PlannedMonth{Year: y, Month: m})
		}
		out[len(out)-1].Sessions++
		out[len(out)-1].Hours += sessionHours(o)
	}
	return out, rate
}

// PlannedMonthAmount is what one month of the plan costs for the memo's roster.
func PlannedMonthAmount(pm PlannedMonth, rate float64, labBoys int) float64 {
	return roundBaht(roundBaht(pm.Hours*rate) * float64(labBoys))
}

// paymentRequestFromMemo bills one month of the approval memo's plan:
// the memo's roster, each paid for that month's planned hours at its rate.
func paymentRequestFromMemo(memo models.StaffDocument, year, month int) (models.StaffDocument, error) {
	months, rate := PlannedMonths(memo)
	var pm *PlannedMonth
	for i := range months {
		if months[i].Year == year && months[i].Month == month {
			pm = &months[i]
		}
	}
	if pm == nil {
		return models.StaffDocument{}, ErrNoPlannedSessions
	}

	sessions, _ := memoPlan(memo)
	prefix := fmt.Sprintf("%04d-%02d-", year, month)
	ds := models.DocumentDataSnapshot{SchemaVersion: memo.SnapshotVersion, RatePerHourBaht: rate, LabBoyCount: len(memo.Roster)}
	var days []int
	for _, o := range sessions {
		if strings.HasPrefix(o.Date, prefix) {
			ds.Occurrences = append(ds.Occurrences, o)
			d, _ := strconv.Atoi(o.Date[8:10])
			days = append(days, d)
		}
	}
	snap, err := json.Marshal(ds)
	if err != nil {
		return models.StaffDocument{}, err
	}

	perStudent := roundBaht(pm.Hours * rate)
	doc := models.StaffDocument{
		Type:            models.DocPaymentRequest,
		CourseRef:       memo.CourseRef,
		PostingID:       memo.PostingID,
		CourseID:        memo.CourseID,
		StaffCaseID:     memo.StaffCaseID,
		Status:          models.DocDraft,
		Period:          &models.DocumentPeriod{Month: month, Year: year + 543},
		SessionDates:    days,
		Rate:            rate,
		PriorMemoRef:    memo.RefNumber,
		DeptHeadName:    memo.DeptHeadName,
		DataSnapshot:    string(snap),
		SnapshotVersion: memo.SnapshotVersion,
	}
	if pm.Sessions > 0 {
		doc.HoursPerSession = roundBaht(pm.Hours / float64(pm.Sessions))
	}
	for _, r := range memo.Roster {
		r.Hours = roundBaht(pm.Hours)
		r.Amount = perStudent
		doc.Roster = append(doc.Roster, r)
		doc.TotalAmount += perStudent
	}
	doc.TotalAmount = roundBaht(doc.TotalAmount)
	return doc, nil
}

// NewPaymentRequest asks for the payment request of one planned month.
type NewPaymentRequest struct {
	PostingID uint
	Year      int // CE
	Month     int
	Replace   bool
	Reason    string
	ActorID   uint
	// Fill sets what the caller decides (name, staff officer, the memo's
	// date in Thai) on the document built from the memo, inside the
	// creating transaction.
	Fill func(doc *models.StaffDocument, memo models.StaffDocument)
}

// CreatePaymentRequest creates step 4 for one month entirely from the active
// approval memo: one active document per month, a replaced one superseded.
func CreatePaymentRequest(n NewPaymentRequest) (models.StaffDocument, error) {
	var doc models.StaffDocument
	err := DB.Transaction(func(tx *gorm.DB) error {
		var p models.Posting
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Select("id").First(&p, n.PostingID).Error; err != nil {
			return err
		}
		memo, ok, err := activeDocTx(tx, n.PostingID, models.DocApprovalMemo)
		if err != nil {
			return err
		}
		if !ok {
			return ErrPrerequisiteMissing
		}
		if doc, err = paymentRequestFromMemo(memo, n.Year, n.Month); err != nil {
			return err
		}
		doc.BasedOnDocumentID = &memo.ID
		doc.StaffID = n.ActorID
		if n.Fill != nil {
			n.Fill(&doc, memo)
		}

		var existing []models.StaffDocument
		if err := tx.Omit("signed_file_data").Where("posting_id = ? AND type = ? AND status NOT IN ?", n.PostingID, models.DocPaymentRequest,
			[]models.DocStatus{models.DocCancelled, models.DocSuperseded}).Find(&existing).Error; err != nil {
			return err
		}
		var current *models.StaffDocument
		for i := range existing {
			if pe := existing[i].Period; pe != nil && pe.Month == doc.Period.Month && pe.Year == doc.Period.Year {
				current = &existing[i]
			}
		}
		if current != nil && !n.Replace {
			return ErrDocumentExists
		}
		doc.Version = 1
		if current != nil {
			doc.Version = current.Version + 1
		}
		if err := tx.Create(&doc).Error; err != nil {
			return err
		}
		if current != nil {
			if err := tx.Model(&models.StaffDocument{}).Where("id = ?", current.ID).
				Updates(map[string]any{"status": models.DocSuperseded, "superseded_by_id": doc.ID}).Error; err != nil {
				return err
			}
			if err := writeDocAuditTx(tx, *current, "supersede", n.ActorID, string(current.Status), string(models.DocSuperseded), n.Reason); err != nil {
				return err
			}
		}
		return writeDocAuditTx(tx, doc, "create", n.ActorID, "", fmt.Sprintf("%s %d/%d v%d", doc.Type, doc.Period.Month, doc.Period.Year, doc.Version), n.Reason)
	})
	return doc, err
}
