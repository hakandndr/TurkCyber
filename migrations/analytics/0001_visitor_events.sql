-- ANALYTICS_DB 0001 — private visitor event log.
-- Follows BLUEPRINT-visitor-analytics.md §3.
--
-- `ip` stores the full address. This is a deliberate choice for a private
-- panel. /gizlilik/ states this behaviour explicitly; the policy and this
-- column must never disagree.

CREATE TABLE IF NOT EXISTS visitor_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at   TEXT    NOT NULL,          -- ISO 8601, UTC
  local_date    TEXT,                      -- YYYY-MM-DD in ANALYTICS_TIMEZONE, computed at write time
  host          TEXT    NOT NULL,
  path          TEXT    NOT NULL,
  referrer      TEXT,                      -- normalised grouping label
  referrer_raw  TEXT,                      -- value as received
  ip            TEXT,
  country       TEXT,
  region        TEXT,
  city          TEXT,
  asn           INTEGER,
  device        TEXT,                      -- Mobile | Desktop
  browser       TEXT,
  user_agent    TEXT,
  source        TEXT    NOT NULL DEFAULT 'worker'
);

CREATE INDEX IF NOT EXISTS idx_visitor_events_occurred_at
  ON visitor_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_events_local_date
  ON visitor_events (local_date);
CREATE INDEX IF NOT EXISTS idx_visitor_events_ip
  ON visitor_events (ip);
CREATE INDEX IF NOT EXISTS idx_visitor_events_source
  ON visitor_events (source);
