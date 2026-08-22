# Handoff

Everything needed to continue TurkCyber with no prior conversation context.

Read [CURRENT_STATE.md](CURRENT_STATE.md) first for where things stand; this
file explains how the system works.

---

## 1. What this is

A Turkish digital-security publishing platform. Guides that each solve one
concrete problem, written for people who are not security professionals. News is
secondary. A DNDR Labs project.

**Language rule.** Public site: Turkish. Code, comments, identifiers, schema,
docs: English. Owner-facing reports: Turkish. Do not mix these.

---

## 2. Shape of the system

```
GitHub (content + code)
        │
        ▼
   Astro build  ──►  dist/  ──► Worker ASSETS binding ──► visitors
        │
        └─ Worker owns only:  /collect      → ANALYTICS_DB
                              /api/comments → APP_DB
                              /boss/*       → both
```

The content site is static. Comments failing shows a Turkish notice under the
article; analytics failing is invisible. Neither can stop a guide rendering.

---

## 3. Filesystem

```
src/config/site.ts        SITE identity, 9 CATEGORIES, NAV, FOOTER_LINKS
                          ── single source of truth; never duplicate the list
src/content.config.ts     Zod schema; invalid frontmatter FAILS THE BUILD
src/content/guides/       8 published .mdx guides
src/content/news/         1 draft template, 0 published
src/lib/content.ts        collection access, status filtering, related guides
src/lib/search.ts         Turkish-aware normalisation + ranking
src/layouts/              BaseLayout (SEO, fonts, beacon), ArticleLayout
src/components/           Logo, Header, Footer, ArticleCard, Callout, Share, Comments
src/pages/                routes + rss.xml.ts, sitemap.xml.ts, search-index.json.ts

worker/index.ts           routing + public security headers
worker/routes/collect.ts  the beacon
worker/routes/comments.ts public comments API
worker/routes/boss.ts     auth, analytics, moderation
worker/routes/boss-views.ts  all panel HTML (escaping lives here)
worker/lib/               auth, time, ua, referrer, sanitize, throttle,
                          turnstile, comments, analytics-query, http, env

migrations/app/           0001 comments · 0002 indexes · 0003 audit_events
migrations/analytics/     0001 visitor_events

scripts/                  hash-password.mjs · import-legacy-analytics.mjs
                          scan-secrets.mjs · generate-icons.py · generate-og-default.py
tests/                    111 tests across 5 files
```

---

## 4. Commands

```bash
pnpm install
pnpm dev            # static site only, :4321
pnpm build
pnpm preview        # wrangler dev — static + dynamic routes
pnpm check          # astro check + worker tsc
pnpm lint           # eslint + prettier --check
pnpm test           # vitest — RUN AFTER pnpm build
pnpm scan:secrets

pnpm db:app:local
pnpm db:analytics:local
```

`tests/content.test.ts` asserts against `dist/`, so the build must precede the
tests. CI enforces that order.

---

## 5. Content model

Guides are MDX with validated frontmatter. `status` is `draft | review |
published`; only `published` reaches a production build, the sitemap, RSS and
the search index. Draft and review render during `astro dev`.

Adding a guide:

1. `src/content/guides/<slug>.mdx`
2. images in `src/assets/articles/<slug>/`
3. `pnpm check && pnpm build`
4. commit

Callout types: `bilgi` (info) · `kontrol` (do this) · `ornek` (example) ·
`dikkat` (caution) · `onemli` (danger). Each renders an icon **and** a written
label so meaning never depends on colour.

Set `uiVerifiedAt` on any guide that depends on a third-party interface. It
renders a visible "checked on" line so a stale guide is honest rather than
quietly wrong.

---

## 6. Comments

**Flow.** Article renders statically → client fetches `GET /api/comments?slug=` →
visitor submits → `POST /api/comments` → row stored `pending` → owner approves in
`/boss/comments/` → it becomes publicly readable.

**Schema.** `comments(id, article_slug, parent_id, display_name, body, status,
created_at, approved_at, ip_hash, user_agent, country, moderation_note)`.

**Rules that matter.**

- Plain text only. HTML is stored verbatim and escaped at render.
- One level of threading; a reply to a reply attaches to the top-level parent.
- No raw IP. `ip_hash` = HMAC-SHA256(ip, `COMMENT_IP_PEPPER`). Without the
  pepper the field is null rather than a reversible plain hash.
- Turnstile fails closed — no secret, no token or a network error all reject.
- Same-origin enforced explicitly, not left to `SameSite`.
- 3 submissions per abuse key per 10 minutes; body ≤ 2,000 chars; request ≤ 16 KB.
- No email is collected. There is no comment-rules page by design — the
  expectations are ghost text in the textarea.

---

## 7. Analytics

Follows `BLUEPRINT-visitor-analytics.md`. Read that file before changing
anything here; several constants are exact for stated reasons.

**Beacon.** `GET /collect?path=<host+path>&referrer=<r>&t=<n>` → 43-byte GIF,
always, with `x-turkcyber-collect: ok | no-database | error`. The write is
`ctx.waitUntil`-deferred and its failure is swallowed.

**Client.** `public/analytics.js`, loaded `defer`. Deduplicates per page per
session via `sessionStorage`; every path is inside try/catch.

> If the beacon endpoint ever moves, **grep the other DNDR repositories.** In a
> sibling project one site kept posting to a retired endpoint for weeks.

**Schema.** `visitor_events(id, occurred_at, local_date, host, path, referrer,
referrer_raw, ip, country, region, city, asn, device, browser, user_agent,
source)`.

**Three things that are easy to break:**

1. `local_date` is computed in JS at write time with `Intl.DateTimeFormat`.
   Never compute it in SQL — SQLite has no timezone database and a fixed offset
   is wrong for half the year.
2. `seq` and `day_seq` come from `ROW_NUMBER()`, never from `id`. An import runs
   after live rows exist and ids interleave the eras.
3. `BOT_SQL` is the only interpolated SQL in the codebase and is safe **only**
   because it comes from a constant list. Everything request-derived is bound.

**Repeat flags.** `<5` ok · `5–19` repeat · `≥20` high.

---

## 8. The private console

`https://turkcyber.com/boss` — never linked, never in the sitemap, disallowed in
robots.txt, `no-store` + `noindex` on every response.

Pages: `/boss/` overview · `/boss/analytics/` · `/boss/comments/` ·
`/boss/system/`.

**Auth.** `BOSS_USER` + PBKDF2 hash in `BOSS_PASSWORD_HASH`, signed session
cookie via `SESSION_SECRET`.

- Hash format: `pbkdf2$<iterations>$<base64 salt>$<base64 hash>` — four parts.
- **100,000 iterations is a runtime ceiling.** Workers throws above it. Do not
  "improve" this number.
- Idle 30 min (refreshed) · absolute 8 h (anchored at sign-in, never moved).
- 5 failures per IP per 15 min → 429, correct password refused meanwhile.
- Missing secret → `503 Panel is not configured`, never a partial panel.

Generate a hash:

```bash
node scripts/hash-password.mjs      # stdin, echo disabled
npx wrangler secret put BOSS_PASSWORD_HASH
```

Set each secret in its own command — batching them has scrambled values before.

**Analytics UI.** Summary cards, top pages, filter form, 100-row pages, columns
`# DAY ADDRESS FLAG SOURCE DATE COUNTRY CITY PAGE REFERRER DEVICE/BROWSER
ORIGIN`. Timestamps render as `2026-08-04 1:09:04pm` via `formatToParts` — the
am/pm marker is not portable across ICU builds, so it is normalised by hand.

Live filtering is progressive enhancement over a plain GET form. **The form must
keep working with JavaScript disabled.** Do not build a filter that exists only
in JS.

**Moderation.** approve · reject · spam · delete. Every mutation is POST,
same-origin, authenticated, and writes an `audit_events` row.

---

## 9. Environment variables

| Name | Where | Notes |
| --- | --- | --- |
| `BOSS_USER` | secret | console login name |
| `BOSS_PASSWORD_HASH` | secret | from `scripts/hash-password.mjs` |
| `SESSION_SECRET` | secret | 32+ random bytes |
| `TURNSTILE_SECRET_KEY` | secret | server-side only |
| `COMMENT_IP_PEPPER` | secret | HMAC key for comment abuse keys |
| `PUBLIC_TURNSTILE_SITE_KEY` | build env | public, appears in HTML |
| `ANALYTICS_TIMEZONE` | var | `America/Los_Angeles` |
| `ENVIRONMENT` | var | `development` / `staging` / `production` |

Local: `.dev.vars` (gitignored). Deployed: `wrangler secret put`.

---

## 10. Route patterns — read before editing wrangler.jsonc

```
turkcyber-staging.dndr.net/collect*      ← the trailing * is required
turkcyber-staging.dndr.net/api/*
turkcyber-staging.dndr.net/boss*
```

Cloudflare matches the pattern against the **whole URL including the query
string**, and a pattern may not contain query parameters. The beacon always
sends `?path=…&t=…`, so a bare `/collect` matches nothing. The wildcard also
catches `/collections/*`, which is why `worker/index.ts` re-checks the exact
pathname and falls through to assets.

---

## 11. Security model

Full detail in [SECURITY.md](SECURITY.md). The short version:

- Every request-derived SQL value is bound. One constant is interpolated:
  `BOT_SQL`.
- Every panel field is escaped — analytics rows are attacker-controlled.
- Comments are plain text; markup is escaped at render, never interpreted.
- The repository is public. `pnpm scan:secrets` runs first in CI.

---

## 12. Known issues and gaps

- **No `pnpm-lock.yaml`.** The build environment used npm. Generate it locally
  and commit; CI runs `--frozen-lockfile`.
- **No news content.** Deliberate — writing it would have meant inventing
  sources. Template ships as a draft.
- **Legacy analytics not imported.** Export not supplied; importer ready.
- **Google Fonts is a third-party request.** Disclosed in `/gizlilik/`.
  Self-hosting is a clean follow-up (ARCHITECTURE.md §11) and would let a whole
  privacy section be deleted.
- **No retention job.** The privacy page says so honestly. If one is added, the
  privacy page must change in the same commit.
- **Per-article OG images not generated.** One good default card instead.
- **KV rate limiting is not atomic.** Fine as an abuse brake.
- **Astro `check` reports 1 hint** about the JSON-LD script tag. Harmless.

---

## 13. Recommended next task

In order:

1. `pnpm install` locally, commit `pnpm-lock.yaml`.
2. PRODUCTION_CUTOVER.md phase A (repository readiness) — no Cloudflare needed.
3. Phase B: create staging D1 databases and KV, fill the `REPLACE_WITH_*` ids,
   apply migrations, set secrets, deploy staging, verify `noindex`.
4. Import the legacy analytics into **staging** first and reconcile counts.
5. Only then consider production, which needs separate explicit authorization.

Do not skip to production. `env.production.routes` is an empty array on purpose.
