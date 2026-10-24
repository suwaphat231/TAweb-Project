package database

import "fmt"

// PayableMinutes returns the paid duration of a session in minutes. Staff pay
// whole hours only: any partial hour is rounded up, counted from the start
// time (e.g. 13:00–16:35 is paid as 13:00–17:00 = 240 minutes). The displayed
// times are left untouched; only hours/pay use this. Invalid or non-positive
// ranges return 0.
func PayableMinutes(startTime, endTime string) int {
	var sh, sm, eh, em int
	if _, err := fmt.Sscanf(startTime, "%d:%d", &sh, &sm); err != nil {
		return 0
	}
	if _, err := fmt.Sscanf(endTime, "%d:%d", &eh, &em); err != nil {
		return 0
	}
	mins := (eh*60 + em) - (sh*60 + sm)
	if mins <= 0 {
		return 0
	}
	return (mins + 59) / 60 * 60
}

// PayableHours is PayableMinutes expressed in hours (always a whole number).
func PayableHours(startTime, endTime string) float64 {
	return float64(PayableMinutes(startTime, endTime)) / 60.0
}
