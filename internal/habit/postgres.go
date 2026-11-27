package habit

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/andreachico/go-expense-tracker/internal/auth"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresStore persists habits in the "habits" table and their check-ins in
// "habit_checkins". It implements the same Store interface as MemoryStore, so
// the handlers work with either.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// NewPostgresStore opens a connection pool and verifies it with a Ping.
func NewPostgresStore(ctx context.Context, connString string) (*PostgresStore, error) {
	pool, err := pgxpool.New(ctx, connString)
	if err != nil {
		return nil, fmt.Errorf("connecting to postgres: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pinging postgres: %w", err)
	}
	return &PostgresStore{pool: pool}, nil
}

// Close releases every connection in the pool. Call it on shutdown.
func (s *PostgresStore) Close() { s.pool.Close() }

// List returns all of the caller's habits, each with its check-in dates. It uses
// two queries (habits, then all their check-ins) and stitches them together in
// Go to avoid a row-per-check-in join result.
func (s *PostgresStore) List(ctx context.Context) ([]Habit, error) {
	userID := auth.UserID(ctx)

	rows, err := s.pool.Query(ctx,
		`SELECT id, name, category, color, frequency, weekdays, start_month FROM habits WHERE user_id = $1 ORDER BY id`,
		userID)
	if err != nil {
		return nil, fmt.Errorf("querying habits: %w", err)
	}
	defer rows.Close()

	list := make([]Habit, 0)
	for rows.Next() {
		var (
			h   Habit
			wds string
		)
		if err := rows.Scan(&h.ID, &h.Name, &h.Category, &h.Color, &h.Frequency, &wds, &h.StartMonth); err != nil {
			return nil, fmt.Errorf("scanning habit: %w", err)
		}
		h.Weekdays = csvToWeekdays(wds)
		h.Checkins = []string{}
		h.HiddenMonths = []string{}
		list = append(list, h)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Index by ID so we can attach check-ins in the second pass.
	byID := make(map[int]*Habit, len(list))
	for i := range list {
		byID[list[i].ID] = &list[i]
	}

	crows, err := s.pool.Query(ctx,
		`SELECT c.habit_id, c.date
		 FROM habit_checkins c JOIN habits h ON h.id = c.habit_id
		 WHERE h.user_id = $1
		 ORDER BY c.date`,
		userID)
	if err != nil {
		return nil, fmt.Errorf("querying habit check-ins: %w", err)
	}
	defer crows.Close()
	for crows.Next() {
		var (
			habitID int
			d       time.Time
		)
		if err := crows.Scan(&habitID, &d); err != nil {
			return nil, fmt.Errorf("scanning check-in: %w", err)
		}
		if h := byID[habitID]; h != nil {
			h.Checkins = append(h.Checkins, d.Format("2006-01-02"))
		}
	}
	if err := crows.Err(); err != nil {
		return nil, err
	}

	// Attach the per-habit hidden months (months the habit was removed from).
	mrows, err := s.pool.Query(ctx,
		`SELECT m.habit_id, m.month
		 FROM habit_hidden_months m JOIN habits h ON h.id = m.habit_id
		 WHERE h.user_id = $1
		 ORDER BY m.month`,
		userID)
	if err != nil {
		return nil, fmt.Errorf("querying habit hidden months: %w", err)
	}
	defer mrows.Close()
	for mrows.Next() {
		var (
			habitID int
			month   string
		)
		if err := mrows.Scan(&habitID, &month); err != nil {
			return nil, fmt.Errorf("scanning hidden month: %w", err)
		}
		if h := byID[habitID]; h != nil {
			h.HiddenMonths = append(h.HiddenMonths, month)
		}
	}
	return list, mrows.Err()
}

// Create inserts a new habit owned by the caller and returns it with its new ID.
func (s *PostgresStore) Create(ctx context.Context, h Habit) (Habit, error) {
	err := s.pool.QueryRow(ctx,
		`INSERT INTO habits (name, category, color, frequency, weekdays, start_month, user_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id`,
		h.Name, h.Category, h.Color, h.Frequency, weekdaysToCSV(h.Weekdays), h.StartMonth, auth.UserID(ctx),
	).Scan(&h.ID)
	if err != nil {
		return Habit{}, fmt.Errorf("inserting habit: %w", err)
	}
	h.Checkins = []string{}
	h.HiddenMonths = []string{}
	if h.Weekdays == nil {
		h.Weekdays = []int{}
	}
	return h, nil
}

// Update overwrites the editable fields of one of the caller's habits.
func (s *PostgresStore) Update(ctx context.Context, id int, upd Habit) (Habit, error) {
	tag, err := s.pool.Exec(ctx,
		`UPDATE habits SET name = $1, category = $2, color = $3, frequency = $4, weekdays = $5
		 WHERE id = $6 AND user_id = $7`,
		upd.Name, upd.Category, upd.Color, upd.Frequency, weekdaysToCSV(upd.Weekdays), id, auth.UserID(ctx))
	if err != nil {
		return Habit{}, fmt.Errorf("updating habit: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return Habit{}, ErrNotFound
	}
	upd.ID = id
	return upd, nil
}

// Delete removes one of the caller's habits; the check-ins go with it via the
// ON DELETE CASCADE foreign key.
func (s *PostgresStore) Delete(ctx context.Context, id int) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM habits WHERE id = $1 AND user_id = $2`, id, auth.UserID(ctx))
	if err != nil {
		return fmt.Errorf("deleting habit: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// HideMonth records a "YYYY-MM" month as removed for one of the caller's habits.
// ON CONFLICT DO NOTHING makes it idempotent.
func (s *PostgresStore) HideMonth(ctx context.Context, id int, month string) error {
	if err := s.ensureOwner(ctx, id); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO habit_hidden_months (habit_id, month) VALUES ($1, $2)
		 ON CONFLICT (habit_id, month) DO NOTHING`,
		id, month)
	if err != nil {
		return fmt.Errorf("hiding habit month: %w", err)
	}
	return nil
}

// AddCheckin records a check-in date. ON CONFLICT DO NOTHING makes it idempotent.
func (s *PostgresStore) AddCheckin(ctx context.Context, id int, date string) error {
	if err := s.ensureOwner(ctx, id); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO habit_checkins (habit_id, date) VALUES ($1, $2)
		 ON CONFLICT (habit_id, date) DO NOTHING`,
		id, date)
	if err != nil {
		return fmt.Errorf("adding check-in: %w", err)
	}
	return nil
}

// RemoveCheckin removes a check-in date from one of the caller's habits.
func (s *PostgresStore) RemoveCheckin(ctx context.Context, id int, date string) error {
	if err := s.ensureOwner(ctx, id); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx,
		`DELETE FROM habit_checkins WHERE habit_id = $1 AND date = $2`, id, date)
	if err != nil {
		return fmt.Errorf("removing check-in: %w", err)
	}
	return nil
}

// ensureOwner returns ErrNotFound unless the habit exists and belongs to the
// caller, so check-in writes can't touch another user's habit.
func (s *PostgresStore) ensureOwner(ctx context.Context, id int) error {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM habits WHERE id = $1 AND user_id = $2)`,
		id, auth.UserID(ctx)).Scan(&exists)
	if err != nil {
		return fmt.Errorf("checking habit owner: %w", err)
	}
	if !exists {
		return ErrNotFound
	}
	return nil
}

// weekdaysToCSV serializes weekday numbers to a comma-separated string for the
// single TEXT column (e.g. []int{1,3,5} -> "1,3,5").
func weekdaysToCSV(days []int) string {
	if len(days) == 0 {
		return ""
	}
	parts := make([]string, len(days))
	for i, d := range days {
		parts[i] = strconv.Itoa(d)
	}
	return strings.Join(parts, ",")
}

// csvToWeekdays parses the stored comma-separated weekdays back into a slice,
// always returning a non-nil slice so the JSON output is an array, never null.
func csvToWeekdays(s string) []int {
	s = strings.TrimSpace(s)
	if s == "" {
		return []int{}
	}
	parts := strings.Split(s, ",")
	days := make([]int, 0, len(parts))
	for _, p := range parts {
		if n, err := strconv.Atoi(strings.TrimSpace(p)); err == nil {
			days = append(days, n)
		}
	}
	return days
}
