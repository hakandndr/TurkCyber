# Current state

## Verified outbound release — 2026-10-06

Production Worker `turkcyber-production` is `b82a646f-8fb3-4888-b646-99e8039403e6`; rollback `01fae4db-dcd1-4e49-ba39-1a3569c21aa2`. The same-origin `POST /__analytics/outbound` validates the request and records one immutable source `outbound_events` row before best-effort Service Binding forwarding. Only binding props assign `prd_turkcyber_binding`. Analytics migration `0002_outbound_events.sql` adds this separate table; all 1,758 pre-existing `visitor_events` rows were preserved. APP_DB, PAGE collection, Boss queries, public source assets and retention are unchanged. The browser component is added at response time.

A controlled automated activation and same-ID replay returned 204 twice, stored one local row and one central OUTBOUND_CLICK, with central PAGE 90 before/after and source PAGE 1,758 before/after. Queries/fragments are absent from the destination. `pnpm check`, `pnpm lint`, `pnpm test` (228 passed), `pnpm build` and `pnpm scan:secrets` passed; production dry-run and provider version readback passed. Anonymous Boss remains 401; authenticated visual acceptance was not repeated.

Historical: the dated releases below remain their own checkpoints. Planned: no retention or panel replacement. Unknown: current Workers Builds trigger readback requires permission unavailable to the current CLI session; no zero-trigger claim follows from that. Re-read provider state before the next mutation.

Authoritative snapshot of TurkCyber. Live runtime values were observed on
**2026-08-24 04:10 PDT** (11:10 UTC); the Worker versions and analytics
counts were re-read for the DNDR integration safety baseline on
**2026-10-01 07:01 UTC**, and the source-control section was re-verified the
same day after the local ref cleanup. Repository and live runtime checks
supersede earlier planning documents and historical `PROCESS.md` entries.

## Headline

**Production is live. Staging is healthy.** Cloudflare Worker routes serve the
static Astro site and dynamic services at both environments. Production data,
comments, moderation, analytics, Turnstile and Resend notifications are active.

The deployed post-launch brand, runtime, migration, notification, importer and
routing source is represented by coherent local commits. Before the first public
push, a narrowly authorized rewrite removed the retired
`turkcyber-pass2.tar.gz` transfer archive from every reachable commit. Two
further metadata-only rewrites followed on 2026-08-29 (co-author trailer
removal, then commit-email normalization) and **were published successfully**.
All rewritten source trees are byte-identical to their pre-rewrite counterparts
and the public-history audit is clean. `main` is authoritative and normally
tracks `origin/main`; the release tag is published, and the former recovery
branch was retired on 2026-10-01. The GitHub Actions CI workflow is green at
the published baseline.

## DNDR Analytics production — 2026-10-04

- **Production Worker** `turkcyber-production`
  `01fae4db-dcd1-4e49-ba39-1a3569c21aa2` (deployed 2026-10-03 23:58 UTC with
  Wrangler 4; previous `c9976d7b-c7fd-4fa1-930a-0f9e5ec021e3`). Built from
  branch `release/dndr-production-2026-10` (`cf7c2bd`): the deployed
  `d23887b` plus the DNDR forwarder and its production enablement only. Every
  public file (102 plus the 404 page) is byte-identical to before the deploy;
  the static files were pinned to the previously live bytes because two
  local builds order equal-date cards differently.
- **What changed:** after a page view is stored in `ANALYTICS_DB`, the Worker
  also sends a copy to DNDR Analytics through the `DNDR_COLLECTOR` Service
  Binding (`dndr-collector#ProducerApi`, `props.producerId =
prd_turkcyber_binding`), in `waitUntil`, best effort. `ANALYTICS_DB` and the
  Boss stay the authority; nothing here depends on DNDR.
- **Native start in DNDR:** 2026-10-03T23:59:10.829Z (row 1753). Rows 1750–1752
  were refused by DNDR before the Wrangler 4 redeploy (the first deploy used
  the pinned Wrangler 3, which drops the binding's `props`).
- **History:** DNDR imported this database's page views once (83 worker rows;
  the 1,668 earlier-log rows have no page and are kept in DNDR's ledger as
  such). Nothing here was changed or deleted.
- **Rollback:** `npx wrangler@4 rollback c9976d7b-c7fd-4fa1-930a-0f9e5ec021e3 --env production`,
  or DNDR disables `prd_turkcyber_binding` (no change here).
- **Baseline:** `D:\IT\_backups\dndr-control-plane\turkcyber.com\20261003T2347Z_production-baseline`.

## Repository hygiene — 2026-10-01

A validated local safety baseline of the repository, its Workers and its four
D1 databases was captured before this change. The repository was then cleaned
of tool-specific artifacts, with no application, runtime, provider or data
change:

- the former tool-specific working-rules file was retired; its project rules
  now live in `HANDOFF.md` §24, §21 and §23 and `ARCHITECTURE.md` §4 and §10;
- the four owner master PNGs no longer carry an embedded content-credential
  chunk. Their decoded pixels are identical, so `src/brand/identity.json`
  records new byte hashes and a new aggregate fingerprint, and the six derived
  PNGs carry the new fingerprint in their `TurkCyberIdentity` text chunk, again
  with identical pixels. Source filenames are recorded neutrally;
- the former recovery branch was retired (its head is an ancestor of `main`);
  local tool checkpoint refs were removed. The local `filter-branch` backup
  refs (`refs/original/*`) were removed in a follow-up the same day, after
  their three ref values were matched against the separately verified
  `refs/original` bundle in the safety baseline. The repository now has only
  `main`, its remote-tracking refs and the release tag.

The derived public PNGs differ from the deployed ones only in that metadata
chunk; production keeps serving the previous bytes until the next deploy.
Analytics retention was not touched.

## DNDR integration safety baseline — 2026-10-01

TurkCyber is the first property after `dndr.net` to be prepared for the DNDR
control plane. Before any integration change, a validated safety baseline was
captured at **2026-10-01T07:01Z**:

- owner-held archive
  `D:\IT\_backups\dndr-control-plane\turkcyber.com\20261001T0701Z_phase1a-baseline.7z`,
  SHA-256 `1E7592AF29052EABB031284E7672784B6C1850750EC48CD90496F2E2AD40C686`,
  validation passed; intentionally unencrypted by owner decision, never
  committed or published;
- Git at baseline: `main` = `origin/main` =
  `bcbc46be940aa2a4ed9b5ab1e03341b3456abd86` (pre-cleanup), plus a separately
  verified bundle of `refs/original/*`; the hygiene commit `cc97f34` followed
  and is the current published `main`;
- Workers at baseline: `turkcyber-production`
  `c9976d7b-c7fd-4fa1-930a-0f9e5ec021e3`, `turkcyber-staging`
  `a854e11b-df2c-422b-a009-adf93cc72949` — the same versions as the
  2026-08-24 snapshot below;
- all four D1 databases (application and analytics, production and staging)
  were exported as-is, with schema hashes, Time Travel bookmarks and zero
  pending migrations, and validated by reconciliation against live counts;
- analytics at baseline: `legacy_analytics_log` rows **1,668**, import ledger
  **1,668**.

**No 90-day retention cleanup was performed**, before, during or after the
baseline. Retention cleanup remains owner-controlled and deferred.

Integration terms (DNDR `docs/CONTROL-PLANE.md`, decision A45): the
integration is additive; this application remains authoritative for its own
data; the existing Boss and the existing analytics stay operational through
dual-write and parity; there is no production cutover without measured parity;
every production step is separately approved.

**Staging dual-write — live on staging since 2026-10-01T10:29:44Z.** The
analytics beacon forwards each stored `visitor_events` row to DNDR's
collector over the `DNDR_COLLECTOR` Service Binding
(`dndr-collector-staging#ProducerApi`, `props.producerId =
prd_turkcyber_staging_binding`), in staging only (`worker/lib/dndr-forward.ts`).
Verified on staging the same day:

- staging Worker `df4418f5-b842-42b0-92cb-99665507bcd6` (was `a854e11b…`),
  deployed with Wrangler 4.112.0; a fresh staging snapshot (versions,
  bookmarks, both staging database exports) was taken first;
- every forwarded event arrived in DNDR with the binding's producer and
  `producer_event_id = visitor_events:<id>`; seven controlled pilot page views
  (rows 53–59) matched one-to-one — exact parity: missing 0, unexpected 0,
  duplicates 0, disagreements 0;
- `visitor_events` is still written first and unchanged; with DNDR's producer
  disabled, a visit was stored here (row 60) and refused only by DNDR; the
  visitor always received the pixel;
- public pages answer 200, the comments API answers, `/boss` answers its login
  page; the signed-in Boss and analytics panel are left to the owner's check.

Production has no binding and the code refuses to forward outside staging. No
retention change.

## Repository

Published baselines verified 2026-10-01 against `git ls-remote origin`. These
are the last verified published values, not a claim about the local working
state at the moment you read this — see "Determining publication state" below.

|           |                                                                                |
| --------- | ------------------------------------------------------------------------------ |
| Remote    | `https://github.com/hakandndr/TurkCyber.git`                                   |
| Default   | `main`                                                                         |
| `main`    | authoritative; last verified published baseline `cc97f34`                      |
| Recovery  | former recovery branch (head `eb2c0dd`) retired 2026-10-01; ancestor of `main` |
| Tag       | `production-live-2026-08-24` → object `15376b0`, commit `d23887b` — published  |
| Identity  | `Hakan Dundar <hakan@dndr.net>` (author, committer and tagger)                 |
| Reachable | 27 commits, all at the canonical identity                                      |
| CI        | green at baseline `491f06b` (GitHub Actions `CI`, conclusion `success`)        |

### Canonical Git identity

**`Hakan Dundar <hakan@dndr.net>`.** Set in repository-local config
(`git config --local`), used by every reachable commit and by the annotated
tag's tagger field.

`hakandundar@gmail.com` is **retired for this repository**. It was the previous
commit identity and is normalized out of all history; it appears in PROCESS.md
only where an entry describes the state before that change.

### Public commit attribution

**Hakan Dundar only, at the canonical address.** Every reachable commit carries
that name and email as both author and committer, and no reachable commit
message contains a co-author, session or generator trailer.

Two history operations produced this state, both on 2026-08-29:

1. **Trailer removal.** Two commits carried a third-party co-author trailer,
   which is what put a second identity on the public Contributors page — the
   author and committer fields were never wrong. Only those trailer lines were
   removed.
2. **Email normalization.** Author and committer email moved from
   `hakandundar@gmail.com` to `hakan@dndr.net` across all 26 commits and the
   tagger field.

Both were metadata-only. Every tree is byte-for-byte unchanged, and subjects,
message bodies, order, author dates and committer dates are all preserved. See
PROCESS.md for the full account and the authoring rule in HANDOFF.md §0 that
keeps it from recurring.

### Publication — complete

The 2026-08-29 force-with-lease publication was carried out by the owner and
succeeded. `origin` no longer carries any pre-normalization history, and the
old force-with-lease instruction block that used to live here has been removed
so it cannot be run again by mistake.

No history operation and no force-push is pending or authorized. The last
verified published baseline before this documentation change was `491f06b`,
and CI is green there.

#### Determining publication state

This document does not record a live ahead/behind count, because any such
number is false the moment a push happens. Check it at read time:

```bash
git status -sb
git rev-list --left-right --count origin/main...main
```

A non-zero right-hand count means a documentation commit is awaiting
publication. Normal documentation publication is a plain fast-forward:

```bash
git push origin main
```

No force, no lease. If a push is ever refused, re-read the remote with
`git ls-remote origin` and find out why before reaching for any flag.

Backups from the two rewrites are retained on the owner's machine, should
either ever need reversing:

- `~/turkcyber-preemail-20260829-030604/` — state before the email
  normalization (bundle verified complete, plus a full old→new SHA map)
- `~/turkcyber-prerewrite-20260829-013854/` — state before the trailer removal

### GitHub Contributors graph — stale display

**Observed 2026-10-01: the repository's Contributors page still shows two
contributors, `@hakandndr` and a non-owner identity.** This has persisted for
more than a month after the rewrite was published on 2026-08-29.

This is a GitHub statistics-cache problem, not a Git problem. The evidence:

- Reachable history (branches + tags) contains **zero** commits with a
  co-author, session or generator trailer, and **zero** commits authored or
  committed by anyone but `Hakan Dundar <hakan@dndr.net>`.
- The GitHub REST contributors list
  (`/repos/hakandndr/TurkCyber/contributors`) returns exactly one contributor:
  `hakandndr`, 27 contributions. It agrees with local history.
- The GitHub REST contributor **statistics** endpoint
  (`/repos/hakandndr/TurkCyber/stats/contributors`) returns an **empty body**
  on repeated requests. That endpoint is what backs the Contributors graph UI,
  so an empty statistics cache is consistent with a graph that never rebuilt
  after the force-push.
- No ref in the repository reaches such a trailer any more. The local
  `filter-branch` backup refs (`refs/original/*`) that did were never pushed
  and were removed locally on 2026-10-01; their state is preserved only in the
  owner's offline safety-baseline bundle.

GitHub's own guidance is that contributor data refreshes within roughly 24
hours of a history rewrite, and that the repository owner should contact
GitHub Support if it is still wrong after that. More than a month has elapsed.

**Official next action: a GitHub Support request asking for a contributor
statistics / Contributors graph rebuild.** The draft text is in PROCESS.md
under the 2026-09-30 entry.

**DO NOT REWRITE HISTORY AGAIN solely to chase the Contributors UI.** The
history is already correct; another rewrite would change every SHA, invalidate
the published refs and the release tag, and would not touch the cache that is
actually stale. Verify attribution on individual commit pages, not on the
graph.

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
| Active version | `df4418f5-b842-42b0-92cb-99665507bcd6` at 100% |
| Host/route     | `turkcyber-staging.dndr.net/*`                 |
| Indexing       | `X-Robots-Tag: noindex, nofollow`              |
| HSTS           | absent, intentionally                          |

Staging and production use distinct Turnstile public keys and separate Worker
secrets/resources. Staging was redeployed on 2026-10-01T10:29:44Z (previous
version `a854e11b-df2c-422b-a009-adf93cc72949`) with the DNDR dual-write and
the `DNDR_COLLECTOR` Service Binding; see "DNDR integration safety baseline".

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
