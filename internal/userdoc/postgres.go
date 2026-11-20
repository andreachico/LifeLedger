package userdoc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/andreachico/go-expense-tracker/internal/auth"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresStore persists documents in the user_documents table. It implements
// the same Store interface as MemoryStore, so the handler works with either.
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

// Get loads the caller's document for a key, returning nil when none exists.
func (s *PostgresStore) Get(ctx context.Context, key string) (json.RawMessage, error) {
	var data json.RawMessage
	err := s.pool.QueryRow(ctx,
		`SELECT data FROM user_documents WHERE user_id = $1 AND doc_key = $2`,
		auth.UserID(ctx), key).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("querying user document: %w", err)
	}
	return data, nil
}

// Save inserts or replaces the caller's document for a key (an upsert on the
// (user_id, doc_key) primary key).
func (s *PostgresStore) Save(ctx context.Context, key string, data json.RawMessage) error {
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO user_documents (user_id, doc_key, data) VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, doc_key) DO UPDATE SET data = EXCLUDED.data`,
		auth.UserID(ctx), key, data); err != nil {
		return fmt.Errorf("saving user document: %w", err)
	}
	return nil
}
