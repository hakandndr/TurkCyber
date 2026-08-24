# TurkCyber

TurkCyber is a Turkish digital-security publication: practical guides,
myth-busting, engineering articles and browser-only security tools. The domain
dates from 2005; the site does not claim uninterrupted publication since then.

A [DNDR Labs](https://dndr.net) project. Production is live at
`https://turkcyber.com`; staging is `https://turkcyber-staging.dndr.net`.

> Public content is Turkish. Code, identifiers, schema and technical
> documentation are English.

## Runtime architecture

Astro emits a static site. A Cloudflare Worker runs first for dynamic routes and
serves the build through its `ASSETS` binding for everything else.

- `/collect` records first-party visitor events in `ANALYTICS_DB`.
- `/api/comments` handles moderated comments in `APP_DB`.
- `/boss/*` is the private moderation, analytics and system console.
- Two D1 databases keep application data and analytics separate.
- A KV namespace provides comment throttling and notification deduplication.
- Turnstile protects comment submission.
- Resend sends nonfatal background notifications for new pending comments.

Static articles remain available if dynamic services fail. See
[ARCHITECTURE.md](ARCHITECTURE.md) for boundaries and trade-offs.

## Local development

Requires Node 20 or newer and pnpm 9.15.4.

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs Astro only. To exercise Worker routes locally:

```bash
pnpm build
pnpm preview
```

### Verification

```bash
pnpm check        # Astro and Worker TypeScript
pnpm lint         # ESLint and Prettier check
pnpm test         # hermetic Vitest build in .test-dist/
pnpm build        # production static build
pnpm scan:secrets # tracked-file credential scan
git diff --check
```

The test suite owns and rebuilds `.test-dist/`; it does not read `dist/` and does
not depend on a preceding `pnpm build`.

### Local databases

```bash
pnpm db:app:local
pnpm db:analytics:local
```

APP migrations live in `migrations/app`; analytics migrations live in
`migrations/analytics`. Never apply one database's migrations to the other.

## Content

| Collection  | Route                   | Purpose                                   |
| ----------- | ----------------------- | ----------------------------------------- |
| `guides`    | `/rehberler/`           | practical, problem-focused guidance       |
| `myths`     | `/efsane-mi-gercek-mi/` | short myth checks with an explicit result |
| `technical` | `/teknik/`              | engineering and security-boundary depth   |
| `news`      | `/haberler/`            | attributable, publication-gated news      |

Interactive tools at `/araclar/` run in the browser; their answers are not sent
to the Worker or analytics.

To add a guide:

1. Create `src/content/guides/<slug>.mdx`.
2. Follow the schema in `src/content.config.ts`; invalid frontmatter fails the
   build.
3. Put article media under `src/assets/articles/<slug>/`.
4. Run `pnpm check`, `pnpm test` and `pnpm build`.

Categories are defined once in `src/config/site.ts`. Navigation, category pages,
search and schemas derive from that configuration.

The draft gate is explicit and closed by default. `SHOW_UNPUBLISHED=true` is a
developer-only opt-in; release builds never depend on an ignored local env file.

## Configuration and secrets

Public configuration such as `PUBLIC_TURNSTILE_SITE_KEY` is supplied per build.
Server-only values are Worker secrets:

- `BOSS_USER`
- `BOSS_PASSWORD_HASH`
- `SESSION_SECRET`
- `TURNSTILE_SECRET_KEY`
- `COMMENT_IP_PEPPER`
- `RESEND_API_KEY`

Never put real values in tracked files or command output. See `.env.example` for
names and [SECURITY.md](SECURITY.md) for handling rules.

## Brand source

The owner-supplied red/silver visual master pack is canonical. Metadata,
dimensions and hashes live in `src/brand/identity.json`; favicon, app-icon, WebP
and OG outputs are derived reproducibly. Do not redraw or reinterpret the mark in
components or generators.

## Repository map

```text
src/                  Astro pages, content, components, layouts and brand sources
worker/               Worker router, dynamic routes and runtime libraries
migrations/app/       comments, audit and moderation metadata
migrations/analytics/ visitor-event schema
scripts/              verification, password, analytics-import and brand tooling
tests/                hermetic Vitest regression suite
public/               static and generated public assets
```

## Operations

Production and staging are both live. Production uses only
`turkcyber.com/*` and `www.turkcyber.com/*`; staging uses
`turkcyber-staging.dndr.net/*`. The legacy Hostinger origin is retained for
route-detachment rollback. Root receiving-mail DNS is independent and must not be
changed during a web rollback.

Cloudflare resource IDs, current deployment versions, migrations, import counts
and the exact rollback sequence are maintained in
[CURRENT_STATE.md](CURRENT_STATE.md) and [HANDOFF.md](HANDOFF.md). Do not
duplicate volatile operational state here.

## Documentation

| File                                           | Purpose                                                |
| ---------------------------------------------- | ------------------------------------------------------ |
| [CURRENT_STATE.md](CURRENT_STATE.md)           | authoritative snapshot of what is live now             |
| [HANDOFF.md](HANDOFF.md)                       | zero-context engineering and operations continuation   |
| [ARCHITECTURE.md](ARCHITECTURE.md)             | system structure, data flow and design decisions       |
| [SECURITY.md](SECURITY.md)                     | threat model, privacy boundaries and secret handling   |
| [PROCESS.md](PROCESS.md)                       | append-only recovery and release history               |
| [PRODUCTION_CUTOVER.md](PRODUCTION_CUTOVER.md) | historical cutover runbook and current rollback record |
| [CLAUDE.md](CLAUDE.md)                         | permanent repository working rules                     |

Read `CLAUDE.md`, `CURRENT_STATE.md` and `HANDOFF.md` before making a meaningful
change. Every such change must reconcile those documents with reality.
