# TurkCyber

Turkish digital-security publishing platform. Guides that explain one real
security problem at a time, in plain Turkish, for people who are not security
professionals.

A [DNDR Labs](https://dndr.net) project. Production domain: `turkcyber.com`.

> **Language split.** The public site is Turkish. The codebase, comments,
> identifiers, schema and this documentation are English. Never introduce
> Turkish identifiers or schema names because the site language is Turkish.

---

## Architecture in one paragraph

Astro builds a fully static site. A Cloudflare Worker serves that build through
its `ASSETS` binding and owns three dynamic routes: `/collect` (the analytics
beacon), `/api/comments` (first-party comments) and `/boss/*` (the private
console). Two D1 databases keep public application data and private visitor
analytics apart. Because the content site is static, a Worker or D1 outage
cannot stop an article from rendering — comments degrade to a Turkish notice and
analytics fails silently.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the reasoning and the trade-offs.

---

## Local development

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev          # static site at http://localhost:4321
```

`pnpm dev` runs the Astro site only. Dynamic routes need the Worker:

```bash
pnpm build
pnpm preview      # wrangler dev — serves dist/ plus /collect, /api, /boss
```

### Verification

```bash
pnpm check        # astro check + worker typecheck
pnpm lint         # eslint + prettier --check
pnpm test         # vitest — run after pnpm build
pnpm build
pnpm scan:secrets # pre-push credential scan
```

`tests/content.test.ts` asserts against `dist/`, so build before testing. CI
runs the whole sequence in that order.

### Local databases

```bash
pnpm db:app:local
pnpm db:analytics:local
```

Migrations live in `migrations/app` and `migrations/analytics` and are applied
with separate migration tables so the two databases never interfere.

---

## Adding a guide

Git is the content store. There is no CMS and no browser editor that could
bypass it.

1. Create `src/content/guides/<slug>.mdx`.
2. Fill the frontmatter (see the schema in `src/content.config.ts` — invalid
   frontmatter fails the build rather than rendering something wrong).
3. Put images in `src/assets/articles/<slug>/`.
4. `pnpm check && pnpm build` — confirm the guide appears.
5. Commit.

Frontmatter fields:

| Field | Notes |
| --- | --- |
| `title` | 8–120 characters |
| `description` | 40–200 characters; used as the meta description |
| `category` | must be one of the ids in `src/config/site.ts` |
| `publishedAt` / `updatedAt` | dates |
| `status` | `draft` · `review` · `published` — only `published` ships |
| `featured` | promotes to the homepage shelf |
| `summary` | the "Kısaca" block above the article |
| `difficulty` | `baslangic` · `orta` · `ileri` |
| `readingTime` | minutes, author-supplied |
| `tags` | up to 8 |
| `uiVerifiedAt` | set when the guide depends on a third-party UI; renders a visible "last checked" line |

Categories are defined once, in `src/config/site.ts`. Navigation, category
pages, the content schema and the search index all derive from that file. Never
duplicate the list.

### Callouts

Inside an `.mdx` guide:

```mdx
<Callout type="dikkat">
Bir uyarı metni.
</Callout>
```

Types: `bilgi` (cyan, information), `kontrol` (green, do this), `ornek`
(neutral, example), `dikkat` (amber, caution), `onemli` (red, danger). Each
renders an icon and a written label, so meaning never depends on colour alone.

---

## Environment variables

Names only; see [.env.example](.env.example). Real values go in `.dev.vars`
locally (gitignored) or `wrangler secret put` for deployed environments.

| Name | Purpose |
| --- | --- |
| `BOSS_USER` | private console login name |
| `BOSS_PASSWORD_HASH` | `pbkdf2$<iterations>$<salt>$<hash>` from `scripts/hash-password.mjs` |
| `SESSION_SECRET` | signs session cookies |
| `PUBLIC_TURNSTILE_SITE_KEY` | public; appears in client HTML |
| `TURNSTILE_SECRET_KEY` | server-side only |
| `COMMENT_IP_PEPPER` | HMAC key turning visitor IPs into non-reversible abuse keys |

Set each secret as a **separate** `wrangler secret put` command. Piping several
through one heredoc has scrambled them in practice.

```bash
node scripts/hash-password.mjs   # reads the password from stdin, echo disabled
```

---

## The private console

There is a password-protected operator console. It is never linked from the
site, never in the sitemap, disallowed in `robots.txt`, and every response
carries `no-store` and `noindex`. Its route and behaviour are documented in
[HANDOFF.md](HANDOFF.md), not here.

---

## Repository layout

```
src/
  config/site.ts        single source of truth: site identity, categories, nav
  content.config.ts     content schema — invalid frontmatter fails the build
  content/guides/       the guides
  content/news/         news (secondary; a draft template ships as an example)
  components/           Logo, Header, Footer, ArticleCard, Callout, Share, Comments
  layouts/              BaseLayout (SEO, fonts, beacon), ArticleLayout
  pages/                routes, plus rss.xml.ts, sitemap.xml.ts, search-index.json.ts
  lib/                  content helpers, Turkish-aware search
worker/
  index.ts              routing + public security headers
  routes/               collect, comments, boss, boss-views
  lib/                  auth, time, ua, referrer, sanitize, throttle, turnstile, queries
migrations/
  app/                  comments, indexes, audit trail
  analytics/            visitor events
scripts/                hash-password, import-legacy-analytics, scan-secrets, icon/OG generators
tests/                  vitest — 111 tests
```

---

## Documentation

| File | What it is |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | design decisions and why they were made |
| [SECURITY.md](SECURITY.md) | security model, boundaries, reporting |
| [PROCESS.md](PROCESS.md) | append-only work journal |
| [CURRENT_STATE.md](CURRENT_STATE.md) | latest authoritative snapshot |
| [HANDOFF.md](HANDOFF.md) | everything another engineer needs to continue |
| [PRODUCTION_CUTOVER.md](PRODUCTION_CUTOVER.md) | phased runbook; production requires explicit authorization |

---

## Status

Local build, tests and documentation are complete. **No Cloudflare resource has
been created and `turkcyber.com` has not been touched** — it still serves the
legacy Hostinger site. See CURRENT_STATE.md for exactly what remains.
