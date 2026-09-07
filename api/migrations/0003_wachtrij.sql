-- Migratie: beoordelingswachtrij voor bulk-invoer (foto's + AI-herkenning die nog goedgekeurd moeten worden). Verwijdert niets.
-- Uitvoeren: cd api && npx wrangler d1 execute wijnkelder --remote --file=./migrations/0003_wachtrij.sql -y
CREATE TABLE IF NOT EXISTS intake_queue (
  id              TEXT PRIMARY KEY,
  status          TEXT NOT NULL DEFAULT 'pending',   -- pending (nog herkennen) | recognized | failed | approved | skipped
  label_image_key TEXT,                              -- foto in R2
  wine            TEXT,                              -- JSON: herkende/aangepaste wijngegevens
  bottle          TEXT,                              -- JSON: aankoopgegevens (aantal, prijs, datum, winkel, locatie)
  confidence      REAL,
  error           TEXT,
  batch_label     TEXT,                              -- bijv. "Gall & Gall 7 sep 2026"
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  approved_wine_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_intake_status ON intake_queue(status);
