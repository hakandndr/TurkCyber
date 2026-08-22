-- APP_DB 0004 — optional contact email on comments.
--
-- ADDITIVE ONLY. Migration 0001 is history and must not be edited: it has been
-- applied wherever this schema already exists, and rewriting it would make the
-- migration ledger disagree with reality.
--
-- The address is OPTIONAL. It is collected so the owner can reply privately to
-- a question, and for nothing else:
--
--   * it is never returned by the public comments API,
--   * it is never rendered on an article,
--   * it is not required to post,
--   * /gizlilik/ states that it is stored and never published.
--
-- SQLite ALTER TABLE ADD COLUMN is safe here: the column is nullable with no
-- default, so existing rows keep working and no table rewrite occurs.

ALTER TABLE comments ADD COLUMN email TEXT;
