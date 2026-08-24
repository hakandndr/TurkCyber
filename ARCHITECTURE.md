# Architecture

Structural description of the live TurkCyber system. Current deployment facts
are in `CURRENT_STATE.md`; chronological decisions and failed experiments are
in `PROCESS.md`.

## 1. Static publishing behind a Worker

Astro produces a directory-format static site. The Cloudflare Worker is the
public entry point for both production and staging:

```text
request
  -> Cloudflare Worker
       -> exact dynamic route? handle it
       -> otherwise ASSETS.fetch(request)
       -> apply public security headers
```

`wrangler.jsonc` sets `assets.run_worker_first: true`. This is load-bearing.
Without it Cloudflare's static asset layer can answer before the Worker and the
Worker-owned CSP/security headers will be absent from HTML. The release process
found this behavior live even though local and synthetic checks looked correct.

Static publishing preserves the core content boundary: an analytics, comments
or D1 failure must not make an article unavailable. The Worker still provides a
single security and routing layer in front of the static content.

## 2. Runtime route ownership

`worker/index.ts` owns exact pathnames and falls through everything else:

| Route                 | Owner                | Behavior                                 |
| --------------------- | -------------------- | ---------------------------------------- |
| `/collect[/]`         | `routes/collect.ts`  | first-party analytics GIF                |
| `/api/comments[/]`    | `routes/comments.ts` | public approved reads and pending writes |
| `/boss` and `/boss/*` | `routes/boss.ts`     | authenticated private console            |
| every other pathname  | `ASSETS`             | Astro output, favicon and public assets  |

Cloudflare route patterns contain a trailing `*`; path dispatch in the Worker
prevents a broad route pattern from accidentally treating unrelated paths as a
dynamic endpoint.

Production routes are live:

```text
turkcyber.com/*
www.turkcyber.com/*
```

Staging owns `turkcyber-staging.dndr.net/*`. The two environments are separate
Worker deployments with separate bindings and secrets.

## 3. CSP-compatible Astro build

The public `script-src` intentionally excludes `unsafe-inline`. Astro's
component scripts are therefore emitted as same-origin `/_astro/*` assets;
`astro.config.mjs` sets `assetsInlineLimit: 0` to prevent executable component
entrypoints from becoming inline scripts.

The Worker CSP permits:

- same-origin scripts;
- Cloudflare Turnstile scripts/frames;
- Google Fonts styles/fonts;
- the exact Formspree contact endpoint in `form-action` and `connect-src`.

Style attributes/inlined CSS are permitted by `style-src 'unsafe-inline'`;
that does not weaken `script-src`. Static responses receive the CSP only because
the Worker runs first.

## 4. Git-backed content model

Git is the publishing database. `src/content.config.ts` defines four validated
collections: guides, myths, technical and news. Invalid frontmatter fails the
build. There is no CMS, database editor or runtime authoring path.

Publishing is explicit: `status: published` is required for production,
sitemap, RSS and search-index inclusion. `SHOW_UNPUBLISHED` is an opt-in local
gate that defaults closed. The test harness owns a clean `.test-dist/` build so
ignored developer env files and stale `dist/` output cannot change assertions.

Categories are defined once in `src/config/site.ts`; the schema, category pages,
navigation and search all derive from that source.

## 5. Navigation and progressive enhancement

The header has a grouped content architecture. The İçerikler label is an
ordinary link and the chevron is a separate button with its own expanded state.
The controller supports fine-pointer hover intent, focus traversal, Escape,
outside click and breakpoint cleanup. Explicit toggle state prevents focus or
hover from reversing the click that opened the menu.

Mobile navigation is server-rendered and enhanced into a drawer. A small
`public/no-js.css` fallback keeps those destinations reachable when JavaScript
is disabled. Search triggers likewise remain `/ara/` links before becoming a
native dialog. Progressive enhancement never removes the basic path.

## 6. Application and analytics data separation

Two D1 bindings intentionally prevent accidental joins across privacy domains:

```text
APP_DB
  comments
  audit_events
  app_migrations

ANALYTICS_DB
  visitor_events
  analytics_migrations
  legacy_analytics_imports   # production after historical import
```

`APP_DB` is application/moderation state. `ANALYTICS_DB` is private visit
telemetry with a separate manual retention control. The separation is
maintained in queries, migrations, bindings and operational commands.

`THROTTLE_KV` stores short-lived abuse/login counters. It is not a durable
system of record.

## 7. Comments data model

The comments schema evolved additively:

```text
0001 comments + status + ip_hash + country/user_agent
0002 indexes
0003 audit_events
0004 optional email
0005 private comment_ip + city
0006 private region_code
```

All migrations are append-only. Historical rows remain valid because new
fields are nullable.

The keyed `ip_hash` and raw `comment_ip` have different roles:

- `ip_hash`: HMAC using `COMMENT_IP_PEPPER`, abuse correlation/throttling,
  intentionally irreversible;
- `comment_ip`: new-comment moderation context visible only in boss.

No existing HMAC can be reversed to backfill old rows. The public read query
uses a fixed safe-column allowlist and cannot expose email, raw/hash IP or
location metadata.

## 8. Comment submission and notification

```text
validate same-origin + input
  -> check KV throttle
  -> verify Turnstile (fail closed)
  -> INSERT pending comment in APP_DB (UTC timestamp)
  -> increment throttle
  -> return HTTP 202
  -> ctx.waitUntil(send Resend notification)
```

Comment persistence is the primary transaction. The email send is a secondary
background side effect registered only after a successful insert. Provider or
network failure is caught and logged safely and cannot roll back or change the
comment or public response.

`worker/lib/comment-notification.ts` calls the Resend HTTPS API. Its stable
idempotency identity is
`comment-notification/<environment>/<comment-id>`. It includes private
moderation context only in mail to the configured owner recipient; it exposes
none of that data through the public comments API.

Stored timestamps stay UTC. Owner email formatting uses the configured IANA
timezone (`America/Los_Angeles`) and runtime timezone data, so PST/PDT are
resolved by date rather than a fixed offset.

## 9. Location model

Cloudflare supplies request metadata. New analytics events store `country`,
`region` and `city`; new comments store `country`, `region_code` and `city`.
`worker/lib/location.ts` is the shared private-console/email formatter:

- US plus a valid region: `City, ST`;
- non-US: city by default;
- missing city: `—`.

Legacy imported analytics keep their supplied city strings, such as
`Santa Ana, CA`, and do not receive invented region values.

## 10. Analytics write path

`/collect` returns a fixed 1x1 GIF immediately. The D1 write is passed to
`ctx.waitUntil()` and failure is swallowed after safe logging. Response headers
carry a diagnostic write status; a missing or failing database never turns the
beacon into a broken resource.

Worker events store UTC `occurred_at` and an application-computed
`local_date` in `ANALYTICS_TIMEZONE`. SQLite is not asked to guess DST offsets.
Device/browser parsing is intentionally simple and the raw user agent is kept
for private operational analysis.

## 11. Legacy analytics import

The one-time production source was `D:\analytics.log`:

```text
IP | local timestamp | country | city | device/browser
```

`scripts/import-legacy-analytics.mjs` is read-only by default. It validates the
actual five-field format, interprets local timestamps through the
`America/Los_Angeles` IANA zone, rejects impossible/nonexistent/ambiguous times,
and emits SQL only to an explicitly requested path outside the repository.

Repeated legitimate rows receive occurrence ordinals before deterministic
hashing, so they remain distinct while an identical multiset is idempotent.
The `legacy_analytics_imports` ledger maps each record hash to one event id.
Generated SQL is additive and has no delete statement.

The owner authorized all 1,668 valid rows with no age filter. Existing
`source='worker'` rows and APP_DB were untouched. The operational 90-day purge
still exists separately; it was not silently applied to migration input.

## 12. Manual retention

The public policy promises a maximum 90-day visitor-record window. The current
enforcement path is manual in `/boss/system/`:

1. query total/oldest/newest/count past cutoff;
2. show exact delete count;
3. require a typed confirmation phrase;
4. delete only old `visitor_events` from `ANALYTICS_DB`;
5. write an audit event.

There is no cron or automatic purge. Documentation and public policy must not
claim automation.

## 13. Boss authentication and rendering

The boss console uses repository-generated PBKDF2-SHA256 password hashes and a
signed, stateless session cookie. The Worker-compatible PBKDF2 maximum is
100,000 iterations. KV throttles failed login attempts.

The session cookie is `Secure`, `HttpOnly`, `SameSite=Lax`; it has a rolling
30-minute idle deadline and an 8-hour absolute sign-in anchor. Every private
response is `no-store` and `noindex, nofollow`.

State-changing requests need same-origin evidence. Browser form navigation may
send `Origin: null`; this is treated as unavailable, then a same-origin Referer
may be used. A private `same-origin` referrer policy preserves that evidence.
Cross-origin and headerless requests remain rejected.

Boss HTML is generated in the Worker. Every database/request value is escaped
because analytics and comments are attacker-controlled. The UI provides
overview, analytics, moderation and system views. Pending comment count is
computed for every shell and rendered as a navigation badge only above zero.

## 14. Brand asset architecture

Owner-approved raster masters are canonical. `src/brand/identity.json` records
master filenames, roles, dimensions, hashes, an aggregate fingerprint, derived
outputs and safe-area ratios.

```text
owner PNG masters
  -> validate hashes/dimensions
  -> remove only near-transparent edge noise
  -> crop/scale/pad
  -> lockup/emblem WebP
  -> favicon/app PNG
  -> OG composition using the owner lockup
```

`Logo.astro`, footer and `boss-views.ts` consume recorded derivatives. Tests
prohibit duplicate hand-drawn SVG geometry and verify dimensions/hashes.

The site token system uses brand red for branded interaction/structure, green
for success/approved/verified state, and cyan only for information/technical
semantics. The broader security-engineering visual system is structural rather
than decorative: framing rails, indexed sections, system maps, engineering
notes and restrained Boundary Trace transitions.

## 15. External services and trust boundaries

| Service      | Purpose                                | Data boundary                        |
| ------------ | -------------------------------------- | ------------------------------------ |
| Cloudflare   | DNS, Worker, Assets, D1, KV, Turnstile | public/runtime platform              |
| Formspree    | contact form                           | user-entered contact submission      |
| Resend       | owner comment notification             | private moderation metadata in email |
| Google Fonts | font delivery                          | ordinary browser request             |

Resend uses the dedicated `notify.turkcyber.com` sending subdomain. Root-domain
Hostinger receiving-mail DNS remains separate.

## 16. Deployment and rollback architecture

Staging and production are named Wrangler environments with their own bindings,
secrets, public Turnstile keys and routes. Static builds embed the correct
environment public key; the secret stays in Worker secret storage.

The production Worker route overlays the retained legacy Hostinger origin.
Critical rollback options are:

- deploy/roll back to a known-good Worker version while routes remain attached;
- detach only the two production Worker routes to expose the legacy origin.

D1, KV, imported analytics and mail DNS are not deleted or reverted as part of
route rollback. Every production routing action needs owner authorization.

## 17. Deliberate non-goals

- no CMS or runtime editor;
- no fabricated news or vendor-private behavior;
- no automatic analytics retention job;
- no per-article OG pipeline;
- no Cloudflare Access dependency for boss auth;
- no analytics import into APP_DB;
- no logo animation, boot overlay or artificial navigation delay;
- no shield/lock/gamer/cyberpunk identity layer.
