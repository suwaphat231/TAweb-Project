package teacher

import (
	"reflect"
	"testing"
)

func TestSplitSchedule(t *testing.T) {
	cases := map[string][]string{
		"Mo 10:20 - 12:05 ร.วท.2 Tu 13:00 - 16:35 1227/1,1227/2 ว.1 Fr 16:40 - 18:25 1227/1,1227/2 ว.1": {
			"Mo 10:20 - 12:05 ร.วท.2",
			"Tu 13:00 - 16:35 1227/1,1227/2 ว.1",
			"Fr 16:40 - 18:25 1227/1,1227/2 ว.1",
		},
		"We 08:30 - 10:15 1227/1,1227/2 ว.1\nWe 10:20 - 12:05 1227/1,1227/2 ว.1": {
			"We 08:30 - 10:15 1227/1,1227/2 ว.1",
			"We 10:20 - 12:05 1227/1,1227/2 ว.1",
		},
		"ไม่ระบุ": {"ไม่ระบุ"},
		"":        nil,
	}
	for in, want := range cases {
		if got := splitSchedule(in); !reflect.DeepEqual(got, want) {
			t.Errorf("splitSchedule(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSplitMeeting(t *testing.T) {
	key, room := splitMeeting("Fr 16:40 - 18:25 1334 ว.1")
	if key != "Fr 16:40 - 18:25" || room != "1334 ว.1" {
		t.Errorf("got %q / %q", key, room)
	}
	key, room = splitMeeting("Fr 16:40-18:25")
	if key != "Fr 16:40 - 18:25" || room != "" {
		t.Errorf("got %q / %q", key, room)
	}
}
