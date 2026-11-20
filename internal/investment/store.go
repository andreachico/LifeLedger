package investment

import (
	"context"
	"sort"
	"strings"
	"sync"

	"github.com/andreachico/go-expense-tracker/internal/auth"
)

// Store describes the storage operations for investment sales. The handlers
// depend on this interface so the in-memory and PostgreSQL implementations
// interchange.
type Store interface {
	List(ctx context.Context) ([]Sale, error)
	Create(ctx context.Context, s Sale) (Sale, error)
	Delete(ctx context.Context, id int) error

	// Holding catalog: the user-defined holding names shown in the investments
	// dropdown. These persist independently of sales, so a holding can exist
	// before it has any activity.
	ListHoldings(ctx context.Context) ([]string, error)
	CreateHolding(ctx context.Context, name string) error
	RenameHolding(ctx context.Context, oldName, newName string) error
	DeleteHolding(ctx context.Context, name string) error
}

// MemoryStore keeps sales in a map; data is lost when the program stops. A mutex
// guards the maps because the server handles requests concurrently.
type MemoryStore struct {
	mu       sync.Mutex
	items    map[int]Sale
	owner    map[int]int      // sale ID -> owning user ID
	holdings map[int][]string // user ID -> ordered holding names
	nextID   int
}

// NewMemoryStore returns a ready-to-use in-memory sales store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		items:    make(map[int]Sale),
		owner:    make(map[int]int),
		holdings: make(map[int][]string),
		nextID:   1,
	}
}

// List returns all of the caller's sales, newest month first.
func (s *MemoryStore) List(ctx context.Context) ([]Sale, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	list := make([]Sale, 0)
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
func (s *MemoryStore) Create(ctx context.Context, item Sale) (Sale, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	item.ID = s.nextID
	s.nextID++
	s.items[item.ID] = item
	s.owner[item.ID] = auth.UserID(ctx)
	return item, nil
}

// Delete removes one of the caller's sale rows by ID.
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

// ListHoldings returns the caller's saved holding names in insertion order.
func (s *MemoryStore) ListHoldings(ctx context.Context) ([]string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	src := s.holdings[auth.UserID(ctx)]
	list := make([]string, len(src))
	copy(list, src)
	return list, nil
}

// CreateHolding adds a holding name for the caller, ignoring case-insensitive dupes.
func (s *MemoryStore) CreateHolding(ctx context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	for _, h := range s.holdings[userID] {
		if strings.EqualFold(h, name) {
			return nil
		}
	}
	s.holdings[userID] = append(s.holdings[userID], name)
	return nil
}

// RenameHolding renames one of the caller's holdings; a missing name is a no-op.
func (s *MemoryStore) RenameHolding(ctx context.Context, oldName, newName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	for i, h := range s.holdings[userID] {
		if strings.EqualFold(h, oldName) {
			s.holdings[userID][i] = newName
			return nil
		}
	}
	return nil
}

// DeleteHolding removes one of the caller's holdings; a missing name is a no-op.
func (s *MemoryStore) DeleteHolding(ctx context.Context, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	userID := auth.UserID(ctx)
	list := s.holdings[userID]
	for i, h := range list {
		if strings.EqualFold(h, name) {
			s.holdings[userID] = append(list[:i], list[i+1:]...)
			return nil
		}
	}
	return nil
}
