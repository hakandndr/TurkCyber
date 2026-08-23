# CLAUDE.md — working rules for this repository

Read this before making any change. It is short on purpose.

---

## 1. The documentation rule (permanent, non-negotiable)

**Every meaningful implementation task must reconcile all three of these files
in the same change. A task is not finished until they agree with reality.**

| File               | What it is                        | How to update it                                                                                |
| ------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `PROCESS.md`       | Append-only history               | **Append** a dated entry. Never edit or delete an earlier one — add a correcting entry instead. |
| `CURRENT_STATE.md` | The latest authoritative snapshot | **Replace** the stale parts. It describes now, not history.                                     |
| `HANDOFF.md`       | Zero-context continuation         | **Update** whatever a new engineer would now be misled by.                                      |

A "meaningful implementation task" is anything that changes behaviour, schema,
routes, content structure, security posture, build or test commands. Fixing a
typo is not. Adding a field, a route, a migration or a dependency is.

Each `PROCESS.md` entry records, honestly:

- what was requested
- files changed
- schema / migration changes
- commands run **and their actual results**
- **every error encountered**, including ones later fixed
- **failed approaches**, and why they failed
- unresolved issues
- Git state
- staging / production state
- the exact next recommended action

Write down the failures. A clean-looking history that omits the two hours spent
on a wrong approach is worse than useless — the next person repeats it. If a
run was red before it was green, both facts belong in the entry.

---

## 2. Language split

| Surface                                                      | Language    |
| ------------------------------------------------------------ | ----------- |
| Public site content                                          | **Turkish** |
| Code, identifiers, schema, comments                          | **English** |
| Technical documentation (this file, README, ARCHITECTURE, …) | **English** |
| Owner-facing reports                                         | **Turkish** |

Never introduce Turkish identifiers, table names or code comments because the
site language is Turkish.

---

## 3. Things that must not be weakened

These carry comments in the code explaining why. Changing any of them requires
understanding the comment first:

- **Worker / D1 separation.** `APP_DB` (comments, audit) and `ANALYTICS_DB`
  (visitor events) stay separate databases.
- **The beacon always returns a pixel** — binding absent, D1 throwing, anything.
- **`local_date` is computed in application code**, never in SQL.
- **`seq` / `day_seq` come from `ROW_NUMBER()`**, never from `id`.
- **PBKDF2 is capped at 100,000 iterations.** This is a Workers runtime ceiling,
  not a preference. Raising it breaks sign-in at runtime.
- **Session: idle 30 min refreshed, absolute 8 h anchored.**
- **Every request-derived SQL value is bound.** The only interpolated SQL is
  `BOT_SQL`, built from a compile-time constant.
- **Every value rendered in `/boss` is escaped.** Those rows are
  attacker-controlled.
- **Comments are moderated before they are public**, and the public query never
  selects `email`.
- **Analytics retention is manual and ANALYTICS_DB-only.** Nothing schedules
  the purge, and it deletes from `visitor_events` and nothing else. `/gizlilik/`
  changes in the same commit if either fact does — see §4.
- **Turnstile fails closed.**
- **The draft publication gate defaults to closed** — see §5.
- **`pnpm scan:secrets` runs first in CI.** The repository is public.

---

## 4. Content rules

- Git is the content store. No CMS, no database-backed editor.
- Invalid frontmatter must fail the build.
- Categories are defined once, in `src/config/site.ts`.
- **Do not fabricate.** No invented news sources, no invented statistics, no
  invented platform behaviour, no invented menu labels for a third-party UI. If
  a real fact is missing, use a visibly bracketed placeholder.
- Guides depending on a third-party interface carry `uiVerifiedAt`, which
  renders a visible "checked on" line.
- Never claim uninterrupted publication since 2005. The domain dates from 2005;
  the site was dormant for years. `HERITAGE` in `src/config/site.ts` holds the
  approved wordings — use them rather than writing new ones.
- Interactive tools run entirely in the browser. Answers are never transmitted,
  never stored, never sent to analytics. **No tool asks for a real password**,
  and no tool reports a fabricated precision — a checklist result is a band and
  an ordered list, never "%87,4 güvende".
- **No page may claim that clicking a link is categorically safe.** It is false,
  and the site loses its credibility the first time a reader is harmed by one.
  `/teknik/link-tiklamak-tek-basina-ne-yapar/` states the real preconditions and
  a test asserts the absolute never comes back.
- **`/gizlilik/` says visitor records are kept "en fazla 90 gün".** That is a
  commitment kept by hand through `/boss/system/`. It must never be presented as
  a legal requirement — no law is being cited, and claiming one would be a
  fabrication. Tests assert both halves.
- The mark is defined once, as geometry, in `scripts/brandmark.py`. Do not hand-
  draw another version of `<TC/>` for an icon — the icons and the OG card derive
  from the same outlines as the header wordmark, and that is the point.

---

## 5. The draft publication gate

`src/lib/content.ts` gates unpublished content on `SHOW_UNPUBLISHED`, an
explicit opt-in that **defaults to closed**.

It used to read `import.meta.env.DEV`. That is derived from Vite's mode and an
ambient `NODE_ENV` can flip it: `NODE_ENV=test astro build` produced a
production build containing draft content. Do not reintroduce that pattern —
`tests/content.test.ts` guards against it.

`SHOW_UNPUBLISHED=true` lives in `.env.development`, which Astro loads for
`astro dev` and not for `astro build`.

---

## 6. Verification

```bash
pnpm check    # astro check + worker typecheck
pnpm lint     # eslint + prettier --check
pnpm test     # vitest — always builds its own hermetic copy into .test-dist/
pnpm build
pnpm scan:secrets
```

### The test run owns its build

`pnpm test` is **hermetic**. It has no ordering dependency on `pnpm build`, and
it never reads `dist/`.

`tests/global-setup.ts` deletes `.test-dist/` and rebuilds into it on every run.
`tests/content.test.ts` asserts only against that directory, via the `TEST_DIST`
constant in `tests/paths.ts`.

Three rules keep it that way. All three have been broken before, and each broke
the suite in a different way:

1. **Never assert against `dist/`.** It belongs to the developer. It may be
   absent, stale, or built with different environment variables. A stale `dist/`
   once made the suite fail on retired category ids that no longer existed in
   the source.
2. **Never trust an existing build.** "Build only if missing" is the same bug
   with an extra step. Always rebuild.
3. **No filesystem access at module scope in a test file.** Vitest evaluates a
   suite factory even when it is skipped, so a top-level `readdirSync` throws
   during collection — before any guard applies and before global setup's output
   can help. `describe.runIf` does **not** protect a top-level read. Every read
   goes inside a test body or a `beforeAll`.

Run `pnpm lint` before committing. Prettier formatting drift is the most common
cause of a red first run on a fresh machine.

---

## 7. Deployment boundaries

- **Never deploy production without explicit owner authorization.**
- `env.production.routes` in `wrangler.jsonc` is deliberately an empty array.
  Adding routes there replaces the live site.
- `turkcyber.com` currently serves the legacy Hostinger site. Do not modify or
  delete anything on Hostinger — it is the rollback path.
- Provision and test in staging first. Import legacy analytics into staging and
  reconcile counts before touching production.
- Set each secret as its own `wrangler secret put` command.

Full runbook: `PRODUCTION_CUTOVER.md`.

---

## 8. Known deferred work

- **Astro 7 migration** is deliberately a separate, isolated task. Do not mix a
  framework upgrade with visual or content changes.
- Self-hosting the webfonts (removes the Google Fonts third-party request).
  `scripts/brandmark.py` already documents how JetBrains Mono was obtained.
- Per-article OG images.

Analytics retention is **not** deferred work any more — it exists, manually, at
`/boss/system/`. Making it automatic is a deliberate non-goal; see §3.

---

## 9. Execution policy (permanent)

Implementation is the job. Debugging Claude's own environment is not.

- **Do not spend large portions of a session fighting command execution**,
  classifier, sandbox, proxy or shell problems.
- **If a command makes no meaningful progress for ~90–120 seconds, stop it.**
- **Try at most two materially different execution methods.** Not the same
  command ten times.
- If execution is still unavailable, **stop retrying** and hand over the exact
  Windows PowerShell command to run locally.
- **Never spend 10–20+ minutes repeatedly attempting the same test/build/tool
  command.** This has happened; it wasted a session.
- **Never claim verification unless a real command completed successfully on
  the relevant tree.** If it did not, say exactly:
  `verification pending on owner's Windows machine`.
- **Do not create `.tar.gz`, `.zip`, `_to_delete`, transfer archives, stale
  lock collections, or alternate repository copies** unless explicitly asked.
- **Never maintain a second divergent codebase.** The mounted Windows project
  at `D:\IT\turkcyber\turkcyber.com` is the only source of truth. Confirm a
  change exists _there_ before reporting it. A cloud-container copy is not the
  project, and a result from it is not a result.
- **Do not repeatedly reread the whole `reference/` folder.** Use `CLAUDE.md`,
  `CURRENT_STATE.md` and `HANDOFF.md` first; open a reference document only
  when a specific answer requires it.
- **Reconcile documentation once, near task completion** — not after every
  intermediate experiment.

### Why this rule exists

A previous session extracted a tarball over the mounted working tree, piped
`tar` through `head`, and checked `head`'s exit status instead of `tar`'s. The
transfer was partial and unverified, so the reported fix never reached the
machine that was failing. A later session then spent more than twenty minutes
re-attempting a single hung command. Both are the same underlying error:
trusting an unverified environment over the project itself.
