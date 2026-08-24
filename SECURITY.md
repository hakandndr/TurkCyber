# Security

Security and privacy model for the live TurkCyber service. Report security
issues privately to `admin@turkcyber.com`; do not include credentials, session
cookies or private comment/analytics records in a public issue.

## 1. Trust boundaries

```text
Public browser
  |-- static content ---------------------- public
  |-- /collect ---------------------------- private ANALYTICS_DB
  |-- /api/comments GET ------------------- approved safe-column output
  |-- /api/comments POST ------------------ pending APP_DB + private metadata
  `-- /iletisim --------------------------- Formspree

Authenticated owner
  `-- /boss ------------------------------- private APP_DB/ANALYTICS_DB

Worker background task
  `-- Resend ------------------------------ private moderation email
```

APP_DB and ANALYTICS_DB are separate sensitivity domains. Never join them or
move comments into analytics. THROTTLE_KV contains short-lived abuse counters,
not durable user records.

## 2. Worker-first header enforcement

`assets.run_worker_first` is required because the Worker owns public security
headers. Without it Cloudflare's asset layer can bypass the Worker for static
HTML. The release process found this in the live environment; checking Worker
code alone is not sufficient.

Production public responses receive:

- strict Content Security Policy;
- `Strict-Transport-Security`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- restrictive permissions policy.

Staging receives the same public controls plus
`X-Robots-Tag: noindex, nofollow`, and intentionally does not set HSTS.

## 3. Content Security Policy

The current CSP keeps `script-src` strict:

- same-origin executable Astro assets;
- Cloudflare Turnstile;
- **no** `unsafe-inline` for scripts.

Astro is configured to externalize executable component entrypoints. Do not
reintroduce inline executable scripts or weaken the policy to accommodate them.

Other important directives:

- `default-src 'self'`
- `base-uri 'self'`
- `frame-ancestors 'none'`
- `object-src 'none'`
- Turnstile-only `frame-src`
- Google Fonts stylesheet/font origins
- exact `https://formspree.io/f/mljrvker` allowance in `form-action` and
  `connect-src`

`style-src 'unsafe-inline'` is for generated styles and is not permission for
inline JavaScript.

## 4. SQL and rendering

Every request-derived SQL value is bound. Dynamic filter values must never be
interpolated into statements. Migrations are append-only.

Every value rendered in `/boss` is attacker-controlled until proven otherwise:
comment text, display name, path, referrer, user agent and geolocation. Escape
all values with the shared HTML escape helper. Do not render raw D1 rows into
HTML templates.

## 5. Boss authentication

Boss uses a repository-defined PBKDF2-SHA256 hash format and a signed stateless
session cookie.

- maximum PBKDF2 iterations: 100,000, a Worker runtime compatibility ceiling;
- login attempts: KV-backed throttling, five failures trigger lockout;
- cookie: `tc_boss`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`;
- idle expiry: 30 minutes, refreshed on authenticated requests;
- absolute session: 8 hours from sign-in, never moved;
- logout clears the cookie;
- all private responses: `Cache-Control: no-store` and
  `X-Robots-Tag: noindex, nofollow`.

State-changing boss requests require same-origin evidence. `Origin: null` from
a real browser is treated as unavailable; a Referer is accepted only when its
origin exactly matches the target. Private pages use
`Referrer-Policy: same-origin` so normal form submissions preserve this signal.
Cross-origin, malformed and headerless requests are rejected.

Synthetic HTTP tests once supplied Origin/Referer manually and missed the real
browser failure. Test authentication through the visible browser form after any
change to headers, policy, cookies, redirects or routes.

## 6. Comment submission controls

The comments endpoint enforces:

- exact route and method handling;
- same-origin evidence;
- bounded request size;
- validated/sanitized slug, name, email and plain-text body;
- KV rate limiting;
- Turnstile server-side verification, fail closed;
- parameterized D1 inserts;
- `pending` status before public visibility.

Public HTML renders comment bodies as text; stored HTML is neither needed nor
trusted.

## 7. Comment IP and email model

New comments may store two IP representations:

- `ip_hash`: HMAC keyed by `COMMENT_IP_PEPPER`, used for abuse correlation and
  throttling; intentionally irreversible;
- `comment_ip`: nullable raw address for authenticated moderation only.

Migration 0005 added `comment_ip` and `city`; migration 0006 added
`region_code`. Existing rows are not backfilled because their HMAC cannot be
reversed. Do not invent raw IP or location for historical comments.

Optional `email` is private moderation/reply context. It is never public.

## 8. Public comment allowlist

The public read SQL names only:

```text
id, parent_id, display_name, body, created_at
```

The following must never appear in public comment output:

- `email`
- `comment_ip`
- `ip_hash`
- `user_agent`
- `country`
- `city`
- `region_code`
- moderation notes

Do not replace the explicit projection with `SELECT *`. Regression tests check
both SQL and serialized output.

## 9. Geolocation

Country/city/region come from Cloudflare request metadata. No outbound geo-IP
service or fingerprinting fields are added. The shared private formatter emits
`City, ST` for US records only when a valid two-letter region exists, city for
non-US records and `—` when missing. It never invents a state.

## 10. Turnstile and throttling

Staging and production use distinct Turnstile widgets/site keys/secrets.
The public site key is build-time public configuration; the secret is a Worker
secret. Missing/invalid verification fails closed before comment insertion or
notification.

THROTTLE_KV protects comment submission and boss login. The HMAC pepper and
session secrets differ by environment and must not be reused.

## 11. Resend as a private processor

Resend receives a private moderation notification only after a pending comment
is stored. Current routing:

- domain: `notify.turkcyber.com`
- from: `TurkCyber <notifications@notify.turkcyber.com>`
- to: `admin@turkcyber.com`
- secret name: `RESEND_API_KEY`

The message may include comment id/status, author, optional email, raw IP,
location, timestamp, article/path, excerpt and the authenticated moderation
URL. It must not include passwords, hashes, cookies, API keys, session material
or Turnstile tokens.

The dedicated sending subdomain has verified DKIM/SPF. Root Hostinger
receiving-mail DNS was preserved; Resend did not migrate root mail.

## 12. Background failure safety and idempotency

Notification delivery is registered with `ctx.waitUntil()` only after a
successful D1 insert and public success preparation. Resend/network failure:

- does not reject the comment;
- does not roll it back;
- does not change status;
- does not alter the public 202 response.

The idempotency header is
`comment-notification/<environment>/<comment-id>`. This is provider-level
duplicate protection for retries; it is not a general job queue.

Failure logs are structured and limited to event name
`comment_notification_failed`, comment id, provider and HTTP/network status.
Do not log the key, email body, IP, email address or comment text.

## 13. Time handling

D1 timestamps remain UTC ISO strings. `local_date` and owner-facing display are
computed in application code using IANA timezone data. Notification email uses
`America/Los_Angeles` and resolves PDT/PST through `Intl.DateTimeFormat`; no
fixed `-7`/`-8` offset is allowed. Tests cover both seasons.

## 14. Analytics privacy boundary

`ANALYTICS_DB` is private and may hold IP, geo, path/referrer and user-agent
context. `/collect` always returns its pixel; analytics failure is not a public
page failure. Analytics data is visible only in boss.

The public privacy page intentionally uses concise categories rather than a
column inventory. It promises visit records are kept at most 90 days. The purge
is currently manual in boss and touches only `visitor_events`.

The owner explicitly authorized a one-time import of all 1,668 historical
legacy rows without a 90-day filter. That exception must remain documented and
must not be mistaken for automatic ongoing retention behavior.

## 15. Analytics import safety

The legacy importer:

- is read-only unless `--write-sql` is explicitly requested;
- writes SQL only outside the repository;
- validates IP/field lengths/client/timestamp;
- rejects impossible and DST-ambiguous timestamps;
- creates deterministic occurrence-aware record hashes;
- uses an import ledger for idempotency;
- contains no delete statement;
- preserves existing Worker events and never touches APP_DB.

Import SQL contains private source records. Never commit or paste it into logs or
documentation.

## 16. Contact form

The public contact form submits to the exact Formspree endpoint configured in
`src/config/site.ts`. The CSP allows that endpoint only. A honeypot reduces
automated spam. Formspree is an external processor and the privacy page states
that plainly.

The endpoint URL itself is public configuration. Formspree account credentials
or dashboard tokens would be secrets and must not be added.

## 17. Secret handling

Allowed in documentation: secret names only.

Deployed secret names:

- `BOSS_USER`
- `BOSS_PASSWORD_HASH`
- `SESSION_SECRET`
- `TURNSTILE_SECRET_KEY`
- `COMMENT_IP_PEPPER`
- `RESEND_API_KEY`

Never store or print values, plaintext boss passwords, password hashes, session
tokens, cookies or `.env.*.local` contents. Use `wrangler secret put` through a
safe stdin/interactive flow and verify only with `wrangler secret list`.

The public Turnstile site key and Formspree endpoint are not secrets, but still
must be environment-correct.

## 18. Brand and generated-asset integrity

Owner raster masters and their aggregate fingerprint are recorded in
`src/brand/identity.json`. Tests validate exact master/derived hashes and
dimensions and reject duplicate SVG geometry. Generator scripts only crop,
scale, pad and composite the owner artwork. This prevents a future integration
from silently replacing the approved mark.

## 19. DNS, routes and rollback security

Production route or DNS changes require explicit owner authorization. Never
alter MX/SPF/DKIM/DMARC as a side effect of site deployment. Snapshot DNS and
mail fingerprints before a cutover or rollback.

If a critical Worker regression occurs, detach only the two production Worker
routes or roll back the Worker version. Preserve Hostinger, D1, KV, comments,
analytics and mail DNS. Data deletion is not part of route rollback.

## 20. Known security gaps and operational limits

- Boss is password/session based, not Cloudflare Access or hardware-key gated.
- Analytics retention is manual; missing the operator task can exceed the
  public 90-day commitment.
- Resend waitUntil delivery is not a durable queue. Provider idempotency limits
  duplicates but does not guarantee retry after every platform failure.
- Google Fonts remains an external request.
- The recovered live source is committed locally, but the branch has no upstream
  and is not yet present in remote source control. Push or merge requires explicit
  owner authorization.
