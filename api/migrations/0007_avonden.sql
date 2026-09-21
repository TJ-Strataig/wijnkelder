PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS evenings (
  id                 TEXT PRIMARY KEY,
  title              TEXT,
  starts_at          TEXT NOT NULL,
  ends_at            TEXT,
  kind               TEXT NOT NULL DEFAULT 'home' CHECK (kind IN ('home', 'restaurant')),
  status             TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'cancelled')),
  selection_id       TEXT REFERENCES selections(id) ON DELETE SET NULL,
  restaurant_name    TEXT,
  restaurant_address TEXT,
  restaurant_url     TEXT,
  dish               TEXT,
  mood               TEXT,
  guests             TEXT,
  notes              TEXT,
  created_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evenings_starts ON evenings(starts_at);
CREATE INDEX IF NOT EXISTS idx_evenings_status ON evenings(status);
CREATE INDEX IF NOT EXISTS idx_evenings_selection ON evenings(selection_id);
