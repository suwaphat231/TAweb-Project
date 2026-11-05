package database

import (
	"fmt"
	"strings"
	"time"

	"labassist/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// holidaySyncLockName is the MySQL advisory lock that keeps two syncs (two
// backend instances, or a scheduled run and a staff click) from overlapping.
const holidaySyncLockName = "labassist_holiday_sync"

// maxHolidaySyncRuns is how many run records are kept; older ones are pruned.
const maxHolidaySyncRuns = 200

// ExternalHoliday is one validated holiday from the data source.
type ExternalHoliday struct {
	Date time.Time // midnight UTC, date only
	Name string
	Type string // the source's own type, e.g. "substitution_holiday"
}

// ExternalHolidayResult counts what one upsert did and lists the rows that are
// new, so the caller can run the usual follow-up for a new holiday.
type ExternalHolidayResult struct {
	Created        []models.CalendarDate
	Updated        int
	Unchanged      int
	SkippedManual  int
	SkippedDeleted int
	Missing        int
}

// ExternalHolidayKey is the stable key of an imported holiday: its date. The
// source lists at most one holiday per day, and keying on the date lets a
// renamed holiday update in place instead of becoming a second row.
func ExternalHolidayKey(d time.Time) string {
	return "th-public:" + d.Format("2006-01-02")
}

// WithHolidaySyncLock runs fn only if no other sync holds the lock. It
// reports false, without running fn, when the lock is taken.
func WithHolidaySyncLock(fn func() error) (ran bool, err error) {
	err = DB.Connection(func(conn *gorm.DB) error {
		var got int
		if err := conn.Raw("SELECT GET_LOCK(?, 0)", holidaySyncLockName).Scan(&got).Error; err != nil {
			return err
		}
		if got != 1 {
			return nil
		}
		ran = true
		defer conn.Exec("SELECT RELEASE_LOCK(?)", holidaySyncLockName)
		return fn()
	})
	return ran, err
}

// UpsertExternalHolidays saves one year of validated holidays in a single
// transaction, so a failure leaves the stored data exactly as it was.
//
//   - Holidays are saved as global, public_holiday rows with source=external.
//   - A holiday staff already added by hand (global, or the same name on the
//     same day) is left alone and not duplicated.
//   - A holiday staff deleted after an earlier import stays deleted.
//   - Rows imported earlier but absent from the source are kept and counted
//     as Missing; the sync never deletes anything.
//
// year is the calendar year (ค.ศ.) the holidays belong to; now stamps SyncedAt.
func UpsertExternalHolidays(year int, holidays []ExternalHoliday, now time.Time) (ExternalHolidayResult, error) {
	var res ExternalHolidayResult
	err := DB.Transaction(func(tx *gorm.DB) error {
		first := time.Date(year, time.January, 1, 0, 0, 0, 0, time.UTC)
		last := time.Date(year, time.December, 31, 0, 0, 0, 0, time.UTC)

		var existing []models.CalendarDate
		if err := tx.Where("source = ? AND date BETWEEN ? AND ?",
			models.DateSourceExternal, first.Format("2006-01-02"), last.Format("2006-01-02")).
			Find(&existing).Error; err != nil {
			return err
		}
		byKey := make(map[string]models.CalendarDate, len(existing))
		for _, e := range existing {
			if e.ExternalKey != nil {
				byKey[*e.ExternalKey] = e
			}
		}

		// Holidays staff added by hand on these dates.
		var manual []models.CalendarDate
		if err := tx.Where("source = ? AND date BETWEEN ? AND ? AND date_type IN ?",
			models.DateSourceManual, first.Format("2006-01-02"), last.Format("2006-01-02"),
			[]models.CalendarDateType{models.DateTypePublicHoliday, models.DateTypeUniversityHoliday}).
			Find(&manual).Error; err != nil {
			return err
		}
		manualGlobal := map[string]bool{} // date -> a global manual holiday exists
		manualNamed := map[string]bool{}  // date|name -> any-scope manual holiday exists
		for _, m := range manual {
			day := m.Date.Format("2006-01-02")
			if m.Scope == models.DateScopeGlobal {
				manualGlobal[day] = true
			}
			manualNamed[day+"|"+normalizeHolidayName(m.Name)] = true
		}

		var excluded []models.CalendarDateExclusion
		if err := tx.Where("external_key LIKE ?", "th-public:"+fmt.Sprintf("%d", year)+"-%").Find(&excluded).Error; err != nil {
			return err
		}
		deleted := make(map[string]bool, len(excluded))
		for _, x := range excluded {
			deleted[x.ExternalKey] = true
		}

		seen := make(map[string]bool, len(holidays))
		var unchangedIDs []uint
		for _, h := range holidays {
			key := ExternalHolidayKey(h.Date)
			seen[key] = true
			day := h.Date.Format("2006-01-02")

			if cur, ok := byKey[key]; ok {
				if cur.Name == h.Name && cur.ExternalType == h.Type {
					unchangedIDs = append(unchangedIDs, cur.ID)
					res.Unchanged++
					continue
				}
				if err := tx.Model(&models.CalendarDate{}).Where("id = ?", cur.ID).
					Updates(map[string]interface{}{"name": h.Name, "external_type": h.Type, "synced_at": now}).Error; err != nil {
					return err
				}
				res.Updated++
				continue
			}
			if deleted[key] {
				res.SkippedDeleted++
				continue
			}
			if manualGlobal[day] || manualNamed[day+"|"+normalizeHolidayName(h.Name)] {
				res.SkippedManual++
				continue
			}
			affects := true
			k := key
			row := models.CalendarDate{
				Date:         h.Date,
				Name:         h.Name,
				DateType:     models.DateTypePublicHoliday,
				Scope:        models.DateScopeGlobal,
				AffectsWork:  &affects,
				Source:       models.DateSourceExternal,
				ExternalKey:  &k,
				ExternalType: h.Type,
				SyncedAt:     &now,
				EditReason:   "นำเข้าอัตโนมัติจากข้อมูลวันหยุดราชการ",
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
			res.Created = append(res.Created, row)
		}

		if len(unchangedIDs) > 0 {
			// Only the sync stamp moves; UpdateColumn leaves updated_at alone.
			if err := tx.Model(&models.CalendarDate{}).Where("id IN ?", unchangedIDs).
				UpdateColumn("synced_at", now).Error; err != nil {
				return err
			}
		}
		for key := range byKey {
			if !seen[key] {
				res.Missing++
			}
		}
		return nil
	})
	if err != nil {
		return ExternalHolidayResult{}, err
	}
	return res, nil
}

func normalizeHolidayName(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// RecordHolidaySyncRun stores one run and prunes the oldest ones.
func RecordHolidaySyncRun(run models.HolidaySyncRun) error {
	run.ID = 0
	if err := DB.Create(&run).Error; err != nil {
		return err
	}
	var cutoff models.HolidaySyncRun
	if err := DB.Order("id DESC").Offset(maxHolidaySyncRuns).Limit(1).Find(&cutoff).Error; err != nil || cutoff.ID == 0 {
		return err
	}
	return DB.Where("id <= ?", cutoff.ID).Delete(&models.HolidaySyncRun{}).Error
}

// LatestHolidaySyncRuns returns the most recent run of each year, newest year first.
func LatestHolidaySyncRuns() ([]models.HolidaySyncRun, error) {
	var runs []models.HolidaySyncRun
	err := DB.Where("id IN (?)",
		DB.Model(&models.HolidaySyncRun{}).Select("MAX(id)").Group("year")).
		Order("year DESC").Find(&runs).Error
	return runs, err
}

// LastSuccessfulHolidaySync is when the data was last saved from the source
// (zero if never).
func LastSuccessfulHolidaySync() (time.Time, error) {
	var run models.HolidaySyncRun
	err := DB.Where("status = ?", models.HolidaySyncSuccess).Order("finished_at DESC").Limit(1).Find(&run).Error
	return run.FinishedAt, err
}

// ListExternalHolidays returns the imported holidays that fall in a calendar year.
func ListExternalHolidays(year int) ([]models.CalendarDate, error) {
	var out []models.CalendarDate
	err := DB.Where("source = ? AND date BETWEEN ? AND ?", models.DateSourceExternal,
		fmt.Sprintf("%d-01-01", year), fmt.Sprintf("%d-12-31", year)).
		Order("date ASC").Find(&out).Error
	return out, err
}

// RememberDeletedExternalHoliday records that staff removed an imported
// holiday so the sync does not re-create it. It is a no-op for other rows.
func RememberDeletedExternalHoliday(cd models.CalendarDate, userID uint) error {
	if cd.Source != models.DateSourceExternal || cd.ExternalKey == nil {
		return nil
	}
	return DB.Clauses(clause.OnConflict{DoNothing: true}).
		Create(&models.CalendarDateExclusion{ExternalKey: *cd.ExternalKey, DeletedByID: userID}).Error
}

// ListHolidaysInYear returns every global holiday (public or university) in
// the calendar year, whether imported by the sync or added by staff or from
// the academic calendar PDF. Admin calendar view.
func ListHolidaysInYear(year int) ([]models.CalendarDate, error) {
	var out []models.CalendarDate
	err := DB.Where("date BETWEEN ? AND ? AND scope IN ? AND date_type IN ?",
		fmt.Sprintf("%d-01-01", year), fmt.Sprintf("%d-12-31", year),
		[]models.CalendarDateScope{models.DateScopeGlobal, models.DateScopeSemester},
		[]models.CalendarDateType{models.DateTypePublicHoliday, models.DateTypeUniversityHoliday, models.DateTypeNoClass}).
		Order("date ASC, id ASC").Find(&out).Error
	return out, err
}
