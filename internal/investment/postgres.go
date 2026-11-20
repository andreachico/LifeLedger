package investment

import (
	"context"
	"fmt"

	"github.com/andreachico/go-expense-tracker/internal/auth"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PostgresStore persists sales in the "investment_sales" table. It implements
// the same Store interface as MemoryStore, so the handlers work with either.
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

// List returns all of the caller's sales, newest month first.
func (s *PostgresStore) List(ctx context.Context) ([]Sale, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, amount, month FROM investment_sales WHERE user_id = $1 ORDER BY month DESC, id DESC`,
		auth.UserID(ctx))
	if err != nil {
		return nil, fmt.Errorf("querying investment sales: %w", err)
	}
	defer rows.Close()

	list := make([]Sale, 0)
	for rows.Next() {
		var item Sale
		if err := rows.Scan(&item.ID, &item.Name, &item.Amount, &item.Month); err != nil {
			return nil, fmt.Errorf("scanning investment sale: %w", err)
		}
		list = append(list, item)
	}
	return list, rows.Err()
}

// Create inserts a new row owned by the caller and returns it with its new ID.
func (s *PostgresStore) Create(ctx context.Context, item Sale) (Sale, error) {
	err := s.pool.QueryRow(ctx,
		`INSERT INTO investment_sales (name, amount, month, user_id)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id`,
		item.Name, item.Amount, item.Month, auth.UserID(ctx),
	).Scan(&item.ID)
	if err != nil {
		return Sale{}, fmt.Errorf("inserting investment sale: %w", err)
	}
	return item, nil
}

// Delete removes one of the caller's rows by ID.
func (s *PostgresStore) Delete(ctx context.Context, id int) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM investment_sales WHERE id = $1 AND user_id = $2`, id, auth.UserID(ctx))
	if err != nil {
		return fmt.Errorf("deleting investment sale: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListHoldings returns the caller's saved holding names in insertion order.
func (s *PostgresStore) ListHoldings(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT name FROM investment_holdings WHERE user_id = $1 ORDER BY id`,
		auth.UserID(ctx))
	if err != nil {
		return nil, fmt.Errorf("querying investment holdings: %w", err)
	}
	defer rows.Close()

	list := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scanning investment holding: %w", err)
		}
		list = append(list, name)
	}
	return list, rows.Err()
}

// CreateHolding adds a holding name for the caller, ignoring case-insensitive dupes.
func (s *PostgresStore) CreateHolding(ctx context.Context, name string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO investment_holdings (user_id, name) VALUES ($1, $2)
		 ON CONFLICT (user_id, lower(name)) DO NOTHING`,
		auth.UserID(ctx), name)
	if err != nil {
		return fmt.Errorf("inserting investment holding: %w", err)
	}
	return nil
}

// RenameHolding renames one of the caller's holdings (case-insensitive match).
func (s *PostgresStore) RenameHolding(ctx context.Context, oldName, newName string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE investment_holdings SET name = $1 WHERE user_id = $2 AND lower(name) = lower($3)`,
		newName, auth.UserID(ctx), oldName)
	if err != nil {
		return fmt.Errorf("renaming investment holding: %w", err)
	}
	return nil
}

// DeleteHolding removes one of the caller's holdings (case-insensitive match).
func (s *PostgresStore) DeleteHolding(ctx context.Context, name string) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM investment_holdings WHERE user_id = $1 AND lower(name) = lower($2)`,
		auth.UserID(ctx), name)
	if err != nil {
		return fmt.Errorf("deleting investment holding: %w", err)
	}
	return nil
}
