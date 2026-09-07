-- Wijnkelder databaseschema (Cloudflare D1 / SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  disabled    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credentials (
  id            TEXT PRIMARY KEY,           -- base64url credential id
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key    TEXT NOT NULL,              -- base64url COSE public key
  counter       INTEGER NOT NULL DEFAULT 0,
  transports    TEXT,                       -- JSON array
  device_type   TEXT,
  backed_up     INTEGER NOT NULL DEFAULT 0,
  label         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash           TEXT PRIMARY KEY,    -- sha256 van het sessietoken
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at         TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at           TEXT NOT NULL,       -- glijdend (30 dagen)
  absolute_expires_at  TEXT NOT NULL,       -- hard maximum (90 dagen)
  user_agent           TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS invites (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);

CREATE TABLE IF NOT EXISTS challenges (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,                -- register | login | add-passkey
  challenge   TEXT NOT NULL,
  user_id     TEXT,
  invite_id   TEXT,
  payload     TEXT,                         -- JSON (bijv. naam/rol bij bootstrap)
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key           TEXT PRIMARY KEY,
  window_start  INTEGER NOT NULL,
  count         INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS wines (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  producer           TEXT,
  country            TEXT,
  region             TEXT,
  appellation        TEXT,
  type               TEXT NOT NULL,          -- rood | wit | rose | mousserend | port | dessert | versterkt | oranje | overig
  vintage            INTEGER,                -- NULL = non-vintage
  grapes             TEXT,                   -- JSON array
  alcohol            REAL,
  volume_ml          INTEGER DEFAULT 750,
  sweetness          TEXT,                   -- droog | halfdroog | zoet | ...
  body               TEXT,                   -- licht | medium | vol
  tannin             TEXT,                   -- laag | medium | hoog
  acidity            TEXT,                   -- laag | medium | hoog
  aging_wine         INTEGER NOT NULL DEFAULT 0,   -- bewaarwijn (1/0)
  drink_from         INTEGER,                -- jaar
  drink_until        INTEGER,                -- jaar
  peak_from          INTEGER,
  peak_until         INTEGER,
  development        TEXT,                   -- hoe de wijn zich ontwikkelt
  serving_temp       TEXT,
  decant_minutes     INTEGER,
  food_pairings      TEXT,                   -- JSON array met gerechten/categorieën
  description        TEXT,
  tasting_profile    TEXT,                   -- JSON: aroma's, smaak, etc.
  label_image_key    TEXT,                   -- R2 sleutel
  estimated_price    REAL,
  estimated_price_min REAL,
  estimated_price_max REAL,
  estimated_price_source TEXT,               -- JSON: bronnen + datum
  estimated_price_at TEXT,
  favorite           INTEGER NOT NULL DEFAULT 0,
  notes              TEXT,
  latitude           REAL,                   -- herkomst (kaart)
  longitude          REAL,
  geo_label          TEXT,                   -- wat er is gegeocodeerd
  geo_precision      TEXT,                   -- producer | appellation | region | country
  created_by         TEXT REFERENCES users(id),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wines_type ON wines(type);
CREATE INDEX IF NOT EXISTS idx_wines_country ON wines(country);

CREATE TABLE IF NOT EXISTS bottles (
  id              TEXT PRIMARY KEY,
  wine_id         TEXT NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'in_cellar',  -- in_cellar | consumed | gifted_away | sold | damaged | other
  size_ml         INTEGER DEFAULT 750,
  price           REAL,
  currency        TEXT DEFAULT 'EUR',
  gifted          INTEGER NOT NULL DEFAULT 0,
  gifted_from     TEXT,
  purchase_date   TEXT,
  purchase_place  TEXT,
  location        TEXT,                    -- bijv. "Kelder rek A, plank 2"
  added_by        TEXT REFERENCES users(id),
  added_at        TEXT NOT NULL DEFAULT (datetime('now')),
  removed_by      TEXT REFERENCES users(id),
  removed_at      TEXT,
  removed_reason  TEXT,
  removed_note    TEXT
);
CREATE INDEX IF NOT EXISTS idx_bottles_wine ON bottles(wine_id);
CREATE INDEX IF NOT EXISTS idx_bottles_status ON bottles(status);

CREATE TABLE IF NOT EXISTS tasting_notes (
  id               TEXT PRIMARY KEY,
  wine_id          TEXT NOT NULL REFERENCES wines(id) ON DELETE CASCADE,
  bottle_id        TEXT REFERENCES bottles(id) ON DELETE SET NULL,
  user_id          TEXT NOT NULL REFERENCES users(id),
  tasted_at        TEXT NOT NULL,
  rating           INTEGER CHECK (rating BETWEEN 1 AND 100),
  appearance       TEXT,
  nose             TEXT,
  palate           TEXT,
  finish           TEXT,
  notes            TEXT,
  occasion         TEXT,
  paired_with      TEXT,
  would_buy_again  INTEGER,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tastings_wine ON tasting_notes(wine_id);

CREATE TABLE IF NOT EXISTS wishlist (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  producer    TEXT,
  vintage     INTEGER,
  type        TEXT,
  note        TEXT,
  max_price   REAL,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id),
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  details    TEXT,
  at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_at ON activity(at);

-- Instellingen van het huishouden (bijv. AI-provider). Gevoelige waarden staan versleuteld (AES-GCM) in de JSON.
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_by  TEXT REFERENCES users(id),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Producentinformatie (herkomstkaart). Bestaande installaties: zie migrations/0002_herkomst.sql

CREATE TABLE IF NOT EXISTS producers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  name_key      TEXT NOT NULL UNIQUE,   -- genormaliseerd voor koppeling
  country       TEXT,
  region        TEXT,
  description   TEXT,                   -- AI-profiel (Nederlands)
  founded       TEXT,
  owner         TEXT,
  winemaker     TEXT,
  hectares      REAL,
  philosophy    TEXT,                   -- biologisch, biodynamisch, traditioneel, ...
  signature_wines TEXT,                 -- JSON array
  website       TEXT,
  latitude      REAL,
  longitude     REAL,
  address       TEXT,
  sources       TEXT,                   -- JSON: bronnen
  confidence    REAL,
  notes         TEXT,                   -- eigen notities van het huishouden
  updated_by    TEXT REFERENCES users(id),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Beoordelingswachtrij voor bulk-invoer. Bestaande installaties: zie migrations/0003_wachtrij.sql
CREATE TABLE IF NOT EXISTS intake_queue (
  id              TEXT PRIMARY KEY,
  status          TEXT NOT NULL DEFAULT 'pending',
  label_image_key TEXT,
  wine            TEXT,
  bottle          TEXT,
  confidence      REAL,
  error           TEXT,
  batch_label     TEXT,
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  approved_wine_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_intake_status ON intake_queue(status);
