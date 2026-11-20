package savings

import (
	"context"
	"sort"
	"strings"
	"sync"

	"github.com/andreachico/go-expense-tracker/internal/auth"
)

// Store describes the storage operations for savings records. The handlers
// depend on this interface so the in-memory and PostgreSQL implementations
// interchange.
type Store interface {
	List(ctx context.Context) ([]Saving, error)
	Create(ctx context.Context, s Saving) (Saving, error)
	Delete(ctx context.Context, id int) error

	// Fund catalog: the user-defined fund names shown in the savings dropdown.
	// These persist independently of withdrawals, so a fund can exist before it
	// has any activity.
	ListFunds(ctx context.Context) ([]string, error)
	CreateFund(ctx context.Context, name string) error
	RenameFund(ctx context.Context, oldName, newName string) error
	DeleteFund(ctx context.Context, name string) error
}

// MemoryStore keeps savings in a map; data is lost when the program stops. A
// mutex guards the maps because the server handles requests concurrently.
type MemoryStore struct {
	mu     sync.Mutex
	items  map[int]Saving
	owner  map[int]int      // savings ID -> owning user ID
	funds  map[int][]string // user ID -> ordered fund names
	nextID int
}

// NewMemoryStore returns a ready-to-use in-memory savings store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		items:  make(map[int]Saving),
		owner:  make(map[int]int),
		funds:  make(map[int][]string),
		nextID: 1,
	}
}

// List returns all of the caller's savings withdrawals, newest month first.
func (s *MemoryStore) List(ctx context.Context) ([]Saving, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	list := make([]Saving, 0)
	for id, item := range s.items {
		if s.owner[id] == userID {
			list = append(list, item)
		}
	}
	sort.Slice(list, func(a, b int) bool {
		if list[a].Month != list[b].Month {
			return list[a].Month > list[b].Month
		}
		return list[a].ID > list[b].ID
	})
	return list, nil
}

// Create assigns the next ID, records the owner, and returns the stored copy.
func (s *MemoryStore) Create(ctx context.Context, item Saving) (Saving, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item.ID = s.nextID
	s.nextID++
	s.items[item.ID] = item
	s.owner[item.ID] = auth.UserID(ctx)
	return item, nil
}

// Delete removes one of the caller's savings rows by ID.
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

// ListFunds returns the caller's saved fund names in insertion order.
func (s *MemoryStore) ListFunds(ctx context.Context) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	src := s.funds[auth.UserID(ctx)]
	list := make([]string, len(src))
	copy(list, src)
	return list, nil
}

// CreateFund adds a fund name for the caller, ignoring case-insensitive dupes.
func (s *MemoryStore) CreateFund(ctx context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	for _, f := range s.funds[userID] {
		if strings.EqualFold(f, name) {
			return nil
		}
	}
	s.funds[userID] = append(s.funds[userID], name)
	return nil
}

// RenameFund renames one of the caller's funds; a missing name is a no-op.
func (s *MemoryStore) RenameFund(ctx context.Context, oldName, newName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	for i, f := range s.funds[userID] {
		if strings.EqualFold(f, oldName) {
			s.funds[userID][i] = newName
			return nil
		}
	}
	return nil
}

// DeleteFund removes one of the caller's funds; a missing name is a no-op.
func (s *MemoryStore) DeleteFund(ctx context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	list := s.funds[userID]
	for i, f := range list {
		if strings.EqualFold(f, name) {
			s.funds[userID] = append(list[:i], list[i+1:]...)
			return nil
		}
	}
	return nil
}
