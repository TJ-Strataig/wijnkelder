-- Migratie 0004: streepjescodes, meldingen, voorraaddoelen, inventarisatie, cadeau-notities. Verwijdert niets.
-- Uitvoeren: cd api && npx wrangler d1 execute wijnkelder --remote --file=./migrations/0004_slim.sql -y
ALTER TABLE wines ADD COLUMN barcode TEXT;            -- EAN/UPC van het etiket
CREATE INDEX IF NOT EXISTS idx_wines_barcode ON wines(barcode);

ALTER TABLE bottles ADD COLUMN gift_occasion TEXT;    -- cadeau: gelegenheid ("verjaardag Tije 2026")
ALTER TABLE bottles ADD COLUMN gift_thanked INTEGER NOT NULL DEFAULT 0;  -- bedankt na openen?
ALTER TABLE bottles ADD COLUMN last_seen_at TEXT;     -- laatste inventarisatie waarbij de fles is gezien

-- Pushmeldingen (Web Push) per apparaat
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  label        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_sent_at TEXT,
  failures     INTEGER NOT NULL DEFAULT 0
);

-- Meldingsvoorkeuren per gebruiker
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly_day     INTEGER,            -- 0=zo … 6=za; NULL = uit
  weekly_hour    INTEGER DEFAULT 17,
  drink_window   INTEGER NOT NULL DEFAULT 1,   -- melding bij wijnen die hun venster binnenlopen/verlaten
  low_stock      INTEGER NOT NULL DEFAULT 1,   -- melding bij tekorten t.o.v. voorraaddoelen
  last_weekly_at TEXT,
  last_window_at TEXT
);

-- Meldingen in de app (ook zonder push zichtbaar)
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,           -- weekly | drink_window | low_stock | last_bottle | gift
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,                    -- app-route, bijv. #/wijn/<id>
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at    TEXT
);

-- Voorraaddoelen ("altijd minimaal 6 doordeweekse witte wijnen onder € 12")
CREATE TABLE IF NOT EXISTS stock_targets (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  type        TEXT,                   -- wijntype of NULL = alle
  max_price   REAL,                   -- per fles; NULL = geen grens
  min_price   REAL,
  country     TEXT,
  region      TEXT,
  grape       TEXT,
  min_bottles INTEGER NOT NULL DEFAULT 6,
  budget      REAL,                   -- optioneel maandbudget voor deze categorie
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Inventarisatierondes
CREATE TABLE IF NOT EXISTS inventory_sessions (
  id           TEXT PRIMARY KEY,
  started_by   TEXT REFERENCES users(id),
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at  TEXT,
  expected     INTEGER,
  seen         INTEGER,
  missing      TEXT                  -- JSON: fles-id's die niet gezien zijn
);
