package habit

import (
	"context"
	"sort"
	"sync"

	"github.com/andreachico/go-expense-tracker/internal/auth"
)

// Store describes the storage operations for habits. The handlers depend on this
// interface so the in-memory and PostgreSQL implementations interchange.
type Store interface {
	List(ctx context.Context) ([]Habit, error)
	Create(ctx context.Context, h Habit) (Habit, error)
	Update(ctx context.Context, id int, h Habit) (Habit, error)
	Delete(ctx context.Context, id int) error
	AddCheckin(ctx context.Context, id int, date string) error
	RemoveCheckin(ctx context.Context, id int, date string) error
}

// MemoryStore keeps habits in maps; data is lost when the program stops. A mutex
// guards the maps because the server handles requests concurrently.
type MemoryStore struct {
	mu     sync.Mutex
	items  map[int]Habit
	owner  map[int]int // habit ID -> owning user ID
	nextID int
}

// NewMemoryStore returns a ready-to-use in-memory habit store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		items:  make(map[int]Habit),
		owner:  make(map[int]int),
		nextID: 1,
	}
}

// List returns all of the caller's habits, each with its check-in dates, by ID.
func (s *MemoryStore) List(ctx context.Context) ([]Habit, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	list := make([]Habit, 0)
	for id, item := range s.items {
		if s.owner[id] == userID {
			list = append(list, cloneHabit(item))
		}
	}
	sort.Slice(list, func(a, b int) bool { return list[a].ID < list[b].ID })
	return list, nil
}

// Create assigns the next ID, records the owner, and returns the stored copy.
func (s *MemoryStore) Create(ctx context.Context, item Habit) (Habit, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item.ID = s.nextID
	s.nextID++
	if item.Checkins == nil {
		item.Checkins = []string{}
	}
	s.items[item.ID] = cloneHabit(item)
	s.owner[item.ID] = auth.UserID(ctx)
	return cloneHabit(item), nil
}

// Update overwrites the editable fields of one of the caller's habits, leaving
// its check-ins untouched.
func (s *MemoryStore) Update(ctx context.Context, id int, upd Habit) (Habit, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, ok := s.items[id]
	if !ok || s.owner[id] != auth.UserID(ctx) {
		return Habit{}, ErrNotFound
	}
	existing.Name = upd.Name
	existing.Category = upd.Category
	existing.Color = upd.Color
	existing.Frequency = upd.Frequency
	existing.Weekdays = append([]int{}, upd.Weekdays...)
	s.items[id] = existing
	return cloneHabit(existing), nil
}

// Delete removes one of the caller's habits (and its check-ins) by ID.
func (s *MemoryStore) Delete(ctx context.Context, id int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.items[id]; !ok || s.owner[id] != auth.UserID(ctx) {
		return ErrNotFound
	}
	delete(s.items, id)
	delete(s.owner, id)
	return nil
}

// AddCheckin records a check-in date on one of the caller's habits. It is
// idempotent: adding a date that's already present is a no-op.
func (s *MemoryStore) AddCheckin(ctx context.Context, id int, date string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, ok := s.items[id]
	if !ok || s.owner[id] != auth.UserID(ctx) {
		return ErrNotFound
	}
	for _, d := range item.Checkins {
		if d == date {
			return nil
		}
	}
	item.Checkins = append(append([]string(nil), item.Checkins...), date)
	sort.Strings(item.Checkins)
	s.items[id] = item
	return nil
}

// RemoveCheckin removes a check-in date from one of the caller's habits.
func (s *MemoryStore) RemoveCheckin(ctx context.Context, id int, date string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	item, ok := s.items[id]
	if !ok || s.owner[id] != auth.UserID(ctx) {
		return ErrNotFound
	}
	filtered := make([]string, 0, len(item.Checkins))
	for _, d := range item.Checkins {
		if d != date {
			filtered = append(filtered, d)
		}
	}
	item.Checkins = filtered
	s.items[id] = item
	return nil
}

// cloneHabit returns a deep copy so callers can't mutate the stored slice.
func cloneHabit(h Habit) Habit {
	cp := h
	cp.Checkins = append([]string{}, h.Checkins...)
	cp.Weekdays = append([]int{}, h.Weekdays...)
	return cp
}
