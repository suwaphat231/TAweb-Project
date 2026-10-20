package database

import (
	"fmt"
	"slices"
	"testing"
)

// A term is imported once: terms that already have courses are left alone,
// so adding a new classlist term to an existing database only adds that term.
func TestRowsOfNewTerms(t *testing.T) {
	rows := []classlistRow{
		{AcademicYear: 2569, Semester: 1, SubjectCode: "517100"},
		{AcademicYear: 2568, Semester: 2, SubjectCode: "517122"},
		{AcademicYear: 2568, Semester: 2, SubjectCode: "517214"},
	}
	got := rowsOfNewTerms(rows, map[classlistTerm]bool{{2569, "1"}: true})
	if len(got) != 2 || got[0].SubjectCode != "517122" || got[1].SubjectCode != "517214" {
		t.Errorf("got %+v, want only the 2568/2 rows", got)
	}
	if got := rowsOfNewTerms(rows, nil); len(got) != 3 {
		t.Errorf("empty database: got %d rows, want all 3", len(got))
	}
}

func TestGroupClasslistByDay(t *testing.T) {
	row := func(section, schedule string, capacity, enrolled int) classlistRow {
		return classlistRow{AcademicYear: 2569, Semester: 1, SubjectCode: "520494", TitleTH: "วิชา\n(บ.คอมปี3)",
			Credits: "3 (2-2-5)", Schedule: schedule, SectionNo: section, Capacity: capacity, Enrolled: enrolled}
	}

	t.Run("groups meeting on the same day add up into one row", func(t *testing.T) {
		// 520494 sec 4: three curriculum rows, all on Monday at partly different times.
		got := groupClasslistByDay([]classlistRow{
			row("4", "Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1", 9999, 0),
			row("4", "Mo 07:40 - 09:20 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1", 9999, 5),
			row("4", "Mo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1", 9999, 0),
		})
		if len(got) != 1 {
			t.Fatalf("got %d rows, want 1: %+v", len(got), got)
		}
		d := got[0]
		if d.Enrolled != 5 || d.Capacity != unlimitedCapacity || d.Slot != 0 || d.Section != 4 {
			t.Errorf("row = %+v, want enrolled 5 (all groups), unlimited capacity, slot 0", d)
		}
		want := "Mo 07:40 - 09:20 1639 ว.1\nMo 12:10 - 13:50 1639 ว.1\nMo 16:40 - 18:25 1639 ว.1"
		if d.Schedule != want {
			t.Errorf("schedule = %q, want each time once in order %q", d.Schedule, want)
		}
		if d.Title != "วิชา" {
			t.Errorf("title = %q, want the group note dropped", d.Title)
		}
	})

	t.Run("groups on different days keep their own numbers", func(t *testing.T) {
		// 520341 sec 1: one group on Thursday, the other on Monday.
		got := groupClasslistByDay([]classlistRow{
			row("1", "Th 08:30 - 10:15 410A-410B\nTh 10:20 - 12:05 410A-410B", 104, 103),
			row("1", "Mo 13:00 - 14:45 1239 ว.1\nMo 14:50 - 16:35 1227/2 ว.1", 9999, 19),
		})
		if len(got) != 2 {
			t.Fatalf("got %d rows, want 2", len(got))
		}
		if got[0].Capacity != 104 || got[0].Enrolled != 103 || got[0].Slot != 0 ||
			got[1].Capacity != unlimitedCapacity || got[1].Enrolled != 19 || got[1].Slot != 1 {
			t.Errorf("rows = %+v", got)
		}
		if got[0].Title != "วิชา\n(บ.คอมปี3)" {
			t.Errorf("a single group keeps its note, got %q", got[0].Title)
		}
	})

	t.Run("one group meeting on two days is one row per day, each with the group's numbers", func(t *testing.T) {
		got := groupClasslistByDay([]classlistRow{row("1", "Tu 13:00 - 14:45 1227\nTh 13:00 - 14:45 1227", 100, 87)})
		if len(got) != 2 || got[0].Enrolled != 87 || got[1].Enrolled != 87 || got[0].Capacity != 100 || got[1].Slot != 1 {
			t.Errorf("rows = %+v", got)
		}
	})

	t.Run("limited capacities add up; sections stay apart", func(t *testing.T) {
		// 517121 sec 1: two curriculum groups in the same class.
		got := groupClasslistByDay([]classlistRow{
			row("1", "We 08:30 - 10:15 1227", 110, 98),
			row("1", "We 08:30 - 10:15 1227", 100, 0),
			row("2", "We 08:30 - 10:15 1227", 105, 103),
		})
		if len(got) != 2 || got[0].Capacity != 210 || got[0].Enrolled != 98 || got[1].Section != 2 || got[1].Slot != 0 {
			t.Errorf("rows = %+v", got)
		}
	})
}

func TestIsLectureRoomLine(t *testing.T) {
	for line, want := range map[string]bool{
		"We 08:30 - 10:15 ร.วท.2":            true,
		"We 10:20 - 12:05 4103 ว.4":          true,
		"We 16:40 - 20:15 5406 ว.4":          true,
		"We 10:20 - 12:05 ไววิทย์พุทธารี":    true,
		"Mo 10:20 - 12:05 1239 ว.1":          true,
		"Th 10:20 - 12:05 1238 ว.1":          true,
		"Mo 14:50 - 16:35 1240 ว.1":          true,
		"Tu 10:20 - 12:05 1241 ว.1":          true,
		"Mo 13:00 - 14:45 511":               true,
		"Th 13:00 - 14:45 1231 ว.1":          false,
		"Tu 08:30 - 10:15 com ว.3":           false,
		"Tu 14:50 - 16:35 1227/1,1227/2 ว.1": false,
		"Tu 16:40 - 18:25 1334 ว.1":          false,
		"Mo 08:30 - 10:15 410A-410B":         false,
		"Mo 12:10 - 13:50 1639 ว.1":          false,
	} {
		if got := isLectureRoomLine(line); got != want {
			t.Errorf("isLectureRoomLine(%q) = %v, want %v", line, got, want)
		}
	}
}

// Lab Boys only work lab periods: a course with lecture hours in its credits
// drops the periods held in lecture rooms.
func TestGroupClasslistByDay_DropsLecturePeriods(t *testing.T) {
	row := func(credits, schedule string) classlistRow {
		return classlistRow{AcademicYear: 2568, Semester: 2, SubjectCode: "517122", TitleTH: "วิชา",
			Credits: credits, Schedule: schedule, SectionNo: "1", Capacity: 108, Enrolled: 99}
	}
	// 517122 sec 1, 2568/2: the Wednesday period in ร.วท.2 is the lecture.
	got := groupClasslistByDay([]classlistRow{row("4 (2-4-6)",
		"Tu 14:50 - 16:35 1227/1,1227/2 ว.1\nTu 16:40 - 18:25 1334 ว.1\nWe 08:30 - 10:15 ร.วท.2\nFr 08:30 - 10:15 1227/1,1227/2 ว.1")})
	if len(got) != 2 || got[0].Slot != 0 || got[1].Slot != 1 ||
		got[0].Schedule != "Tu 14:50 - 16:35 1227/1,1227/2 ว.1\nTu 16:40 - 18:25 1334 ว.1" ||
		got[1].Schedule != "Fr 08:30 - 10:15 1227/1,1227/2 ว.1" {
		t.Errorf("rows = %+v, want Tuesday and Friday lab days only", got)
	}

	// No lecture hours: every period is lab, whatever the room.
	if got := groupClasslistByDay([]classlistRow{row("2 (0-4-2)", "We 08:30 - 10:15 ร.วท.2")}); len(got) != 1 {
		t.Errorf("lab-only course lost its period: %+v", got)
	}

	// A section whose only period is the lecture has no lab day to staff.
	if got := groupClasslistByDay([]classlistRow{row("3 (2-2-5)", "We 10:20 - 12:05 ร.วท.2")}); len(got) != 0 {
		t.Errorf("lecture-only section produced %+v", got)
	}
}

// Research projects, cooperative education and selected topics are never seeded.
func TestGroupClasslistByDaySkipsExcludedCourses(t *testing.T) {
	row := func(code, titleEN string) classlistRow {
		return classlistRow{AcademicYear: 2569, Semester: 1, SubjectCode: code, TitleEN: titleEN,
			Credits: "3 (0-6-3)", Schedule: "Mo 09:00 - 12:00 1639 ว.1", SectionNo: "1"}
	}
	got := groupClasslistByDay([]classlistRow{
		row("517491", "RESEARCH PROJECT I"),
		row("517492", "Research Project II"),
		row("517390", "PREPARATION OF RESEARCH PROJECT"),
		row("517497", "COOPERATIVE EDUCATION PROJECT SEMINAR"),
		row("517396", "PREPARATION FOR COOPERATIVE EDUCATION"),
		row("517489", "SELECTED TOPICS IN COMPUTER SCIENCE IX"),
		row("517100", "COMPUTER PROGRAMMING"),
	})
	if len(got) != 1 || got[0].SubjectCode != "517100" {
		t.Errorf("got %+v, want only 517100", got)
	}
}

// The period every section meets at together is the quiz; each section's
// own times are its lab.
func TestGroupClasslistByDayDropsQuizPeriod(t *testing.T) {
	row := func(code, section, schedule string) classlistRow {
		return classlistRow{AcademicYear: 2569, Semester: 1, SubjectCode: code,
			Credits: "4 (2-4-6)", Schedule: schedule, SectionNo: section}
	}
	schedules := func(days []classlistDay) []string {
		var out []string
		for _, d := range days {
			out = append(out, fmt.Sprintf("%s sec %d slot %d: %s", d.SubjectCode, d.Section, d.Slot, d.Schedule))
		}
		return out
	}

	t.Run("517121: Friday quiz is dropped as a whole day", func(t *testing.T) {
		got := schedules(groupClasslistByDay([]classlistRow{
			row("517121", "1", "Mo 10:20 - 12:05 ร.วท.2\nTu 13:00 - 16:35 1227/1,1227/2 ว.1\nFr 16:40 - 18:25 1227/1,1227/2 ว.1"),
			row("517121", "2", "Mo 10:20 - 12:05 ร.วท.2\nWe 13:00 - 16:35 1227/1,1227/2 ว.1\nFr 16:40 - 18:25 1334 ว.1"),
		}))
		want := []string{
			"517121 sec 1 slot 0: Tu 13:00 - 16:35 1227/1,1227/2 ว.1",
			"517121 sec 2 slot 0: We 13:00 - 16:35 1227/1,1227/2 ว.1",
		}
		if !slices.Equal(got, want) {
			t.Errorf("got %q, want %q", got, want)
		}
	})

	t.Run("517122: Tuesday quiz leaves the lab periods of both days", func(t *testing.T) {
		got := schedules(groupClasslistByDay([]classlistRow{
			row("517122", "1", "Tu 14:50 - 16:35 1227/1,1227/2 ว.1\nTu 16:40 - 18:25 1334 ว.1\nWe 08:30 - 10:15 ร.วท.2\nFr 08:30 - 10:15 1227/1,1227/2 ว.1"),
			row("517122", "2", "Tu 13:00 - 14:45 1227/1,1227/2 ว.1\nTu 16:40 - 18:25 1227/1,1227/2 ว.1\nWe 08:30 - 10:15 ร.วท.2\nWe 10:20 - 12:05 1227/1,1227/2 ว.1"),
		}))
		want := []string{
			"517122 sec 1 slot 0: Tu 14:50 - 16:35 1227/1,1227/2 ว.1",
			"517122 sec 1 slot 1: Fr 08:30 - 10:15 1227/1,1227/2 ว.1",
			"517122 sec 2 slot 0: Tu 13:00 - 14:45 1227/1,1227/2 ว.1",
			"517122 sec 2 slot 1: We 10:20 - 12:05 1227/1,1227/2 ว.1",
		}
		if !slices.Equal(got, want) {
			t.Errorf("got %q, want %q", got, want)
		}
	})

	t.Run("sections with the same lab time keep it", func(t *testing.T) {
		// Two rooms at one time is not a quiz when it is the sections' only period.
		got := groupClasslistByDay([]classlistRow{
			row("520494", "1", "Mo 13:00 - 16:35 1638 ว.1"),
			row("520494", "2", "Mo 13:00 - 16:35 1639 ว.1"),
		})
		if len(got) != 2 {
			t.Errorf("got %+v, want both sections kept", got)
		}
	})
}
