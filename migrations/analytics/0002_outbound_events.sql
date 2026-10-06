-- Additive source activity store. Existing PAGE stores and counters are untouched.
CREATE TABLE IF NOT EXISTS outbound_events (
  event_id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  path TEXT NOT NULL,
  destination_host TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  event_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbound_events_time ON outbound_events(occurred_at);
