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
