-- This file runs automatically the first time the Postgres container starts
-- (it is mounted into /docker-entrypoint-initdb.d). It creates the tables the
-- app needs.

-- User accounts. Passwords are stored only as bcrypt hashes, never in plaintext.
-- A unique index on the lowercased username makes logins case-insensitive and
-- prevents duplicate accounts that differ only in case.
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL,
    email         TEXT NOT NULL DEFAULT '',
    first_name    TEXT NOT NULL DEFAULT '',
    last_name     TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email)) WHERE email <> '';

CREATE TABLE IF NOT EXISTS expenses (
    id          SERIAL PRIMARY KEY,                 -- auto-incrementing integer ID
    user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    amount      DOUBLE PRECISION NOT NULL CHECK (amount > 0),
    category    TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    date        DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS expenses_user_id_idx ON expenses (user_id);

-- NOTE: real money apps should store amounts as integer cents or NUMERIC to
-- avoid floating-point rounding. We use DOUBLE PRECISION here because the Go
-- model uses float64, keeping this learning project simple.

-- Income: money received in a given month (salary, side-jobs, etc.). Each row is
-- one source scoped to a user and a "YYYY-MM" month.
CREATE TABLE IF NOT EXISTS income (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    source  TEXT NOT NULL,
    amount  DOUBLE PRECISION NOT NULL CHECK (amount > 0),
    month   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS income_user_month_idx ON income (user_id, month);

-- Savings: each row records a withdrawal from a fund in a given "YYYY-MM" month.
-- Deposits are planned in the budget sheet (budget_amounts, "savings:*" keys); a
-- withdrawal is subtracted from a fund's running total on the savings page.
CREATE TABLE IF NOT EXISTS savings (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name    TEXT NOT NULL,
    amount  DOUBLE PRECISION NOT NULL CHECK (amount > 0),
    month   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS savings_user_month_idx ON savings (user_id, month);

-- Savings funds: the user-defined catalog of fund names shown in the savings
-- dropdown. A fund persists here even before it has any deposits or withdrawals,
-- so added choices survive a reload. Names are unique per user (case-insensitive).
CREATE TABLE IF NOT EXISTS savings_funds (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS savings_funds_user_name_lower_idx
    ON savings_funds (user_id, lower(name));

-- Investment sales: each row records cashing out part of a holding in a given
-- "YYYY-MM" month. Buys are planned in the budget sheet (budget_amounts); a sale
-- is subtracted from an asset's running total on the investments page.
CREATE TABLE IF NOT EXISTS investment_sales (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name    TEXT NOT NULL,
    amount  DOUBLE PRECISION NOT NULL CHECK (amount > 0),
    month   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS investment_sales_user_month_idx ON investment_sales (user_id, month);

-- Investment holdings: the user-defined catalog of holding names shown in the
-- investments dropdown. A holding persists here even before it has any buys or
-- sells, so added choices survive a reload. Names are unique per user (case-insensitive).
CREATE TABLE IF NOT EXISTS investment_holdings (
    id      SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS investment_holdings_user_name_lower_idx
    ON investment_holdings (user_id, lower(name));

-- Debts come in two kinds: one-time payments (kind='onetime', paid in full in a
-- single month) and installment plans / Ratenzahlungen (kind='installment', a
-- total paid off in fixed monthly rates over a term). A one-time debt is stored
-- as a 1-month plan. The per-month payment schedule is derived from these fields;
-- paid_months is how many installments have been paid so far.
CREATE TABLE IF NOT EXISTS debts (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind         TEXT NOT NULL DEFAULT 'installment',
    name         TEXT NOT NULL,
    total_amount DOUBLE PRECISION NOT NULL CHECK (total_amount > 0),
    monthly_rate DOUBLE PRECISION NOT NULL CHECK (monthly_rate > 0),
    term_months  INTEGER NOT NULL CHECK (term_months > 0),
    start_month  TEXT NOT NULL,
    paid_months  INTEGER NOT NULL DEFAULT 0 CHECK (paid_months >= 0)
);
CREATE INDEX IF NOT EXISTS debts_user_idx ON debts (user_id);

-- The budget sheet is stored per user and month as a flat key/value map: each
-- row is one planned entry, keyed by "section:row" (e.g. "fix:miete") plus meta
-- keys like "meta:paycheck", scoped to a "YYYY-MM" month. Type/category/due
-- carry each row's labels so user-added rows survive a round-trip. A month's
-- plan is replaced on each save.
CREATE TABLE IF NOT EXISTS budget_amounts (
    user_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    month     TEXT NOT NULL,
    entry_key TEXT NOT NULL,
    type      TEXT NOT NULL DEFAULT '',
    category  TEXT NOT NULL DEFAULT '',
    amount    DOUBLE PRECISION NOT NULL,
    due       TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, month, entry_key)
);

-- Personalized Type/Category dropdown options for the budget tables, keyed by
-- the section id (e.g. "variable"). These persist per user independently of
-- month and start empty for new accounts, so one account's choices never leak
-- into another.
CREATE TABLE IF NOT EXISTS budget_type_options (
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    section TEXT NOT NULL,
    name    TEXT NOT NULL,
    icon    TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, section, name)
);

-- Habits: one row per tracked habit, with a separate habit_checkins table
-- recording each "YYYY-MM-DD" date the habit was completed. Colour is the accent
-- shown in the UI. Frequency is "daily", "weekly" (once a week) or "weekdays";
-- when "weekdays", the weekdays column holds the comma-separated days (0=Sun..6).
-- Deleting a habit cascades to its check-ins.
CREATE TABLE IF NOT EXISTS habits (
    id        SERIAL PRIMARY KEY,
    user_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    category  TEXT NOT NULL DEFAULT '',
    color     TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL DEFAULT 'daily',
    weekdays  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS habits_user_idx ON habits (user_id);

-- Add the schedule columns to databases created before they existed.
ALTER TABLE habits ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE habits ADD COLUMN IF NOT EXISTS weekdays TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS habit_checkins (
    habit_id INTEGER NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
    date     DATE NOT NULL,
    PRIMARY KEY (habit_id, date)
);

-- Generic per-user JSON documents. Backs views that used to persist only to the
-- browser's localStorage (travel plan, year overview, monthly budget targets),
-- so their data now follows the account across devices. Each row is one opaque
-- JSON blob the frontend owns, keyed by a short document key scoped to a user.
CREATE TABLE IF NOT EXISTS user_documents (
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    doc_key TEXT NOT NULL,
    data    JSONB NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (user_id, doc_key)
);

-- Row Level Security (RLS).
--
-- This app does NOT use Supabase/PostgREST. All access goes through the Go
-- backend, which connects directly to Postgres as a privileged role (the
-- "postgres"/service role has BYPASSRLS), so it is unaffected by the policies
-- below. We still enable RLS on every table in the public schema because any
-- Supabase project auto-exposes public tables over its REST API to the "anon"
-- and "authenticated" roles. Enabling RLS with NO policies denies all access to
-- those roles, closing that hole without breaking the Go backend.
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE income              ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_funds       ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_sales    ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_amounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_type_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits              ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_checkins      ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_documents      ENABLE ROW LEVEL SECURITY;

