-- Migratie voor bestaande installaties: voegt herkomst en producenten toe. Verwijdert niets.
-- Uitvoeren: cd api && npx wrangler d1 execute wijnkelder --remote --file=./migrations/0002_herkomst.sql -y
ALTER TABLE wines ADD COLUMN latitude REAL;
ALTER TABLE wines ADD COLUMN longitude REAL;
ALTER TABLE wines ADD COLUMN geo_label TEXT;
ALTER TABLE wines ADD COLUMN geo_precision TEXT;

CREATE TABLE IF NOT EXISTS producers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  name_key      TEXT NOT NULL UNIQUE,
  country       TEXT,
  region        TEXT,
  description   TEXT,
  founded       TEXT,
  owner         TEXT,
  winemaker     TEXT,
  hectares      REAL,
  philosophy    TEXT,
  signature_wines TEXT,
  website       TEXT,
  latitude      REAL,
  longitude     REAL,
  address       TEXT,
  sources       TEXT,
  confidence    REAL,
  notes         TEXT,
  updated_by    TEXT REFERENCES users(id),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
