# Current state

**Snapshot: 2026-08-23.** Authoritative description of where the project is. If
anything below disagrees with reality, reality wins and this file needs updating.

---

## Headline

Locally complete. **Nothing deployed. No Cloudflare resource exists.
`turkcyber.com` untouched** — still the legacy Hostinger site.

Third work pass complete: the brand mark now derives from the wordmark's real
letterforms, a content-type-aware SEO system, two new problem areas
(**Banka & Kamu Dolandırıcılığı**, **Teknik Derinlik**), 18 new entries, search
that labels and ranks correctly, two more interactive tools, a reader-first
privacy page and manual analytics retention in `/boss`.

---

## Repository

|             |                                                         |
| ----------- | ------------------------------------------------------- |
| Remote      | `https://github.com/hakandndr/turkcyber.git`            |
| Branch      | `main`                                                  |
| HEAD        | `1887a3f` — this pass is **uncommitted** in the tree    |
| Push status | **blocked** — git proxy has not authorised this session |
| Lockfile    | present (`pnpm-lock.yaml`), resolves cleanly            |

> **Delete `.git\index.lock` before the first local git command.** A `git
status` run over the desktop bridge leaves one behind and the mount will not
> let a non-Windows process unlink it.

---

## Verification

> **⚠ Not yet verified on Windows.**
>
> `pnpm check` (0/0/0, 62 files) and `pnpm build` (56 pages) completed against a
> **one-way copy** of this tree in a cloud container — same files, different
> machine. That is the strongest honest statement available from there. The
> block below is what makes it real. See PROCESS.md, 2026-08-23, for why the
> desktop bridge VM cannot run the toolchain.

```powershell
cd D:\IT\turkcyber\turkcyber.com
Remove-Item -Force .git\index.lock -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force _to_delete -ErrorAction SilentlyContinue

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

### The hermetic rule

`pnpm test` never reads `dist/`. `tests/global-setup.ts` deletes `.test-dist/`
and rebuilds into it on every run, so neither a missing nor a stale `dist/` can
affect an assertion. `pnpm build` still writes `dist/` and is unrelated.

---

## Routes

Public and in the sitemap:

```
/                          /rehberler/            /rehberler/<slug>/      (16)
/efsane-mi-gercek-mi/      /efsane-mi-gercek-mi/<slug>/                    (9)
/teknik/                   /teknik/<slug>/                                 (6)
/araclar/                  /araclar/<tool>/                                (3)
/haberler/                 /konular/              /konular/<category>/    (10)
/hakkinda/                 /iletisim/             /gizlilik/
/rss.xml                   /sitemap.xml           /search-index.json
```

Built but `noindex` and excluded from the sitemap: `/ara/`, `/404`.

Worker-owned, never in the static build: `/collect`, `/api/comments`,
`/boss`, `/boss/{analytics,comments,system,login,logout}`,
`/boss/comments/{approve,reject,spam,delete}`,
**`/boss/analytics/purge` (POST only)**.

Total: **56 pages**.

---

## Content

|                   |                                       |
| ----------------- | ------------------------------------- |
| Published guides  | 16                                    |
| Published myths   | 9                                     |
| Technical entries | 6                                     |
| Published news    | **0**                                 |
| Draft news        | 1 template (excluded from production) |
| Interactive tools | 3, all shipped                        |
| Categories        | 10 — eight `primary`, two `secondary` |

### Taxonomy (changed this pass)

Two categories added: `banka-kamu-dolandiriciligi` and `nasil-calisiyor`.
Nothing was renamed or removed, so no existing URL changed.

`technical` is a **collection**, not a category — the reader's intent differs
(a guide answers "what do I do", these answer "why does that work"), and mixing
them buried the explanations. Entries live at `/teknik/<slug>/` and carry a
visible `İLERİ SEVİYE` label wherever they are linked.

### The rule the technical lane exists to enforce

No page may claim that clicking a link is categorically safe. `tests/content.test.ts`
asserts this against the built HTML of
`/teknik/link-tiklamak-tek-basina-ne-yapar/`, which states the real
preconditions instead: entering something, sharing a code, approving a
permission, running a file, or an unpatched vulnerability.

---

## SEO

`src/lib/seo.ts` is the single source for titles and structured data.

- Homepage: `TurkCyber | Dijital Güvenlik, Dolandırıcılık ve Hesap Güvenliği Rehberleri`
- Content: `Başlık · <Tür> | TurkCyber`, degrading to `Başlık | TurkCyber` and
  then to `Başlık` rather than truncating. Frontmatter `seoTitle` wins outright.
- Every page: canonical, OG, Twitter card. Drafts carry `noindex`.
- JSON-LD is emitted as an `@graph`: Article / NewsArticle / TechArticle, a real
  `ClaimReview` for myths (verdict → three-point rating), CollectionPage on
  listings, and a BreadcrumbList that matches the visible breadcrumb.
- **No invented credentials.** The house byline is emitted as an `Organization`,
  never a `Person`. There is no `aggregateRating`, no `sameAs`, no `jobTitle`.

---

## Search

Static, privacy-preserving, no server request. Turkish folding unchanged
(`İ`→`i`, `I`→`ı`, then diacritics).

Content types: **REHBER · EFSANE · HABER · TEKNİK · ARAÇ**. Myths were
previously labelled HABER — the opposite of what the page is.

Ranking, in the stated priority order: exact title → title starts with → title
contains → tags and category → summary → body. Whole-query tiers are applied
above per-field weights, with gaps larger than any per-field total, so an exact
title cannot be outranked by accumulated body hits.

Shipped tools are in the index; `planned` tools are not.

---

## Databases

Migrations written; **none applied anywhere** — no D1 database exists.

```
migrations/app/        0001_comments.sql
                       0002_comment_indexes.sql
                       0003_audit_events.sql
                       0004_comment_email.sql
migrations/analytics/  0001_visitor_events.sql
```

**No migration was added this pass.**

---

## Analytics retention

`/gizlilik/` states visitor records are kept for **at most 90 days**. The
mechanism behind that sentence is a manual panel on `/boss/system/`:

- shows oldest, newest, total, and the count older than 90 days
- offers a delete **only when there is something to delete**, with the count in
  the button's own label
- requires the confirmation phrase `SIL` to be typed
- `POST /boss/analytics/purge`, same-origin, session-required, audited
- touches **`visitor_events` in ANALYTICS_DB only** — a test asserts APP_DB
  never receives a `DELETE`

It is deliberately manual: nothing runs it on a schedule. An unattended DELETE
against the only copy of the history is one bug away from destroying it, and the
legacy import has not happened yet. If this ever becomes automatic,
`/gizlilik/` changes in the same commit.

---

## Brand

`scripts/brandmark.py` holds the mark as geometry — JetBrains Mono Bold
outlines for `< T C / >`, embedded as SVG path data. The favicon, the app icons
and the OG card all derive from it, so they cannot drift into being a different
mark. Regenerate with `python3 scripts/generate-icons.py` and
`python3 scripts/generate-og-default.py` (Pillow only).

Colour roles, identical in `Logo.astro`, the icons and the `/boss` header:
brackets faint grey, **T** warm white, **C** Turkish red (the only accent),
**slash neutral grey — never green**.

Icons carry the reduced `TC/`: the full five-glyph composition is not legible in
a 16px tab. The OG card, which has room, carries the full `<TC/>`.

Heritage wording is `2005'ten bugüne`, from `HERITAGE` in `src/config/site.ts`.
No copy anywhere claims uninterrupted publication.

---

## Configuration

| Variable                    | State                                               |
| --------------------------- | --------------------------------------------------- |
| `PUBLIC_FORMSPREE_ENDPOINT` | unset — falls back to the committed public endpoint |
| `SHOW_UNPUBLISHED`          | `.env.development` only; defaults closed elsewhere  |
| All secrets                 | unset; no environment provisioned                   |

---

## Legacy analytics

**Not imported.** Export (~1,661 records) not supplied.
`scripts/import-legacy-analytics.mjs` is written, smoke-tested, DST-correct,
non-deduplicating, re-runnable, and never executes against a database itself.

> Do not run the retention purge after importing legacy records without checking
> their dates first — anything older than 90 days would be deleted immediately.

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

1. **Windows verification** of this pass — the command block above.
2. **Cloudflare credentials** — no account access from the build environment.
3. **Git push** — proxy has not authorised this repository for the session.
4. **Legacy analytics export** — owner to supply.

---

## Suggested commits

```
feat(brand): derive every icon from the wordmark's own letterforms
feat(seo): content-type titles, breadcrumbs and honest structured data
feat(content): banking-fraud area and the technical-depth lane
feat(search): correct content types and relevance ordering
feat(tools): Instagram security check and account security score
feat(boss): manual analytics retention, and a reader-first privacy page
chore(ui): tighten footer rhythm
docs: reconcile PROCESS, CURRENT_STATE and HANDOFF
```

---

## Exact next step

```powershell
cd D:\IT\turkcyber\turkcyber.com
Remove-Item -Force .git\index.lock -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force _to_delete -ErrorAction SilentlyContinue
pnpm check ; pnpm lint ; pnpm test ; pnpm build ; pnpm scan:secrets
```

Then commit, then `PRODUCTION_CUTOVER.md` **phase A**. Astro 7 migration
afterwards, as its own isolated task.
