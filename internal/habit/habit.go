// Package habit tracks daily habits and the dates they were checked in, scoped
// per user. It mirrors the other modules' design — a data model, a storage
// interface with in-memory and PostgreSQL implementations, and HTTP handlers —
// so the whole app stays consistent.
package habit

import (
	"errors"
	"regexp"
	"sort"
	"strings"
)

// Frequency values describe how often a habit is meant to be done.
const (
	FreqDaily    = "daily"    // every day
	FreqWeekly   = "weekly"   // once a week (any day)
	FreqWeekdays = "weekdays" // on specific weekdays, e.g. every Wednesday
)

// Habit is a single tracked habit plus the dates it was checked in. Checkins are
// "YYYY-MM-DD" strings, matching the dates the frontend grid uses. Color is the
// accent shown in the UI (a hex string like "#dc2626"). Frequency (with Weekdays
// when it is "weekdays") describes the habit's schedule.
type Habit struct {
	ID        int      `json:"id"`
	Name      string   `json:"name"`
	Category  string   `json:"category"`
	Color     string   `json:"color"`
	Frequency string   `json:"frequency"`
	Weekdays  []int    `json:"weekdays"` // 0=Sun..6=Sat, used when Frequency=="weekdays"
	Checkins  []string `json:"checkins"`
}

// ErrNotFound is returned when a habit doesn't exist (or isn't the caller's).
var ErrNotFound = errors.New("habit not found")

// datePattern matches a "YYYY-MM-DD" calendar date. It is deliberately loose on
// day/month ranges; the DATE column rejects genuinely invalid dates.
var datePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// ValidDate reports whether s is a well-formed "YYYY-MM-DD" date string.
func ValidDate(s string) bool { return datePattern.MatchString(s) }

// Normalize tidies user input before validation and storage.
func (h *Habit) Normalize() {
	h.Name = strings.TrimSpace(h.Name)
	h.Category = strings.TrimSpace(h.Category)
	h.Color = strings.TrimSpace(h.Color)
	h.Frequency = strings.TrimSpace(h.Frequency)
	if h.Frequency == "" {
		h.Frequency = FreqDaily
	}
	if h.Frequency == FreqWeekdays {
		h.Weekdays = normalizeWeekdays(h.Weekdays)
	} else {
		// Weekdays are only meaningful for the "weekdays" schedule.
		h.Weekdays = nil
	}
}

// normalizeWeekdays drops out-of-range values, removes duplicates, and sorts the
// remaining weekdays so storage is consistent.
func normalizeWeekdays(days []int) []int {
	seen := make(map[int]bool, len(days))
	out := make([]int, 0, len(days))
	for _, d := range days {
		if d >= 0 && d <= 6 && !seen[d] {
			seen[d] = true
			out = append(out, d)
		}
	}
	sort.Ints(out)
	return out
}

// Validate reports whether the habit is well-formed before storing it.
func (h Habit) Validate() error {
	if strings.TrimSpace(h.Name) == "" {
		return errors.New("name is required")
	}
	switch h.Frequency {
	case FreqDaily, FreqWeekly:
	case FreqWeekdays:
		if len(h.Weekdays) == 0 {
			return errors.New("select at least one weekday")
		}
		for _, d := range h.Weekdays {
			if d < 0 || d > 6 {
				return errors.New("weekday must be between 0 and 6")
			}
		}
	default:
		return errors.New("invalid frequency")
	}
	return nil
}
