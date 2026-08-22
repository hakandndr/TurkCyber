-- APP_DB 0002 — indexes supporting the public read path and the moderation queue.

-- Public article read: approved comments for one article, oldest first.
CREATE INDEX IF NOT EXISTS idx_comments_public
  ON comments (article_slug, status, created_at);

-- Moderation queue: pending first, newest first.
CREATE INDEX IF NOT EXISTS idx_comments_status_created
  ON comments (status, created_at DESC);

-- Threading lookup.
CREATE INDEX IF NOT EXISTS idx_comments_parent
  ON comments (parent_id);

-- Abuse correlation without a reversible identifier.
CREATE INDEX IF NOT EXISTS idx_comments_ip_hash
  ON comments (ip_hash, created_at);
