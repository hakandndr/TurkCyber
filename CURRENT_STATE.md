# Current state

Authoritative snapshot of TurkCyber as observed on **2026-08-24 03:55 PDT**
(10:55 UTC). Repository and live runtime checks supersede earlier planning
documents and historical `PROCESS.md` entries.

## Headline

**Production is live. Staging is healthy.** Cloudflare Worker routes serve the
static Astro site and dynamic services at both environments. Production data,
comments, moderation, analytics, Turnstile and Resend notifications are active.

The deployed post-launch brand, runtime, migration, notification, importer and
routing source is represented by coherent local commits. Before the first public
push, a narrowly authorized rewrite removed the retired
`turkcyber-pass2.tar.gz` transfer archive from every reachable commit. The
rewritten source trees are byte-identical to their pre-rewrite counterparts and
the public-history audit is clean. The public GitHub repository is populated,
`main` is authoritative and both preserved branches have upstream tracking.

## Repository and Git

| Item                         | Current value                                                      |
| ---------------------------- | ------------------------------------------------------------------ |
| Repository                   | `D:\IT\turkcyber\turkcyber.com`                                    |
| Current branch               | `main`                                                             |
| Published baseline           | `b7867ae6722d567f7ef90e85c62bbd7d2d970278`                         |
| Final HEAD                   | documentation-only commit containing this authoritative snapshot   |
| Rewritten live source commit | `800a2fba80adb0b313ffca2f6f0e39ab081e6ac2`                         |
| Local recovery branch        | `b7867ae6722d567f7ef90e85c62bbd7d2d970278`                         |
| Remote recovery branch       | `b7867ae6722d567f7ef90e85c62bbd7d2d970278`                         |
| Remote                       | `https://github.com/hakandndr/TurkCyber.git`                       |
| Default branch               | `main`                                                             |
| Tracking                     | `main` → `origin/main`; recovery → matching `origin` branch        |
| Release tag                  | `production-live-2026-08-24` → live source `800a2fba…`             |
| Tag object                   | `922f808cdfea7b5cc45b4bba593d34c7eb602028`                         |
| Working tree                 | clean after the final documentation commit                         |
| Push/deploy relationship     | GitHub CI scans/checks only; pushing does not deploy either Worker |

The committed history now reproduces the live source state. Recovery snapshots
remain external to the repository; ignored `.env.*` and `.dev.vars` files remain
owner-local and untracked.

## Live environments

### Production

| Item            | Current value                                            |
| --------------- | -------------------------------------------------------- |
| Status          | **LIVE**, HTTP 200                                       |
| Worker          | `turkcyber-production`                                   |
| Active version  | `c9976d7b-c7fd-4fa1-930a-0f9e5ec021e3` at 100%           |
| Routes          | `turkcyber.com/*`, `www.turkcyber.com/*`                 |
| HSTS            | enabled                                                  |
| Global noindex  | absent                                                   |
| Search page     | `/ara/` intentionally has page-level `noindex`           |
| Rollback origin | legacy Hostinger origin retained behind the Worker route |

### Staging

| Item           | Current value                                  |
| -------------- | ---------------------------------------------- |
| Status         | healthy, HTTP 200                              |
| Worker         | `turkcyber-staging`                            |
| Active version | `a854e11b-df2c-422b-a009-adf93cc72949` at 100% |
| Host/route     | `turkcyber-staging.dndr.net/*`                 |
| Indexing       | `X-Robots-Tag: noindex, nofollow`              |
| HSTS           | absent, intentionally                          |

Staging and production use distinct Turnstile public keys and separate Worker
secrets/resources.

## Runtime architecture

Astro builds 57 static pages. `worker/index.ts` runs first for every routed
request because `assets.run_worker_first` is enabled, handles dynamic routes,
then serves `dist/` through the `ASSETS` binding. This is required so the
Worker-owned CSP and security headers are applied to static HTML.

Dynamic routes:

- `/collect` — first-party analytics pixel; database writes are deferred and a
  pixel is returned even when analytics fails.
- `/api/comments` — approved-comment reads and moderated comment submissions.
- `/boss/*` — private operational console.
- all other paths — static Astro assets/pages through `ASSETS`.

The contact form remains external and submits only to the configured Formspree
endpoint `https://formspree.io/f/mljrvker`.

## Cloudflare resources

Resource identifiers are non-secret and already tracked in `wrangler.jsonc`.

| Environment | Binding        | Resource                               | ID                                     |
| ----------- | -------------- | -------------------------------------- | -------------------------------------- |
| staging     | `APP_DB`       | `turkcyber-app-staging`                | `b5b90da3-0620-46e5-be5c-0efabff7ce68` |
| staging     | `ANALYTICS_DB` | `turkcyber-analytics-staging`          | `6ed98f3d-e168-4e98-9741-9bd2fb7749ac` |
| staging     | `THROTTLE_KV`  | `turkcyber-turkcyber-throttle-staging` | `fdc6c7f6db5e45638f59629b253c66ad`     |
| production  | `APP_DB`       | `turkcyber-app-production`             | `ed222620-e45f-44bc-81ff-993d0ae0153a` |
| production  | `ANALYTICS_DB` | `turkcyber-analytics-production`       | `88d4d7f8-1062-4023-bded-515151b22774` |
| production  | `THROTTLE_KV`  | production throttle namespace          | `5e366c357bb24886b7de2502a55e7bcc`     |

Both deployed environments have these secret **names** configured:

- `BOSS_USER`
- `BOSS_PASSWORD_HASH`
- `SESSION_SECRET`
- `TURNSTILE_SECRET_KEY`
- `COMMENT_IP_PEPPER`
- `RESEND_API_KEY`

No secret values belong in Git or documentation.

## Migrations

Both APP databases have all six migrations recorded in `app_migrations`:

1. `0001_comments.sql`
2. `0002_comment_indexes.sql`
3. `0003_audit_events.sql`
4. `0004_comment_email.sql`
5. `0005_comment_moderation_metadata.sql`
6. `0006_comment_region_code.sql`

Both analytics databases have `0001_visitor_events.sql` recorded in
`analytics_migrations`. Migrations are append-only; older migration comments
describe the schema at that historical point and are superseded by later
additive migrations.

## Content and public pages

Current content inventory:

| Type              | Count/state                                    |
| ----------------- | ---------------------------------------------- |
| Guides            | 16 published MDX entries                       |
| Myths             | 9 published MDX entries                        |
| Technical         | 6 published MDX entries                        |
| News              | 1 draft template; no fabricated published news |
| Interactive tools | 3 client-only tools                            |
| Categories        | 10, defined once in `src/config/site.ts`       |

Primary public routes include `/`, `/icerikler/`, `/rehberler/`,
`/efsane-mi-gercek-mi/`, `/teknik/`, `/araclar/`, `/haberler/`, `/konular/`,
`/hakkinda/`, `/iletisim/`, `/gizlilik/` and `/ara/`.

Only `status: published` content enters production, RSS, sitemap and search.
`SHOW_UNPUBLISHED` is an explicit local opt-in and defaults closed. Tests build
their own `.test-dist/`; they do not depend on ignored `.env.development` or a
developer's `dist/`.

## Navigation, search and responsive behavior

- The header groups five destinations under **İçerikler**.
- The label is a real `/icerikler/` link; the adjacent chevron toggles the menu.
- Fine-pointer hover, focus, Escape and outside-click paths are supported.
- Explicit toggle state prevents hover/focus from immediately undoing a
  chevron click.
- Mobile uses an accessible drawer; `public/no-js.css` keeps destinations
  reachable without JavaScript.
- Search triggers remain real `/ara/` links without JavaScript.
- With JavaScript, the search dialog closes on Escape or backdrop click, ignores
  clicks inside its panel, restores trigger focus, clears scroll lock and can be
  reopened.
- Mobile checks at 390, 360 and 320 px found no document overflow during the
  release verification.

## Design and brand

The current experience uses restrained security-engineering structure:
framing rails, route boundary, scroll-progress rail, indexed 01–07 homepage
sections, WHOIS dossier, system-map content hub, tool-console framing,
engineering article rails and small Boundary Trace interactions. It avoids
fake telemetry, decorative code noise, gamer/cyberpunk styling and artificial
navigation delays.

The production identity is the owner-approved **Kod Parantezi** raster master
pack:

- canonical metadata: `src/brand/identity.json`
- canonical owner masters: `src/brand/masters/*.png`
- generated display lockup/emblem: `public/brand/*.webp`
- derived 16/32/180/192/512 icons and `public/og/default.png`
- `Logo.astro`, footer and `/boss` consume the same metadata/derivatives
- hash and dimension tests prevent drift

Brand red (`#d71920`, with a higher-contrast red for small UI text/focus) is the
primary brand accent. Green is reserved mainly for semantic success, verified,
human/healthy and approved states. Cyan remains only where it conveys
information/technical meaning, not as the logo identity. The owner may refine
the visual masters later; they are not declared immutable forever.

## SEO and discovery

- canonical URLs, structured data, descriptions and content-aware titles are
  emitted by the Astro layouts.
- `https://turkcyber.com/sitemap.xml`, `/robots.txt`, `/rss.xml` and
  `/search-index.json` are live.
- `/boss` is absent from public discovery, blocked in robots and always private.
- Production is indexable globally; `/ara/` alone is intentionally noindex.
- The site is technically ready for Search Console sitemap submission. Property
  ownership/submission status is an external owner operation and was not
  established by this audit.

## Comments and moderation

Submission order is:

1. same-origin and request validation
2. throttle check
3. Turnstile verification, fail closed
4. pending insert into `APP_DB`
5. throttle increment
6. public HTTP 202 success
7. background owner notification through `ctx.waitUntil()`

Stored comment fields include author, body, status, UTC timestamp, article,
optional email, keyed `ip_hash`, private `comment_ip`, country, city and
`region_code`. `ip_hash` remains the abuse/throttle identifier and cannot be
reversed. Historical comments created before migration 0005 cannot have raw IP
recovered or invented.

The public read query explicitly selects only `id`, `parent_id`,
`display_name`, `body` and `created_at`. It never exposes email, raw IP, IP
hash, country, city or region. Authenticated `/boss/comments/` displays the
private context with `—` fallbacks and supports approve, reject, spam and
delete. Audit events record mutations. A pending-only badge appears across the
boss navigation and is hidden at zero.

Location formatting is shared: US rows render `City, ST` when a real two-letter
region exists; non-US rows use city by default; missing data renders `—`.
Nothing invents a state.

## Resend comment notification

| Item           | Current value                                        |
| -------------- | ---------------------------------------------------- |
| Provider       | Resend                                               |
| Sending domain | `notify.turkcyber.com` (verified; DKIM/SPF verified) |
| From           | `TurkCyber <notifications@notify.turkcyber.com>`     |
| To             | `admin@turkcyber.com`                                |
| Subject        | `TurkCyber — Yeni yorum bekliyor`                    |
| Helper         | `worker/lib/comment-notification.ts`                 |
| Secret name    | `RESEND_API_KEY`                                     |

Notifications include operational moderation context and a link to
`https://turkcyber.com/boss/comments/`. Delivery is secondary: failures are
logged as `comment_notification_failed` with comment id, provider and status,
without private comment content or keys; they cannot reject or roll back the
stored comment.

The provider idempotency key is
`comment-notification/<environment>/<comment-id>`. The real staging test used
`comment-notification/staging/3`; a duplicate replay returned 409 and the owner
confirmed exactly one message. Staging comment 3 was verified in boss and then
deleted safely; its row no longer exists.

Database timestamps remain UTC. Notification presentation uses the configured
`America/Los_Angeles` timezone through `Intl.DateTimeFormat`, including DST.
Example: `2026-08-24T08:57:48.621Z` displays as
`Aug 24, 2026 · 1:57 AM PDT`. Tests cover both PDT and PST.

## Analytics

`ANALYTICS_DB` stores first-party Worker events separately from application
data. New events include UTC timestamp, Los Angeles `local_date`, host/path,
referrer, IP, Cloudflare country/region/city/ASN, device/browser/user agent and
`source='worker'`. `/collect` always returns its GIF and performs D1 writes in
`ctx.waitUntil()`.

Production counts at this snapshot:

- `legacy_analytics_log`: **1,668**
- `worker`: **23** (live count; expected to increase)
- import ledger: 1,668 distinct hashes and event ids, 0 orphaned

The owner-authorized one-time import used `D:\analytics.log`, interpreted in
`America/Los_Angeles` with DST-aware conversion. All 1,668 rows parsed; 0 were
rejected and **no 90-day filter** was applied. Repeated legitimate visits were
preserved. Imported UTC range:
`2025-05-15T00:41:22.000Z`–`2026-08-23T22:55:15.000Z`.

The public privacy commitment remains a maximum 90-day visit-record retention
period. Operational purge is manual in `/boss/system/`, affects only
`visitor_events`, and is not scheduled. The historical import was an explicit
owner-authorized exception; no historical rows were purged during import.

## Boss authentication and privacy

- PBKDF2-SHA256 hashes use the repository's bounded Worker-compatible format.
- Five failed attempts trigger KV-backed lockout.
- The signed `tc_boss` cookie is `Secure`, `HttpOnly`, `SameSite=Lax`, 30-minute
  rolling idle expiry, with an 8-hour absolute anchor.
- State-changing actions require same-origin evidence.
- `Origin: null` is treated as unavailable and may fall back only to a verified
  same-origin Referer; cross-origin and headerless requests remain rejected.
- Every boss response is `no-store` and `noindex, nofollow`.
- Attacker-controlled fields are HTML-escaped before private rendering.

## Security headers and external processors

The Worker applies a strict public CSP. Executable scripts are same-origin
Astro assets plus Cloudflare Turnstile; `script-src` does not contain
`unsafe-inline`. Formspree is allowed only at its exact endpoint in
`form-action` and `connect-src`. `frame-ancestors 'none'`, `object-src 'none'`,
`base-uri 'self'`, `nosniff`, a restrictive permissions policy and a referrer
policy are present. Production alone receives HSTS.

External processors are limited to Cloudflare, Formspree for the contact form,
Resend for private moderation email, and Google Fonts. The public privacy page
is intentionally concise and does not expose a backend-column inventory.

## DNS, mail and rollback

The production Worker route overlays the existing zone/origin configuration;
mail DNS was not changed during cutover. The 2026-08-24 audit recorded:

- root MX record-set count 2, fingerprint
  `7b16544d962c0f51b60165a35c3dff615a0d4fcf726ec98a5379daac007b1942`
- root TXT record-set count 2, fingerprint
  `b3d82304cafa0d954db7626e783f13cc373d02a44b1f46246dd4f01c464378a1`
- `notify.turkcyber.com` TXT count 1, fingerprint
  `30ceeb1f540d635f50c3b09fa5716cd359769f821c9a48889208786d64d95e68`

The dedicated `notify.turkcyber.com` sending subdomain did not migrate or
replace Hostinger root-domain receiving mail.

Rollback for a critical Worker failure is to detach the two production Worker
routes, allowing the retained legacy origin behavior to serve again. Do not
delete D1/KV data or the legacy Hostinger copy during rollback. Route changes
require explicit owner authorization.

## Verification snapshot

Latest completed local verification after the notification-timezone fix:

- Astro check: 0 errors, warnings or hints
- Worker TypeScript: pass
- ESLint: pass
- Prettier: pass
- Vitest: **215/215**, 9 files
- production build: 57 pages
- secret scan: clean, 167 tracked files checked
- `git diff --check`: pass
- staging and production HTTP: 200

## Remaining real work

1. Owner may refine the current logo masters later; integrations should remain
   metadata-driven and must not introduce independent geometry.
2. Confirm Search Console property ownership and submit the live sitemap if the
   owner has not already done so.
3. Continue routine moderation and the manual 90-day analytics-retention check.

There is no known runtime blocker at this snapshot.
