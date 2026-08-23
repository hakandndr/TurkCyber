# Process journal

Append-only. Each entry records what was done, what was decided and what remains.
Never rewrite an earlier entry; add a correcting one.

---

## 2026-08-22 — Project bootstrap, phases 0–6

**Objective.** Build TurkCyber from nothing to a locally complete, tested,
documented platform, stopping before any Cloudflare resource creation or
production DNS change.

**Starting state.** `D:\IT\turkcyber\turkcyber.com` empty.
`github.com/hakandndr/turkcyber` existed and was empty (`git ls-remote`
returned no refs).

**Reference material.** `reference/` supplied mid-session:
`BLUEPRINT-visitor-analytics.md`, `PRODUCTION_CUTOVER.md`, `HANDOFF.md`,
`HANDOFF2.md`, `CURRENT_STATE.md`, `PROCESS.md` and three project handoffs.
The analytics blueprint was followed closely; the DriverFairness cutover runbook
supplied the phased-authorization structure and the `wrangler.jsonc` /
`APP_DB`+`ANALYTICS_DB` conventions.

### Files created

- Config: `package.json`, `astro.config.mjs`, `tsconfig.json`,
  `tsconfig.worker.json`, `wrangler.jsonc`, `eslint.config.js`,
  `vitest.config.ts`, `.prettierrc`, `.gitignore`, `.env.example`
- Worker: `worker/index.ts`, `routes/{collect,comments,boss,boss-views}.ts`,
  `lib/{env,http,sanitize,time,ua,referrer,auth,throttle,turnstile,comments,analytics-query}.ts`
- Site: `src/config/site.ts`, `src/content.config.ts`, `src/lib/{content,search}.ts`,
  layouts, components, 14 page routes
- Content: 8 published guides, 1 draft news template
- Migrations: app 0001–0003, analytics 0001
- Scripts: `hash-password.mjs`, `import-legacy-analytics.mjs`,
  `scan-secrets.mjs`, `generate-icons.py`, `generate-og-default.py`
- Tests: 5 files, 111 tests
- Docs: README, ARCHITECTURE, SECURITY, PROCESS, CURRENT_STATE, HANDOFF,
  PRODUCTION_CUTOVER
- CI: `.github/workflows/ci.yml`

### Architectural decisions

1. **Astro static + Worker for three routes only.** Content survives any
   backend outage. Recorded in ARCHITECTURE.md §1.
2. **Two D1 databases.** Public application data and private analytics differ in
   sensitivity and retention; keeping them apart makes an accidental join
   impossible. §3.
3. **Password auth per the blueprint, not Cloudflare Access.** Diverges from
   DriverFairness deliberately; documented in ARCHITECTURE.md §7.
4. **MDX rather than plain Markdown** so semantic callouts are components rather
   than hand-rolled HTML in every guide.
5. **One default OG card, no per-article generation.** A fragile build-time
   rasteriser is worse than one good default. §10.
6. **No news articles written.** Writing them would have required inventing
   sources. The IA is complete, the empty state renders, and a clearly marked
   draft template ships instead.
7. **Google Fonts retained with an honest privacy disclosure.** Self-hosting was
   not possible from the build sandbox (no network access to the font files);
   recorded as a recommended follow-up. §11.

### Tests run

```
pnpm check   → 0 errors, 0 warnings, 1 hint
pnpm lint    → clean (eslint + prettier)
pnpm build   → 26 pages
pnpm test    → 111 passed (5 files)
```

Three test failures during development were traced to **wrong assertions, not
wrong code**, and the assertions were corrected:

- `normalizeReferrer('android-app://com.example')` — the value does parse as a
  URL, so returning the hostname is correct.
- `validateComment` accepting `'UPPER'` — slugs are lowercased before
  validation, which is intended normalisation; an explicit test now covers it.
- A malformed login-disclosure assertion was replaced with the stronger check
  that both failure modes produce byte-identical responses.

### Verified behaviours

- Beacon returns the 43-byte GIF with the binding absent and with D1 throwing.
- `local_date` crosses correctly in both DST periods (07:30 UTC → Jan 3 PST,
  Jul 4 PDT).
- Nine hours of continuous 20-minute refreshes still ends the session.
- Five failed logins produce 429 and the correct password is refused meanwhile.
- `/boss` absent from `dist/`, from `sitemap.xml`, and disallowed in
  `robots.txt`.
- Draft content excluded from the build, sitemap, RSS and search index.
- Legacy importer: DST-correct `local_date`, no deduplication, delete scoped to
  the source tag.

### Unresolved

- No Cloudflare resource created (no account access from the build environment).
- Staging not deployed.
- `turkcyber.com` untouched — still the legacy Hostinger site.
- Legacy analytics (~1,661 records) not imported: the source file was not
  supplied. The importer is written, smoke-tested against a synthetic file, and
  waiting for the real export.
- `pnpm-lock.yaml` not generated — the build environment used npm. Run
  `pnpm install` once locally and commit the lockfile; CI expects it.

### Next action

Run `pnpm install && pnpm check && pnpm build && pnpm test` locally to confirm
the environment reproduces, commit the lockfile, then follow
PRODUCTION_CUTOVER.md phase B for staging.

### Addendum — divergence with the owner's local commit

While this pass was being built in the cloud environment, the owner ran
`pnpm install` locally and committed `e84930b chore: verify local setup and add
pnpm lockfile` on top of `0559bc3`. That commit added `pnpm-lock.yaml` and
`.gitattributes` (`* text=auto eol=lf`, plus CRLF for `.bat`/`.cmd`) and
reformatted six documentation files with Prettier.

The two histories therefore diverged from `0559bc3`.

Resolution, chosen to preserve the owner's work:

- The owner's commit is kept as history; nothing was force-pushed or discarded.
- The cloud commit `f7119d8` was **not** replayed as-is. Its content was applied
  to the working tree and committed on top of `e84930b`, so the lockfile and
  `.gitattributes` survive.
- The six documentation files the owner touched were checked before committing:
  their changes were **purely Prettier formatting** (table alignment, JSX
  collapsing), with no semantic edits, so no content was lost by taking the
  cloud versions, which are themselves Prettier-formatted and additionally
  carry this pass's new sections.
- `f7119d8` remains reachable as a dangling object in this repository if the
  original tree is ever needed for comparison.

Lesson recorded: transfers into a working repository must check for local
commits first. A tarball extraction is not a merge.

---

## 2026-08-22 — Hermetic test pipeline + real Formspree endpoint

Worked directly on the mounted Windows project. `D:\IT\turkcyber\turkcyber.com`
is the only source of truth for this entry.

Starting state verified before any edit: `bbd2195 chore: remove local transfer
artifacts`, working tree clean.

### The previous "fix" never reached this repository

The mounted tree still contained, exactly as the owner reported:

- `tests/content.test.ts` with `describe.runIf(built)` and a module-scope
  `readdirSync(...)` at line 59,
- `vitest.config.ts` with **no** `globalSetup` registered,
- `tests/global-setup.ts` present but orphaned — never invoked by anything.

So the earlier claim of a working fix described a cloud-container copy whose
files were never applied here. The root cause was a partial `tar` extraction
over a live working tree whose exit status was never checked (the pipeline
checked `head`'s status, not `tar`'s). **A change that is not confirmed on the
mounted project does not exist.**

### The two Windows failures, and why the old design produced them

**Stale `dist/` → wrong assertions.** The suite read `dist/`. When that
directory came from an earlier checkout it still contained retired category
ids (`sosyal-medya`, `sifreler-passkeys`), so `search index` and `sitemap`
assertions failed against output that had nothing to do with the current
source. "Build only if `dist/` is missing" is the same bug with an extra step:
it trusts whatever is already on disk.

**Missing `dist/` → ENOENT.** `readdirSync` sat at module scope. Vitest
evaluates a suite factory _even when `describe.runIf` skips it_, so the read
threw during collection — before any guard applied and before a setup step
could have helped. `describe.runIf` cannot protect a top-level filesystem read.

### Final implementation

The test run owns its build.

- **`tests/paths.ts`** (new) — exports `TEST_DIST` = `<cwd>/.test-dist`. Setup
  and tests import the same constant, so there is no env var to plumb between
  processes and no way for the two to disagree.
- **`tests/global-setup.ts`** (rewritten) — deletes `.test-dist/` and rebuilds
  into it on **every** run. Never inspects `dist/`, never conditionally skips.
  Resolves the Astro entry via `createRequire` and runs it with
  `process.execPath`, avoiding the `.cmd` shim, shell quoting and PATH
  differences that make child processes behave differently on Windows. Forces
  `NODE_ENV=production`. Throws a named error if the CLI or `index.html` is
  missing.
- **`vitest.config.ts`** — registers `globalSetup` (this was the missing wire),
  `hookTimeout` 180 s, `teardownTimeout` 30 s.
- **`tests/content.test.ts`** (rewritten) — zero filesystem access at module
  scope, zero `describe.runIf` (the only remaining mention is a comment saying
  why it must not be used). All reads go through helpers called inside test
  bodies and read only `TEST_DIST`. A `beforeAll` gives one actionable failure
  if the build is missing. New assertions: the build under test is
  `.test-dist` and not `dist/`; sitemap and search index contain only current
  category ids (catching precisely the retired-id failure); myths render their
  verdict; the contact form exposes its four fields and honeypot, or falls back
  to the email address.
- **`.gitignore`, `.prettierignore`, `eslint.config.js`** — ignore `.test-dist/`.

### Formspree integration

- **`src/config/site.ts`** — added `CONTACT_FORM` holding the production
  endpoint `https://formspree.io/f/mljrvker` and the honeypot field name, plus
  `resolveFormspreeEndpoint(override)`. The endpoint is public configuration,
  not a secret: it is rendered into the form's `action` and visible to every
  visitor. `PUBLIC_FORMSPREE_ENDPOINT` still overrides it per environment.
  Anything not matching the Formspree URL shape resolves to an empty string and
  the page falls back to the email address, because a form posting to a
  malformed endpoint accepts messages and discards them silently.
- **`src/pages/iletisim.astro`** — consumes the config helper. Fields (name,
  email, subject, message), the off-screen honeypot and the Turkish
  success/error states are unchanged. The account-recovery boundary
  ("Kişisel hesap kurtarma desteği veremiyoruz.") is preserved.
- **`.env.example`** — documents the override and states it is optional.
- **`/gizlilik/`** — already disclosed Formspree processing accurately; no
  change was needed, and none was made.

### Execution policy added to CLAUDE.md §9

Permanent rule: stop a command that makes no progress in ~90–120 s, try at most
two materially different execution methods, never claim verification without a
completed run on the relevant tree, never maintain a second codebase, no
transfer archives.

### Verification — NOT DONE HERE

**verification pending on owner's Windows machine.**

Attempted, and stopped under the new policy:

1. Resolving the toolchain from the Linux bridge against the mounted project —
   `node -e "require.resolve('astro/package.json')"` → `MODULE_NOT_FOUND` for
   both `astro` and `vitest`. The `node_modules` tree is a Windows pnpm install
   and does not resolve from this bridge. Bounded to 30 s, one attempt.
2. Running the suite in the cloud container — **refused**: that is a different
   tree, and a result from it is not a result for this repository. This is the
   exact error that produced the previous false report.

No further attempts were made. Total time spent on execution: under a minute.

**Static inventory of the mounted tests** (a count of `it(` declarations, _not_
a run result): analytics 31 · content 30 · comments 24 · auth 17 · boss 17 ·
tools 13 = **132**. The number the run reports is the authoritative one and
replaces this.

### Commands the owner must run

```powershell
cd D:\IT\turkcyber\turkcyber.com

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

# Full pipeline
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm scan:secrets
```

Both test runs must pass. Case 2 is the regression test for the stale-`dist/`
failure: the suite must be completely unaffected by that corrupt directory.

### Housekeeping

`git status` run over the bridge leaves a `.git/index.lock` that this mount
will not let a non-Windows process unlink. **Delete `.git\index.lock` before
your first local git command.**

### Git state

`bbd2195` at start, clean. Changes left **uncommitted** in the working tree for
the owner to review and commit after verification passes: 10 modified files and
1 new file (`tests/paths.ts`).

### Staging / production state

Untouched by instruction. No Cloudflare resource; `turkcyber.com` still serves
the legacy Hostinger site; `env.production.routes` still `[]`. Astro not
upgraded.

### Next action

Delete `.git\index.lock`, run the PowerShell block above, then commit if green.
