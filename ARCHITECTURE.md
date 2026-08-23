# Architecture

Why TurkCyber is built the way it is. Decisions are recorded with their
reasoning so the next person can tell a deliberate choice from an accident.

---

## 1. Static content, dynamic edges

Astro produces a fully static site. The Cloudflare Worker serves that build
through its `ASSETS` binding and owns exactly three dynamic paths:

| Path            | Purpose              | Failure behaviour                                  |
| --------------- | -------------------- | -------------------------------------------------- |
| `/collect`      | analytics beacon     | always returns the pixel; write is fire-and-forget |
| `/api/comments` | first-party comments | article renders; thread shows a Turkish notice     |
| `/boss/*`       | private console      | 503 if unconfigured, 401 if unauthenticated        |

**Why.** The product is a reference library. Someone reading a guide about
losing their phone should not be blocked by a comments outage. Making content
static and dynamics additive means the failure modes are all partial.

**Trade-off.** Publishing requires a build. That is acceptable: content changes
are commits, not database writes.

---

## 2. Git is the content store

No CMS, no browser editor, no database table that content can be written to.
Guides are MDX files with a validated schema (`src/content.config.ts`).

**Why.**

- Editorial history is `git log` — free, complete, reviewable.
- Invalid frontmatter fails the build instead of rendering silently wrong.
- The workflow suits the way this site is actually maintained: an AI coding
  agent is asked to add a guide, it writes a file, runs the build, and the
  change is reviewed as a diff before it is committed.

**Trade-off.** No non-technical editing. Accepted deliberately.

**Consequence for status.** `status: published` is a build input. Draft and
review entries render during `astro dev` and are excluded from the production
build, the sitemap, the RSS feed and the search index — asserted in
`tests/content.test.ts`.

---

## 3. Two databases, not one

`APP_DB` holds comments and the audit trail. `ANALYTICS_DB` holds visitor
events.

**Why.** They differ in kind. Comments are public-facing content with a
moderation lifecycle. Visitor analytics are private operational data containing
full IP addresses. Different sensitivity, different retention, different
audience. Putting them in one database because D1 makes it convenient would
mean a single query mistake could join a comment to a raw IP.

Migration tables are separate (`app_migrations`, `analytics_migrations`) so the
two sequences never interfere.

---

## 4. Categories have one definition

`src/config/site.ts` defines the categories — ten of them, eight `primary` and
two `secondary`. Navigation, category index pages, the content schema's
`z.enum`, breadcrumbs and the search index all derive from it.

The same principle now covers the interactive tools: `src/config/tools.ts` is
the one list, and the tools index, the sitemap and the search index all read it.
It exists because the tools were previously declared inline on their own index
page, which meant they were absent from the sitemap and unfindable by search.

**Why.** A category list duplicated across a schema, a nav array and a page is a
guaranteed future inconsistency. Here, adding a category is one edit and the
build fails anywhere that has not been updated.

---

## 5. Analytics follows the DNDR blueprint

Implemented from `BLUEPRINT-visitor-analytics.md`. Points where the
specification is exact, and why:

**The beacon always returns a pixel.** Missing binding, throwing database,
unexpected exception — all return the 43-byte GIF. A failed analytics write must
never become a broken image on a visitor's page. Three tests cover this.

**Geolocation comes from `request.cf`.** Cloudflare resolves it before the
Worker runs. The system this pattern replaced called an external geo-IP API on
every page view, which added latency, a dependency and a rate limit to something
that should be free.

**`local_date` is computed in application code at write time.** SQLite has no
timezone database. `date(occurred_at, '-7 hours')` looks correct and is silently
wrong for half the year. `Intl.DateTimeFormat('en-CA', { timeZone })` is used
instead, and the DST boundary is tested in both directions.

**Sequence numbers come from `ROW_NUMBER()`, never from `id`.** `id` is insert
order. A historical import runs after live rows exist, so ids interleave the two
eras and produce a page numbered 52, 53, 1802, 1803. The CTE in
`worker/lib/analytics-query.ts` computes both the all-time and per-day sequences.

**Bot patterns live in the application as a visible list.** What counts as a
visitor is an editorial judgement that needs adjusting as new crawlers appear.
The list is interpolated into SQL, which is safe _only_ because it is a
compile-time constant; every request-derived value is a bound parameter.

**Full IP is stored.** A deliberate choice for a private panel, and `/gizlilik/`
says so in plain Turkish. The policy and the schema must never disagree.

---

## 6. Comments store no raw IP

`comments.ip_hash` is an HMAC of the address keyed with `COMMENT_IP_PEPPER`.

**Why.** Abuse correlation needs a stable per-address key; it does not need a
reversible identifier. A plain hash would be useless — the IPv4 space is small
enough to enumerate — so the pepper is what makes it non-reversible in practice.
Without the pepper configured the field is left null rather than storing
something that only looks protective.

Comments are plain text end to end. Markup is stored verbatim and escaped at
render time, so a comment containing `<script>` appears to readers as those
characters. Nothing is publicly visible before an owner approves it.

Threading is one level. A reply to a reply attaches to the same top-level
parent. Deeper nesting is a different product.

---

## 7. Authentication

Password-based, per the blueprint: `BOSS_USER`, `BOSS_PASSWORD_HASH`,
`SESSION_SECRET`. One account, no registration, no reset flow.

**Divergence from other DNDR projects.** DriverFairness protects `/boss` with
Cloudflare Access. TurkCyber uses the blueprint's password model instead,
because that is what this project's specification called for and it keeps the
console reachable without a Zero Trust dependency. If Access is preferred later,
it layers _in front of_ this rather than replacing it.

**PBKDF2 iterations are capped at 100,000.** This is a runtime ceiling, not a
preference: the Workers runtime throws `NotSupportedError` above it rather than
returning a mismatch. OWASP recommends more; it cannot be used here. A test
asserts that an out-of-range iteration count is rejected by returning false
rather than throwing, so an unusable stored hash cannot take the request down.

**Two timeouts.** Idle (30 min) refreshes on every request; absolute (8 h) is
anchored at sign-in and never moves. A test refreshes every 20 minutes for nine
hours and asserts the session is dead — continuous activity must not extend it.

**Signature is verified before the payload is parsed.** A tampered body is
rejected without its contents ever being trusted.

---

## 8. Route patterns need the trailing wildcard

In `wrangler.jsonc`:

```
"turkcyber-staging.dndr.net/collect*"
```

Cloudflare matches a route pattern against the **entire URL including the query
string**, and a pattern may not itself contain query parameters. The beacon
always sends `?path=…&referrer=…&t=…`, so a bare `/collect` never matches a real
request. This cost an afternoon in a sibling project.

The wildcard then also catches `/collections/*`, so `worker/index.ts` checks the
exact pathname and falls through to static assets for anything it does not own.

---

## 9. Search

A build-time JSON index (`/search-index.json`) plus client-side ranking.

**Why not a search service.** The corpus is small and the requirement is
finding a guide, not full-text relevance research. A static index costs one
cached request and keeps working if the Worker is down.

**Turkish normalisation is not optional.** `I` lowercases to `ı` and `İ`
lowercases to `i`. Default `toLowerCase()` makes "İSTANBUL" fail to match
"istanbul". Diacritics are then folded so someone typing `sifre` finds `şifre` —
most people do not switch keyboard layouts to search. Both behaviours are tested.

Every query term must match (AND), so a two-word search does not return the
whole library.

---

## 10. Social images

One well-made default card (`public/og/default.png`), generated by
`scripts/generate-og-default.py`.

**Why not per-article generation.** Build-time rasterisation adds a toolchain
dependency and a fragile one. A broken generator produces worse cards than one
good default. Per-article cards are a reasonable later addition once there is a
reliable path; the metadata plumbing already accepts an `ogImage` override.

The favicon is drawn as geometry rather than text so it does not depend on a
font, and `scripts/generate-icons.py` mirrors the same geometry for the PNG
fallbacks. At 16px the full `<tc/>` composition is illegible, so the favicon
drops the brackets and keeps `tc` plus the accent slash.

---

## 11. Fonts and the CSP

Space Grotesk (display), IBM Plex Sans (body), JetBrains Mono (technical),
loaded from Google Fonts. The CSP admits `fonts.googleapis.com` and
`fonts.gstatic.com` and nothing else beyond Turnstile.

**Honest cost.** This sends the visitor's IP to Google. `/gizlilik/` discloses
it explicitly rather than pretending there are no third-party requests.

**Recommended improvement.** Self-hosting the three faces (latin + latin-ext
subsets) removes that request entirely, tightens the CSP to `font-src 'self'`
and lets the privacy page drop a whole section. This was not done here because
the build sandbox had no network access to the font files; it is a clean,
self-contained follow-up.

---

## 12. Security headers

Set in `worker/index.ts` on public HTML, tested rather than copied:

- a CSP with `frame-ancestors 'none'`, `object-src 'none'`, no `unsafe-inline`
  for scripts (Astro emits external bundles; `style-src` does allow inline
  because Astro inlines critical CSS),
- `x-content-type-options: nosniff`,
- `referrer-policy: strict-origin-when-cross-origin`,
- `permissions-policy` denying geolocation, microphone and camera,
- HSTS **only** when `ENVIRONMENT === 'production'`, because setting it on a
  shared staging hostname can strand a sibling service,
- `x-robots-tag: noindex` on the whole staging environment.

`/boss` responses additionally carry `no-store`, `no-referrer` and
`noindex, nofollow`.

---

## 13. What was deliberately not built

- **Reactions.** Comments and sharing matter more; five emoji buttons are a
  vanity feature. If added later, one "Faydalı" counter is the right shape.
- **A newsletter.** No implementation exists, so no signup box pretends there is
  one.
- **Visitor counters or statistics on the public site.** Nothing fabricated.
- **A comment-rules page.** Expectations appear as ghost text in the comment box,
  where someone about to write will actually read them.
- **News articles.** The information architecture is complete and `/haberler/`
  renders its empty state. A draft template ships as a starting point. Writing
  news would have meant inventing sources, which is not acceptable.
