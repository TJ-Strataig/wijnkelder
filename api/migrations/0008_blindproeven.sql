PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS blind_tastings (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  evening_id TEXT REFERENCES evenings(id) ON DELETE SET NULL,
  selection_id TEXT REFERENCES selections(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'revealed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), opened_at TEXT, revealed_at TEXT, cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_blind_tastings_created ON blind_tastings(created_by, created_at);
CREATE TABLE IF NOT EXISTS blind_tasting_wines (
  id TEXT PRIMARY KEY,
  tasting_id TEXT NOT NULL REFERENCES blind_tastings(id) ON DELETE CASCADE,
  wine_id TEXT NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  code TEXT NOT NULL, flight_order INTEGER NOT NULL,
  UNIQUE (tasting_id, wine_id), UNIQUE (tasting_id, code)
);
CREATE INDEX IF NOT EXISTS idx_blind_tasting_wines_tasting ON blind_tasting_wines(tasting_id, flight_order);
CREATE TABLE IF NOT EXISTS blind_tasting_entries (
  id TEXT PRIMARY KEY,
  tasting_id TEXT NOT NULL REFERENCES blind_tastings(id) ON DELETE CASCADE,
  code TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating BETWEEN 1 AND 100), aromas TEXT, palate TEXT, finish TEXT, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tasting_id, code, user_id),
  FOREIGN KEY (tasting_id, code) REFERENCES blind_tasting_wines(tasting_id, code) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_blind_tasting_entries_tasting ON blind_tasting_entries(tasting_id, code);
