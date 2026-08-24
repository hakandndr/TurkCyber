# TurkCyber operational handoff

This is the zero-context operations handbook for the live TurkCyber service.
For the shortest current snapshot see `CURRENT_STATE.md`; for design rationale
see `ARCHITECTURE.md`; for security boundaries see `SECURITY.md`; for history
see the append-only `PROCESS.md`.

## 1. Product

TurkCyber is a Turkish-language digital-security publication operated as a DNDR
Labs project. It explains concrete account, device, fraud and privacy problems
for ordinary readers, while maintaining a separate technical lane for readers
who want protocol, architecture, trust-boundary and failure-mode depth.

Content rules:

- solve one real problem at a time;
- do not fabricate news, statistics, vendor internals or interface labels;
- distinguish public vendor behavior, an industry-standard explanatory model
  and unknown/private internals;
- keep the public voice Turkish, but code/schema/documentation English;
- Git is the content store; there is no CMS.

## 2. System diagram

```text
Browser
  |
  v
Cloudflare DNS / Worker routes
  |
  v
Cloudflare Worker (run_worker_first)
  |-- static Astro build through ASSETS
  |-- /collect --------------------------> ANALYTICS_DB
  |-- /api/comments ---------------------> APP_DB
  |       |-- Turnstile verification
  |       |-- THROTTLE_KV
  |       `-- ctx.waitUntil -------------> Resend
  `-- /boss/*
          |-- signed session + THROTTLE_KV
          |-- comments/audit ------------> APP_DB
          `-- analytics/retention --------> ANALYTICS_DB

/iletisim/ ------------------------------> Formspree
```

Astro output is static. Dynamic failure must not make articles unreadable:
comments degrade to a notice and analytics always returns its pixel. The Worker
still runs first so it can apply CSP/security headers before forwarding static
responses from `ASSETS`.

## 3. Live environments

### Production

- URL: `https://turkcyber.com`
- alternate routed host: `https://www.turkcyber.com`
- Worker: `turkcyber-production`
- routes: `turkcyber.com/*`, `www.turkcyber.com/*`
- active version at this handoff:
  `c9976d7b-c7fd-4fa1-930a-0f9e5ec021e3` (100%)
- status: live and HTTP 200

### Staging

- URL: `https://turkcyber-staging.dndr.net`
- Worker: `turkcyber-staging`
- route: `turkcyber-staging.dndr.net/*`
- active version at this handoff:
  `a854e11b-df2c-422b-a009-adf93cc72949` (100%)
- all responses carry `X-Robots-Tag: noindex, nofollow`

Production changes, route changes and DNS changes require explicit owner
authorization. Staging and production have separate D1, KV, Turnstile and
secret values.

## 4. Repository and Git state

Clone:

```powershell
git clone https://github.com/hakandndr/TurkCyber.git
```

`main` is the authoritative default and ongoing-development branch. The local
repository is `D:\IT\turkcyber\turkcyber.com` and should normally be on `main`
tracking `origin/main`.

Rewritten live implementation commit:
`800a2fba80adb0b313ffca2f6f0e39ab081e6ac2`
(`chore(release): record live production routing`). The rewritten recovery proof
before the archive-removal documentation is
`0a11ce94464b1a968fea4ad315da137e5feb0ac3`.

The deployed post-launch source has been recovered into coherent commits and the
working tree is clean after finalization. A fresh checkout of this branch therefore
contains the brand masters/outputs, migrations, moderation and notification runtime,
legacy importer, live route configuration, tests and current documentation needed to
reproduce the live source state.

The preserved recovery milestone is `codex/recovery-2026-08-23` at
`b7867ae6722d567f7ef90e85c62bbd7d2d970278`, tracking the same-named remote
branch. It records the clean rewrite proof and pre-public sanitation entry; ongoing
documentation after GitHub publication belongs only on `main`.

The first push attempt was stopped before any remote write because historical
`turkcyber-pass2.tar.gz` contained a nested working copy. The unpublished history
was then rewritten only to remove that path. All reachable commits are now free of
the archive, nested `.git` paths and tracked `.env.development`; the source trees
and logical commit sequence were preserved. The pre-rewrite graph is recoverable
from the verified external bundle under the Codex visualization snapshot area.

The annotated `production-live-2026-08-24` tag identifies the exact deployed
source commit `800a2fba80adb0b313ffca2f6f0e39ab081e6ac2`. It intentionally
precedes later documentation-only commits.

The only workflow in `.github/workflows/ci.yml` runs secret scanning, checks,
linting, tests and builds. It contains no Wrangler or deployment step. Pushing Git
does not deploy staging or production; Cloudflare operations remain separate,
explicitly authorized actions.

## 5. Repository map

```text
astro.config.mjs             static Astro build and no-inline-script policy
wrangler.jsonc               Worker assets, environments, bindings and routes
src/
  brand/                     canonical owner raster masters + identity metadata
  components/                header, footer, comments, cards, logo
  config/                    site/taxonomy/tool configuration
  content/                   guides, myths, news and technical MDX
  layouts/                   base, article and tool shells
  lib/                       content, search, SEO and tool logic
  pages/                     static routes and generated XML/JSON endpoints
  styles/                    semantic and brand design tokens
public/
  brand/                     derived lockup/emblem WebP
  no-js.css                  progressive-enhancement navigation fallback
  og/default.png             default social card
  favicon-*.png              16/32 px emblem outputs
worker/
  index.ts                   dynamic routing, ASSETS fallback, security headers
  routes/                    collect, comments, boss and boss views
  lib/                       auth, time, location, throttling, Turnstile, Resend
migrations/
  app/                       comments/audit migrations 0001-0006
  analytics/                 visitor_events migration 0001
scripts/
  import-legacy-analytics.mjs safe analytics parser/SQL generator
  hash-password.mjs          Worker-compatible PBKDF2 hash generator
  brandmark.py               validates/crops owner masters
  generate-icons.py          derived display/icon outputs
  generate-og-default.py     OG output using owner lockup
  scan-secrets.mjs           tracked-file secret scanner
tests/                       Vitest; global setup owns .test-dist
```

## 6. Local development

Requirements: Node 20 or newer and pnpm 9.15.4 (declared in `package.json`).

```powershell
pnpm install
pnpm dev
```

`pnpm dev` serves Astro only. To exercise Worker routes locally:

```powershell
pnpm build
pnpm preview
```

Use local D1 migrations through:

```powershell
pnpm db:app:local
pnpm db:analytics:local
```

The base `wrangler.jsonc` development IDs intentionally remain
`REPLACE_WITH_DEV_*`; this is current reference wording, not a staging or
production blocker. Never copy deployed IDs into the development placeholders
without deciding to provision a development environment.

### pnpm execution note

The installed pnpm store can occasionally differ from the Codex runtime pnpm
store and trigger a non-interactive modules-directory replacement prompt. Do
not purge `node_modules` during recovery. Use the existing project binaries in
`node_modules/.bin` when necessary, or run pnpm from the owner's normal shell.

## 7. Build and verification

Canonical workflow:

```powershell
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm scan:secrets
git diff --check
```

`pnpm check` covers Astro plus `tsconfig.worker.json`. `pnpm lint` runs ESLint
and Prettier. `pnpm test` is hermetic: `tests/global-setup.ts` deletes and
rebuilds `.test-dist/` every time; tests do not trust `dist/`, ignored local env
files or module-scope filesystem reads.

Last verified result: 215/215 tests across 9 files, 57 built pages, zero Astro
diagnostics, clean type/lint/format/secret/diff checks.

When building for a deployed environment, set that environment's public
Turnstile site key only for the build process. The Turnstile secret key is a
Worker secret and must never enter static output.

## 8. Content workflow

Collections are defined in `src/content.config.ts`:

| Collection  | Route                   | Purpose                         |
| ----------- | ----------------------- | ------------------------------- |
| `guides`    | `/rehberler/`           | concrete, actionable problems   |
| `myths`     | `/efsane-mi-gercek-mi/` | a claim and visible verdict     |
| `technical` | `/teknik/`              | engineering/security boundaries |
| `news`      | `/haberler/`            | sourced current news only       |

Create content under `src/content/<collection>/<slug>.mdx`. Frontmatter schema
validation fails the build. Only `status: published` ships. Draft preview uses
an explicit `SHOW_UNPUBLISHED=true` local opt-in; it defaults closed and tests
guard clean-checkout behavior.

Categories are defined once in `src/config/site.ts`. Do not duplicate taxonomy
in navigation, content schemas or search code.

## 9. Navigation and search

`Header.astro` owns the grouped İçerikler navigation. The text label is a real
link and the chevron is a separate toggle. Hover is fine-pointer-only; focus,
Escape, outside click, breakpoint cleanup and mobile drawer behavior are
implemented. Explicit toggle state avoids a historical bug in which focus/hover
could immediately reverse a chevron click.

`public/no-js.css` keeps mobile destinations visible when JavaScript is absent.
Search triggers remain real `/ara/` links. With JavaScript, they open a native
dialog backed by `/search-index.json`. Escape and backdrop click close it;
inside clicks do not; focus and scroll state are restored.

## 10. SEO and discovery

`BaseLayout.astro`, `ArticleLayout.astro` and `src/lib/seo.ts` produce canonical
URLs, meta descriptions, content-aware titles and structured data. Live
endpoints:

- `https://turkcyber.com/sitemap.xml`
- `https://turkcyber.com/robots.txt`
- `https://turkcyber.com/rss.xml`
- `https://turkcyber.com/search-index.json`

Production is globally indexable. `/ara/` is intentionally page-level
`noindex`. `/boss` is private, absent from the sitemap and disallowed by
robots. Search Console property verification/submission remains an owner-side
external check.

## 11. Comments: submission and schema

Submission flow:

1. browser form sends JSON to `/api/comments`;
2. Worker validates same-origin evidence and bounded input;
3. KV throttle state is checked;
4. Turnstile is verified and fails closed;
5. comment is inserted as `pending` in `APP_DB` with a UTC timestamp;
6. throttle state is incremented;
7. Worker returns normal HTTP 202 success;
8. notification is registered with `ctx.waitUntil()`;
9. owner moderates in `/boss/comments/`.

APP migrations:

| Migration | Effect                                                           |
| --------- | ---------------------------------------------------------------- |
| 0001      | comments, moderation status, keyed `ip_hash`, country/user agent |
| 0002      | public/moderation/thread/IP-hash indexes                         |
| 0003      | boss mutation audit trail                                        |
| 0004      | optional private `email`                                         |
| 0005      | nullable private `comment_ip` and `city`                         |
| 0006      | nullable private `region_code`                                   |

Migrations are append-only. The 0001 comment saying no raw IP describes the
original schema; 0005 intentionally adds raw IP for new comments only.
Historical HMAC hashes cannot be reversed and old rows stay null.

## 12. Public/private comment boundary

The public `GET /api/comments` SQL explicitly selects:

- `id`
- `parent_id`
- `display_name`
- `body`
- `created_at`

Never replace it with `SELECT *`. Public responses must not contain `email`,
`comment_ip`, `ip_hash`, `user_agent`, `country`, `city`, `region_code` or
moderation notes.

The authenticated moderation view may display email, raw IP and available
location. Missing fields render `—`. US location is `City, ST` only when
Cloudflare supplied a valid two-letter region; non-US defaults to city. No
location data is invented.

## 13. Moderation console

Routes:

- `/boss/login/`
- `/boss/`
- `/boss/analytics/`
- `/boss/comments/`
- `/boss/system/`

Moderation actions: approve, reject, spam and delete. Every mutation is
same-origin, authenticated and audited. The pending-comment badge is displayed
across all console pages only when the count is greater than zero and includes
an accessible label.

Every private response is `no-store` and `noindex, nofollow`. All database
values are HTML-escaped.

## 14. Boss authentication

- `BOSS_PASSWORD_HASH` uses the repository's
  `pbkdf2$<iterations>$<salt>$<hash>` format with SHA-256.
- Worker PBKDF2 is capped at 100,000 iterations.
- `THROTTLE_KV` locks login after five failures.
- signed cookie name: `tc_boss`.
- attributes: `Secure; HttpOnly; SameSite=Lax; Path=/`.
- rolling idle expiry: 30 minutes.
- absolute session anchor: 8 hours.

The real-browser launch bug matters operationally: a form navigation produced
`Origin: null`; the private page's former no-referrer policy suppressed the
Referer, so the Worker rejected the request before credential verification.
Synthetic tests had manually supplied headers and missed it. Current behavior
treats `Origin: null` as unavailable, accepts only a verified same-origin
Referer fallback, uses `Referrer-Policy: same-origin` on private pages, and
still rejects cross-origin or headerless state-changing requests.

## 15. Resend notifications

Current configuration:

- provider: Resend
- verified sending domain: `notify.turkcyber.com`
- sender: `TurkCyber <notifications@notify.turkcyber.com>`
- recipient: `admin@turkcyber.com`
- subject: `TurkCyber — Yeni yorum bekliyor`
- secret name: `RESEND_API_KEY`
- helper: `worker/lib/comment-notification.ts`
- moderation URL: `https://turkcyber.com/boss/comments/`

The email contains comment id/status, author, optional email, private IP,
location, owner-formatted timestamp, article/path, excerpt and moderation link.
It never contains secrets, hashes, passwords or Turnstile tokens.

Persistence is primary; email is secondary. A provider/network failure is
caught inside the waitUntil task, logs only
`comment_notification_failed`, comment id, provider and status, and never
changes the public success response or database row.

Idempotency key:
`comment-notification/<environment>/<comment-id>`. Real staging comment 3 used
`comment-notification/staging/3`; a replay returned 409 and the owner confirmed
one email. The row was later deleted safely.

UTC stays canonical in D1. Email presentation uses
`ANALYTICS_TIMEZONE=America/Los_Angeles` through `Intl.DateTimeFormat`, not a
fixed offset. Both PDT and PST are covered by tests.

### Rotate `RESEND_API_KEY`

1. Create a replacement send-only key in Resend.
2. Update staging with `wrangler secret put RESEND_API_KEY --env staging`.
3. Deploy/test one clearly labelled staging comment and verify exactly one mail.
4. Update production with `wrangler secret put RESEND_API_KEY --env production`.
5. Deploy production without changing routes.
6. Revoke the old key only after both environments are verified.

Never print the key or pass it as a command argument.

### Disable notifications safely

Removing the secret makes the deployed Worker log `not_configured` after a
successful comment insert; comments still persist. Prefer a planned code/config
change verified in staging, because silent unplanned removal reduces operator
awareness. Do not alter comment persistence to disable email.

### Diagnose delivery failures

1. confirm the pending comment exists in `/boss/comments/`;
2. search Worker logs for `comment_notification_failed` and the comment id;
3. confirm the secret name exists with `wrangler secret list`;
4. inspect Resend delivery/domain status;
5. retry only with the same idempotency identity if a retry is justified.

## 16. Analytics and import

`/collect` stores first-party events in `ANALYTICS_DB` with
`source='worker'`. It records UTC time, Los Angeles local date, host/path,
referrer, IP, Cloudflare country/region/city/ASN and parsed device/browser. The
pixel response never waits for D1 and never becomes an article error.

Production also contains 1,668 rows from `D:\analytics.log` with
`source='legacy_analytics_log'`. Source format:

```text
IP | YYYY-MM-DD HH:mm:ss | country | city | device/browser
```

The parser treats source timestamps as `America/Los_Angeles`, rejects
nonexistent/ambiguous DST times, preserves repeated visits with occurrence
ordinals, and generates deterministic hashes. A
`legacy_analytics_imports` ledger makes reruns idempotent while leaving existing
Worker rows untouched.

Import reconciliation:

- source 1,668; valid 1,668; malformed 0; age-filtered 0;
- no 90-day filter was applied to this owner-authorized historical import;
- 15 repeated source rows were preserved;
- ledger 1,668 distinct hashes/events, 0 orphans;
- UTC range `2025-05-15T00:41:22.000Z` to
  `2026-08-23T22:55:15.000Z`.

Do not rerun an import from guessed input. Inspect the supplied source first,
generate SQL outside the repository, reconcile dry-run counts, obtain owner
approval, then execute and repeat the reconciliation.

## 17. Retention

The public policy says visit records are kept no more than 90 days. Current
implementation is manual, not scheduled. `/boss/system/` shows total/old/new
and rows older than the cutoff, requires an explicit confirmation phrase, and
deletes only from `visitor_events` in `ANALYTICS_DB` while writing an audit
event.

The historical 1,668-row migration was an explicit one-time exception: its
full history was imported without an age filter. Do not silently apply a
retention rule to a future historical import, and do not describe the exception
as an automatic policy change.

## 18. Cloudflare inventory

| Env        | APP_DB                                                              | ANALYTICS_DB                                                              | THROTTLE_KV                        |
| ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| staging    | `turkcyber-app-staging` / `b5b90da3-0620-46e5-be5c-0efabff7ce68`    | `turkcyber-analytics-staging` / `6ed98f3d-e168-4e98-9741-9bd2fb7749ac`    | `fdc6c7f6db5e45638f59629b253c66ad` |
| production | `turkcyber-app-production` / `ed222620-e45f-44bc-81ff-993d0ae0153a` | `turkcyber-analytics-production` / `88d4d7f8-1062-4023-bded-515151b22774` | `5e366c357bb24886b7de2502a55e7bcc` |

APP migrations 0001–0006 and analytics migration 0001 are applied in both
environments.

Secret names in both environments:
`BOSS_USER`, `BOSS_PASSWORD_HASH`, `SESSION_SECRET`,
`TURNSTILE_SECRET_KEY`, `COMMENT_IP_PEPPER`, `RESEND_API_KEY`.

The public Turnstile site key is supplied at build time; secret verification
uses the Worker secret. Staging and production keys are distinct.

## 19. DNS, mail and external processors

Production cutover attached Worker routes; it did not migrate receiving mail.
Hostinger root MX/SPF/DKIM must not be changed casually. Resend uses only the
dedicated `notify.turkcyber.com` sending subdomain; its DKIM and SPF were
verified through Resend's Cloudflare integration.

External processors:

- Cloudflare: DNS, Worker, Assets, D1, KV and Turnstile;
- Formspree: contact-form delivery at the exact configured endpoint;
- Resend: private moderation notification mail;
- Google Fonts: public font delivery.

## 20. Brand operations

The owner raster master pack is canonical, not generated SVG geometry.
`src/brand/identity.json` records master paths, roles, dimensions, hashes,
derived paths and the aggregate fingerprint. `scripts/brandmark.py` validates
and crops/scales only; it must not redraw the logo.

Usage:

- header and `/boss`: horizontal lockup derivative;
- footer: emblem derivative;
- favicon: 16/32 optical-emblem rasters;
- app icons: 180/192/512 emblem outputs;
- OG: owner lockup composited into the approved layout.

Red is the brand accent. Green is semantic success/verified state. Cyan is
limited to informational/technical semantics. Owner-supplied replacement
masters may be integrated later by updating metadata and regenerating outputs;
do not create a competing mark.

## 21. Security rules that must survive maintenance

- keep APP_DB and ANALYTICS_DB separate;
- keep Worker-first asset handling while the Worker owns headers;
- never add `unsafe-inline` to `script-src`;
- keep Formspree permissions endpoint-specific;
- bind every request-derived SQL value;
- escape every database value rendered in boss;
- keep Turnstile fail-closed and rate limits KV-backed;
- keep the public comment column allowlist explicit;
- never log secret values or private comment content in email failures;
- keep session idle/absolute semantics and cookie flags;
- migrations are append-only;
- database timestamps remain UTC; convert only at presentation;
- production route/DNS/mail changes require explicit owner authorization.

See `SECURITY.md` for the full threat model.

## 22. Rollback

For a critical Worker regression:

1. record the failing version and symptoms;
2. detach only `turkcyber.com/*` and `www.turkcyber.com/*` Worker routes, or
   roll back to a known-good Worker version if routing remains healthy;
3. verify legacy Hostinger origin behavior returns;
4. do not delete production D1, KV, imported analytics or comments;
5. preserve mail DNS unchanged;
6. fix and verify in staging before reattaching routes.

Route detachment is a production mutation and requires owner authorization.
Hostinger must remain available until the owner explicitly retires the rollback
path.

## 23. Immediate next work

1. work from clean `main` tracking `origin/main`;
2. confirm Search Console sitemap submission if not already done;
3. continue moderation and manual retention operations;
4. keep the recovery branch and production-live tag as immutable milestones.
