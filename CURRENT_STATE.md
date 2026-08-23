# Current state

**Snapshot: 2026-08-22.** Authoritative description of where the project is. If
anything below disagrees with reality, reality wins and this file needs updating.

---

## Headline

Locally complete and verified. **Nothing deployed. No Cloudflare resource
exists. `turkcyber.com` untouched** — still the legacy Hostinger site.

Second work pass complete: brand `<TC/>`, 2005 heritage, problem-first taxonomy,
"Efsane mi, gerçek mi?", interactive tools with one shipped tool, optional
comment email, rebuilt footer, real contact form, wider visual system, and the
test/build ordering dependency removed.

---

## Repository

|             |                                                                        |
| ----------- | ---------------------------------------------------------------------- |
| Remote      | `https://github.com/hakandndr/turkcyber.git`                           |
| Branch      | `main`                                                                 |
| Commits     | `0559bc3` (initial) + this pass                                        |
| Push status | **blocked** — git proxy has not authorised this repo for the session   |
| Lockfile    | **missing** — `pnpm-lock.yaml` must be generated locally and committed |

---

## Verification

> **Status: `verification pending on owner's Windows machine`.**
>
> The test-pipeline rework and the Formspree integration have **not** been
> executed. The Linux bridge cannot resolve the Windows pnpm `node_modules`
> (`MODULE_NOT_FOUND` for astro and vitest), and running the suite in a cloud
> container was refused — that is a different tree, and a result from it is not
> a result for this repository. See PROCESS.md, entry
> "Hermetic test pipeline + real Formspree endpoint".

**Run these, then replace this section with the real output:**

```powershell
cd D:\IT\turkcyber\turkcyber.com

# Delete the stale lock left by a bridge-side git status
Remove-Item -Force .git\index.lock -ErrorAction SilentlyContinue

# Case 1 — completely clean checkout
Remove-Item -Recurse -Force dist, .astro, .test-dist -ErrorAction SilentlyContinue
pnpm test

# Case 2 — deliberately stale build directory
Remove-Item -Recurse -Force dist, .test-dist -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path dist\konular\sosyal-medya | Out-Null
New-Item -ItemType Directory -Force -Path dist\haberler\ornek-haber-sablonu | Out-Null
'<html>stale</html>' | Set-Content dist\index.html
'<?xml version="1.0"?><urlset><url><loc>https://turkcyber.com/konular/sifreler-passkeys/</loc></url></urlset>' | Set-Content dist\sitemap.xml
'[]' | Set-Content dist\search-index.json
pnpm test

pnpm check ; pnpm lint ; pnpm test ; pnpm build ; pnpm scan:secrets
```

### Expected test inventory

Static count of `it(` declarations in the mounted tests — **not** a run result:

| Suite     | Cases   |
| --------- | ------- |
| analytics | 31      |
| content   | 30      |
| comments  | 24      |
| auth      | 17      |
| boss      | 17      |
| tools     | 13      |
| **total** | **132** |

Replace with the number the run reports. Do not quote this figure as verified.

### Why earlier counts disagreed (132 vs 124)

Both were real counts of **different trees**. A partial tarball extraction left
this repository's `tests/content.test.ts` and `tests/comments.test.ts` at their
original versions while a cloud copy had newer ones. The lesson is recorded as
policy in CLAUDE.md §9: a change is only real once confirmed on the mounted
project.

### The hermetic rule

`pnpm test` never reads `dist/`. `tests/global-setup.ts` deletes `.test-dist/`
and rebuilds into it on every run, so neither a missing nor a stale `dist/` can
affect an assertion. `pnpm build` still writes `dist/` and is unrelated.

## Routes

Public and in the sitemap:

```
/                          /rehberler/            /rehberler/<slug>/       (8)
/efsane-mi-gercek-mi/      /efsane-mi-gercek-mi/<slug>/                    (5)
/araclar/                  /araclar/bu-mesaj-sahte-mi/
/haberler/                 /konular/              /konular/<category>/     (8)
/hakkinda/                 /iletisim/             /gizlilik/
/rss.xml                   /sitemap.xml           /search-index.json
```

Built but `noindex` and excluded from the sitemap: `/ara/`, `/404`.

Worker-owned, never in the static build: `/collect`, `/api/comments`,
`/boss`, `/boss/{analytics,comments,system,login,logout}`,
`/boss/comments/{approve,reject,spam,delete}`.

---

## Content

|                   |                                       |
| ----------------- | ------------------------------------- |
| Published guides  | 8                                     |
| Published myths   | 5                                     |
| Published news    | **0**                                 |
| Draft news        | 1 template (excluded from production) |
| Interactive tools | 1 shipped, 2 listed as planned        |
| Categories        | 8 — six `primary`, two `secondary`    |

### Taxonomy (changed this pass)

`sifreler-passkeys` + `iki-faktorlu-dogrulama` → **`sifreler-2fa`**;
`sosyal-medya` → **`instagram-sosyal-medya`**. Four guides re-categorised.
Category ids changed, which changes `/konular/<id>/` URLs — safe now because
nothing is deployed. **Do not repeat this after go-live without redirects.**

Every category carries a plain-language `question` used on listing surfaces so
visitors recognise a problem without knowing security vocabulary.

---

## Databases

Migrations written; **none applied anywhere** — no D1 database exists.

```
migrations/app/        0001_comments.sql
                       0002_comment_indexes.sql
                       0003_audit_events.sql
                       0004_comment_email.sql     ← new, additive
migrations/analytics/  0001_visitor_events.sql
```

`0004` adds a nullable `email` column. Earlier migrations were not modified.
The public comments API never selects it — asserted by test.

---

## Configuration

| Variable                    | State                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_FORMSPREE_ENDPOINT` | optional override; the production endpoint `https://formspree.io/f/mljrvker` is committed in `src/config/site.ts` as public configuration |
| `SHOW_UNPUBLISHED`          | `.env.development` only; defaults closed everywhere else                                                                                  |
| All secrets                 | unset; no environment provisioned                                                                                                         |

---

## Legacy analytics

**Not imported.** Export (~1,661 records) not supplied.
`scripts/import-legacy-analytics.mjs` is written, smoke-tested, DST-correct,
non-deduplicating, re-runnable, and never executes against a database itself.

---

## Cloudflare

Nothing created. Required at provisioning: Workers `turkcyber-staging` /
`turkcyber-production`; D1 `turkcyber-{app,analytics}-{staging,production}`;
a KV namespace per environment; a Turnstile widget per environment.
All `database_id` values in `wrangler.jsonc` are `REPLACE_WITH_*` placeholders.

---

## Production

`turkcyber.com` → legacy Hostinger site. **Unchanged.** No Hostinger file read,
modified or deleted. `env.production.routes` is deliberately `[]`.

---

## Blockers

1. **Cloudflare credentials** — no account access from the build environment.
2. **Git push** — proxy has not authorised this repository for the session.
3. **`pnpm-lock.yaml`** — must be generated locally; CI uses `--frozen-lockfile`.
4. **Formspree endpoint** — owner to supply.
5. **Legacy analytics export** — owner to supply.

---

## Exact next step

```powershell
cd D:\IT\turkcyber\turkcyber.com
pnpm install
pnpm check ; pnpm lint ; pnpm build ; pnpm test
git add pnpm-lock.yaml ; git commit -m "chore: add pnpm lockfile"
git push -u origin main
```

Then `PRODUCTION_CUTOVER.md` **phase A**. Astro 7 migration afterwards, as its
own isolated task.
