-- APP_DB 0003 — audit trail for /boss mutations.
--
-- Records who changed what and when. Never stores passwords, tokens, session
-- material or any secret.

CREATE TABLE IF NOT EXISTS audit_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  actor       TEXT NOT NULL,   -- BOSS_USER value of the authenticated session
  action      TEXT NOT NULL,   -- approve | reject | spam | delete
  entity_type TEXT NOT NULL,   -- comment
  entity_id   TEXT NOT NULL,
  details     TEXT             -- short human-readable note, no secrets
);

CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at
  ON audit_events (occurred_at DESC);
