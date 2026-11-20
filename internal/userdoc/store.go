// Package userdoc stores arbitrary JSON documents per user, keyed by a short
// document key (e.g. "travel-destinations").
//
// It backs views that used to persist only to the browser's localStorage, so
// their data now follows the account across devices. Each document is an opaque
// JSON blob the frontend owns; the backend only stores and returns it. A missing
// document reads back as empty (the handler returns JSON null).
package userdoc

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/andreachico/go-expense-tracker/internal/auth"
)

// Store persists one JSON document per (user, key). The HTTP handler depends on
// this interface, so the in-memory and PostgreSQL implementations are
// interchangeable (mirroring the other packages).
type Store interface {
	// Get returns the stored document for the caller and key, or nil when none
	// has been saved yet.
	Get(ctx context.Context, key string) (json.RawMessage, error)
	// Save replaces the caller's document for the given key.
	Save(ctx context.Context, key string, data json.RawMessage) error
}

// MemoryStore keeps documents in memory; data is lost when the program stops.
// Documents are keyed by the owning user and document key so accounts stay
// separate. A mutex guards the map because the server serves requests
// concurrently.
type MemoryStore struct {
	mu   sync.Mutex
	docs map[string]json.RawMessage // keyed by "userID:key"
}

// NewMemoryStore returns an empty, ready-to-use in-memory store.
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{docs: map[string]json.RawMessage{}}
}

// memKey scopes a document key to the user on the context so one account never
// reads another's document.
func memKey(ctx context.Context, key string) string {
	return fmt.Sprintf("%d:%s", auth.UserID(ctx), key)
}

// Get returns a copy of the stored document so callers can't mutate the internal
// map without going through Save.
func (s *MemoryStore) Get(ctx context.Context, key string) (json.RawMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	src := s.docs[memKey(ctx, key)]
	if src == nil {
		return nil, nil
	}
	out := make(json.RawMessage, len(src))
	copy(out, src)
	return out, nil
}

// Save stores a copy of the document for the caller and key.
func (s *MemoryStore) Save(ctx context.Context, key string, data json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cp := make(json.RawMessage, len(data))
	copy(cp, data)
	s.docs[memKey(ctx, key)] = cp
	return nil
}
