PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cellar_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (name COLLATE NOCASE)
);
CREATE TABLE IF NOT EXISTS racks (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES cellar_locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (location_id, name COLLATE NOCASE)
);
CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  rack_id TEXT NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (rack_id, name COLLATE NOCASE)
);
CREATE INDEX IF NOT EXISTS idx_racks_location ON racks(location_id);
CREATE INDEX IF NOT EXISTS idx_slots_rack ON slots(rack_id);

-- SQLite heeft geen portable ADD COLUMN IF NOT EXISTS; this migration is
-- applied once by the numbered migration runner. The schema already contains
-- the column for fresh databases.
ALTER TABLE bottles ADD COLUMN slot_id TEXT REFERENCES slots(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bottles_slot ON bottles(slot_id);
