package budget

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/andreachico/go-expense-tracker/internal/auth"
)

// Store persists one budget plan per month (keyed "YYYY-MM"). Like
// expense.Store, the HTTP handlers depend on this interface, so the in-memory
// and PostgreSQL implementations are interchangeable.
type Store interface {
	Get(ctx context.Context, month string) (Plan, error)
	Save(ctx context.Context, month string, plan Plan) error
	Breakdown(ctx context.Context) (map[string]map[string]float64, error)

	// DeleteEntry removes an entry key (e.g. "savings:travel") from every one of
	// the caller's monthly plans, so a fund/holding disappears from all budget
	// data at once.
	DeleteEntry(ctx context.Context, entryKey string) error

	// Type/Category dropdown options, personalized per user and persisted
	// independently of month. New accounts start with none.
	GetTypeOptions(ctx context.Context) (TypeOptions, error)
	SaveTypeOptions(ctx context.Context, opts TypeOptions) error
}

// MemoryStore keeps the plans in memory; data is lost when the program stops.
// Plans are keyed by the owning user and month so accounts stay separate. A
// mutex guards the map because the server serves requests concurrently.
type MemoryStore struct {
	mu       sync.Mutex
	plans    map[string]Plan     // keyed by "userID:YYYY-MM"
	typeOpts map[int]TypeOptions // keyed by user ID
}

// NewMemoryStore returns an empty, ready-to-use in-memory store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		plans:    map[string]Plan{},
		typeOpts: map[int]TypeOptions{},
	}
}

// key scopes a month to the user on the context so one account never reads
// another's budget.
func key(ctx context.Context, month string) string {
	return fmt.Sprintf("%d:%s", auth.UserID(ctx), month)
}

// Get returns a copy of the given month's plan so callers can't mutate the
// internal map without going through Save.
func (s *MemoryStore) Get(ctx context.Context, month string) (Plan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	src := s.plans[key(ctx, month)]
	out := make(Plan, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out, nil
}

// Save replaces the given month's plan with a copy of the provided map.
func (s *MemoryStore) Save(ctx context.Context, month string, plan Plan) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cp := make(Plan, len(plan))
	for k, v := range plan {
		cp[k] = v
	}
	s.plans[key(ctx, month)] = cp
	return nil
}

// Breakdown returns each entry's amount per month across all of the caller's
// saved months: entryKey -> (month -> amount). It lets views show a budget line
// over time (and sum it) without loading each month separately.
func (s *MemoryStore) Breakdown(ctx context.Context) (map[string]map[string]float64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	prefix := fmt.Sprintf("%d:", auth.UserID(ctx))
	out := make(map[string]map[string]float64)
	for k, plan := range s.plans {
		if !strings.HasPrefix(k, prefix) {
			continue
		}
		month := strings.TrimPrefix(k, prefix)
		for entryKey, entry := range plan {
			if out[entryKey] == nil {
				out[entryKey] = make(map[string]float64)
			}
			out[entryKey][month] += entry.Amount
		}
	}
	return out, nil
}

// DeleteEntry removes an entry key from every one of the caller's monthly plans.
func (s *MemoryStore) DeleteEntry(ctx context.Context, entryKey string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	prefix := fmt.Sprintf("%d:", auth.UserID(ctx))
	for k, plan := range s.plans {
		if !strings.HasPrefix(k, prefix) {
			continue
		}
		delete(plan, entryKey)
	}
	return nil
}

// GetTypeOptions returns a copy of the caller's saved Type/Category options.
func (s *MemoryStore) GetTypeOptions(ctx context.Context) (TypeOptions, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	src := s.typeOpts[auth.UserID(ctx)]
	out := make(TypeOptions, len(src))
	for section, opts := range src {
		cp := make([]TypeOption, len(opts))
		copy(cp, opts)
		out[section] = cp
	}
	return out, nil
}

// SaveTypeOptions replaces the caller's Type/Category options with a copy of the
// provided map.
func (s *MemoryStore) SaveTypeOptions(ctx context.Context, opts TypeOptions) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cp := make(TypeOptions, len(opts))
	for section, list := range opts {
		inner := make([]TypeOption, len(list))
		copy(inner, list)
		cp[section] = inner
	}
	s.typeOpts[auth.UserID(ctx)] = cp
	return nil
}
