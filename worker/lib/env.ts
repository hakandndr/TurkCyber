/** Bindings and secrets available to the Worker. */
export interface Env {
  /** Static Astro build output. */
  ASSETS: Fetcher;

  /** Application data: comments, audit trail. */
  APP_DB?: D1Database;
  /** Private visitor analytics. Separate database, separate retention. */
  ANALYTICS_DB?: D1Database;
  /** Short-TTL store for login throttling and comment rate limits. */
  THROTTLE_KV?: KVNamespace;

  ENVIRONMENT?: string;
  /** IANA timezone used for analytics day boundaries. */
  ANALYTICS_TIMEZONE?: string;

  /** /boss credentials. Absent secrets must yield 503, never a partial panel. */
  BOSS_USER?: string;
  BOSS_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;

  /** Turnstile. Site key is public; secret key is server-side only. */
  PUBLIC_TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;

  /** HMAC key turning visitor IPs into non-reversible comment abuse keys. */
  COMMENT_IP_PEPPER?: string;
}
