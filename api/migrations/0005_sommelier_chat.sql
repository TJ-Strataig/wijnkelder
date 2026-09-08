-- Migratie 0005: chatgesprekken met de Sommelier. Verwijdert niets.
-- Uitvoeren: cd api && npx wrangler d1 execute wijnkelder --remote --file=./migrations/0005_sommelier_chat.sql -y
CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,           -- user | assistant
  content     TEXT NOT NULL,           -- tekst (voor assistant: het antwoord)
  image_key   TEXT,                    -- meegestuurde foto (R2)
  actions     TEXT,                    -- JSON: uitgevoerde gereedschappen (voor transparantie)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, created_at);
