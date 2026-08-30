/**
 * Ordered schema migrations, tracked by SQLite's `user_version` pragma.
 * Never edit a migration that has shipped - append a new one instead.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'member',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sessions (
    -- SHA-256 of the cookie token; the raw token never touches disk.
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  -- One shared set of farm books. Amounts are integer cents, always positive;
  -- direction comes from the category's kind.
  CREATE TABLE transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT NOT NULL CHECK (kind IN ('income','expense')),
    category_id TEXT NOT NULL,
    date        TEXT NOT NULL,
    amount      INTEGER NOT NULL CHECK (amount >= 0),
    payee       TEXT,
    description TEXT,
    payment_method TEXT,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_transactions_date ON transactions(date);
  CREATE INDEX idx_transactions_category ON transactions(category_id);
  CREATE INDEX idx_transactions_kind ON transactions(kind);

  -- Receipt photos live on disk; this table holds the metadata.
  CREATE TABLE receipts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    filename       TEXT NOT NULL,
    mime_type      TEXT NOT NULL,
    byte_size      INTEGER NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_receipts_transaction ON receipts(transaction_id);

  -- Personal labor records. Minutes, not fractional hours.
  CREATE TABLE time_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,
    minutes    INTEGER NOT NULL CHECK (minutes > 0),
    task       TEXT NOT NULL,
    notes      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_time_entries_user_date ON time_entries(user_id, date);
  `,

  // Depreciable assets. The yearly schedule is derived from these inputs
  // rather than stored, so correcting a cost or a class re-runs cleanly.
  `
  CREATE TABLE assets (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    name                 TEXT NOT NULL,
    description          TEXT,
    asset_class          TEXT NOT NULL,
    method               TEXT NOT NULL CHECK (method IN ('200DB','150DB','SL')),
    convention           TEXT NOT NULL CHECK (convention IN ('half-year','mid-quarter','mid-month')),
    placed_in_service    TEXT NOT NULL,
    cost                 INTEGER NOT NULL CHECK (cost >= 0),
    section_179          INTEGER NOT NULL DEFAULT 0 CHECK (section_179 >= 0),
    bonus_percent        REAL NOT NULL DEFAULT 0 CHECK (bonus_percent BETWEEN 0 AND 100),
    business_use_percent REAL NOT NULL DEFAULT 100 CHECK (business_use_percent > 0 AND business_use_percent <= 100),
    disposed_date        TEXT,
    disposal_proceeds    INTEGER,
    notes                TEXT,
    created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_assets_placed ON assets(placed_in_service);
  CREATE INDEX idx_assets_disposed ON assets(disposed_date);
  `,
];
