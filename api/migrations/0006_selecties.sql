PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS selections (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS selection_wines (
  selection_id TEXT NOT NULL REFERENCES selections(id) ON DELETE CASCADE,
  wine_id      TEXT NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  added_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  added_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (selection_id, wine_id)
);

CREATE INDEX IF NOT EXISTS idx_selections_updated ON selections(updated_at);
CREATE INDEX IF NOT EXISTS idx_selection_wines_wine ON selection_wines(wine_id);
