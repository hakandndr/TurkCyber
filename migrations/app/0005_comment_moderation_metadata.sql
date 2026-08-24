-- APP_DB 0005 — private moderation context for newly submitted comments.
--
-- Existing `ip_hash` values are keyed HMACs used for throttling and abuse
-- correlation. They are intentionally not reversible, so historical rows
-- cannot be backfilled with an address. These nullable columns therefore stay
-- NULL for existing comments.
--
-- `comment_ip` and `city` are available only to the authenticated /boss
-- moderation view. The public comments API continues to select an explicit
-- allowlist that excludes all moderation-only metadata.

ALTER TABLE comments ADD COLUMN comment_ip TEXT;
ALTER TABLE comments ADD COLUMN city TEXT;
