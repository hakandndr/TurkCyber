# Current state

**Snapshot: 2026-08-22.** This is the authoritative description of where the
project is. If anything below disagrees with reality, reality wins and this file
needs updating.

---

## Headline

Locally complete and verified. **Nothing has been deployed. No Cloudflare
resource exists. `turkcyber.com` has not been touched** — it still serves the
legacy Hostinger site.

---

## Repository

| | |
| --- | --- |
| Remote | `https://github.com/hakandndr/turkcyber.git` |
| Branch | `main` |
| Push status | see the final session report — the build environment had no push credentials |
| Lockfile | **missing** — `pnpm-lock.yaml` must be generated locally and committed |

The repository was empty before this work. Nothing was force-pushed and no
history was rewritten.

---

## Verification

Last run, all from a clean tree:

| Command | Result |
| --- | --- |
| `pnpm check` | 0 errors, 0 warnings, 1 hint |
| `pnpm lint` | clean (eslint + prettier) |
| `pnpm build` | 26 pages |
| `pnpm test` | **111 passed**, 5 files |
| `pnpm scan:secrets` | clean |

Test breakdown: auth 17 · analytics 31 · comments 24 · boss 17 · content 22.

---

## Routes

Public, built and in the sitemap:

```
/                         /rehberler/           /rehberler/<slug>/   (8)
/haberler/                /konular/             /konular/<category>/ (9)
/hakkinda/                /iletisim/            /gizlilik/
/rss.xml                  /sitemap.xml          /search-index.json
```

Built but deliberately `noindex` and absent from the sitemap: `/ara/`, `/404`.

Worker-owned, never in the static build:

```
/collect          analytics beacon
/api/comments     GET approved · POST for moderation
/boss             /boss/analytics  /boss/comments  /boss/system
/boss/login  /boss/logout  /boss/comments/{approve,reject,spam,delete}
```

---

## Content

| | |
| --- | --- |
| Published guides | 8 |
| Published news | **0** |
| Draft news | 1 (`ornek-haber-sablonu` — a template, excluded from production) |
| Categories | 9, defined once in `src/config/site.ts` |

News was not written because it would have required inventing sources. The
information architecture is complete and `/haberler/` renders its empty state.

---

## Databases

Migrations are written and **not applied anywhere** — no D1 database exists.

```
migrations/app/        0001_comments.sql
                       0002_comment_indexes.sql
                       0003_audit_events.sql
migrations/analytics/  0001_visitor_events.sql
```

Bindings expected: `APP_DB`, `ANALYTICS_DB`, `THROTTLE_KV`.
Every `database_id` in `wrangler.jsonc` is a `REPLACE_WITH_*` placeholder.

---

## Legacy analytics

**Not imported.** The historical export (~1,661 records) was not supplied to the
build environment.

`scripts/import-legacy-analytics.mjs` is written and smoke-tested against a
synthetic file. It:

- accepts JSON, NDJSON or CSV,
- recomputes `local_date` from the preserved UTC timestamp with a real timezone
  database (verified across both DST periods),
- preserves original timestamps, IPs and location fields,
- stores unrecorded device/browser values as `unknown` rather than guessing,
- **never deduplicates**,
- tags rows with `source` and begins with a `DELETE ... WHERE source = '<tag>'`
  so it is safely re-runnable,
- **never executes against a database** — it writes SQL and prints the command.

---

## Cloudflare

Nothing created. Required when provisioning begins:

| Resource | Name |
| --- | --- |
| Worker (staging) | `turkcyber-staging` |
| Worker (production) | `turkcyber-production` |
| D1 | `turkcyber-app-staging` · `turkcyber-analytics-staging` |
| D1 | `turkcyber-app-production` · `turkcyber-analytics-production` |
| KV | throttle namespace per environment |
| Turnstile | one widget per environment, hostname-scoped |

Secrets required per environment: `BOSS_USER`, `BOSS_PASSWORD_HASH`,
`SESSION_SECRET`, `TURNSTILE_SECRET_KEY`, `COMMENT_IP_PEPPER`.

---

## Production

`turkcyber.com` → legacy Hostinger site. **Unchanged.**

`env.production.routes` in `wrangler.jsonc` is deliberately an empty array.
Adding routes there is what replaces the live site, and that requires explicit
owner authorization — PRODUCTION_CUTOVER.md phase D.

No Hostinger file was read, modified or deleted.

---

## Blockers

1. **Cloudflare credentials** — no account access from the build environment, so
   no resource could be created and staging could not be deployed.
2. **Legacy analytics export** — file not supplied; import waiting.
3. **`pnpm-lock.yaml`** — the build environment used npm. Generate and commit it
   locally; CI runs `pnpm install --frozen-lockfile` and will fail without it.

---

## Exact next step

```powershell
cd D:\IT\turkcyber\turkcyber.com
pnpm install
pnpm check ; pnpm lint ; pnpm build ; pnpm test
git add pnpm-lock.yaml ; git commit -m "chore: add pnpm lockfile"
```

Then PRODUCTION_CUTOVER.md **phase A**.
