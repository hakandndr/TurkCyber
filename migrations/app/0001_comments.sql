-- APP_DB 0001 — first-party comments.
--
-- Comments are plain text. No HTML is stored or rendered; the body is escaped
-- at render time. Nothing is publicly visible before an owner approves it.
--
-- No raw IP is stored here. `ip_hash` is an HMAC of the address keyed with
-- COMMENT_IP_PEPPER, which gives abuse correlation without holding a
-- reversible identifier in the application database.

CREATE TABLE IF NOT EXISTS comments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  article_slug    TEXT    NOT NULL,
  parent_id       INTEGER REFERENCES comments (id) ON DELETE CASCADE,
  display_name    TEXT    NOT NULL,
  body            TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'spam')),
  created_at      TEXT    NOT NULL,
  approved_at     TEXT,
  ip_hash         TEXT,
  user_agent      TEXT,
  country         TEXT,
  moderation_note TEXT
);
