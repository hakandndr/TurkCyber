-- APP_DB 0006 — optional Cloudflare region code for private moderation.
--
-- This is additive and nullable. Historical comments remain NULL because
-- their location cannot be reconstructed without inventing data.

ALTER TABLE comments ADD COLUMN region_code TEXT;
