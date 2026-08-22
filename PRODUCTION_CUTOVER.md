# Production cutover runbook

Target: `https://turkcyber.com`. Staging: `https://turkcyber-staging.dndr.net`.

Operational document. **Each phase is a separate authorization: completing one
never authorizes the next.** Stop immediately if any command prints an account,
zone, database name or hostname other than the intended target.

> **Current status: phases A–H not started.** No Cloudflare resource exists and
> `turkcyber.com` still serves the legacy Hostinger site.

---

## The rule that matters

`env.production.routes` in `wrangler.jsonc` is deliberately an **empty array**.

Adding routes there is the single action that replaces the live public site.
It requires explicit owner authorization, given for that action specifically.
Nothing in this runbook up to phase G changes what a visitor to `turkcyber.com`
sees.

---

## Phase A — repository readiness

No Cloudflare access required.

```powershell
cd D:\IT\turkcyber\turkcyber.com
pnpm install
pnpm scan:secrets
pnpm check
pnpm lint
pnpm build
pnpm test
git status --short
```

Pass conditions:

- `pnpm scan:secrets` clean.
- `pnpm check` 0 errors.
- `pnpm build` 26 pages, no warnings about missing collections.
- `pnpm test` 111 passed.
- `dist/boss` does not exist; `dist/sitemap.xml` contains no `/boss`.
- Working tree carries no unexpected change.
- `pnpm-lock.yaml` is committed.

---

## Phase B — provision staging

No DNS change. Nothing public is affected.

1. Create the databases and KV namespace:

```powershell
npx wrangler d1 create turkcyber-app-staging
npx wrangler d1 create turkcyber-analytics-staging
npx wrangler kv namespace create THROTTLE_KV --env staging
```

2. Replace in `wrangler.jsonc` — **only the staging block**:

```
REPLACE_WITH_STAGING_APP_DB_ID
REPLACE_WITH_STAGING_ANALYTICS_DB_ID
REPLACE_WITH_STAGING_THROTTLE_KV_ID
```

Keep the binding names `APP_DB`, `ANALYTICS_DB`, `THROTTLE_KV` and the separate
migration tables.

3. Apply migrations, listing before and after:

```powershell
npx wrangler d1 migrations list turkcyber-app-staging       --env staging --remote
npx wrangler d1 migrations apply turkcyber-app-staging      --env staging --remote
npx wrangler d1 migrations apply turkcyber-analytics-staging --env staging --remote
npx wrangler d1 migrations list turkcyber-analytics-staging --env staging --remote
```

Expected end state: app `0001`–`0003` applied, analytics `0001` applied, nothing
pending.

4. Create a Turnstile widget: name `TurkCyber staging`, Managed mode, hostname
   `turkcyber-staging.dndr.net` **only**. Do not add `turkcyber.com` or
   `localhost`.

5. Set the secrets — **one command at a time**:

```powershell
npx wrangler secret put BOSS_USER              --env staging
npx wrangler secret put BOSS_PASSWORD_HASH     --env staging
npx wrangler secret put SESSION_SECRET         --env staging
npx wrangler secret put TURNSTILE_SECRET_KEY   --env staging
npx wrangler secret put COMMENT_IP_PEPPER      --env staging
```

Generate the hash first with `node scripts/hash-password.mjs`. Never paste
several secrets into one heredoc.

6. Put the staging Turnstile **site** key in the staging build environment as
   `PUBLIC_TURNSTILE_SITE_KEY`. It is public and may appear in HTML.

7. Verify no staging value equals a production value:

```powershell
npx wrangler d1 list
npx wrangler secret list --env staging
```

---

## Phase C — deploy and smoke-test staging

```powershell
pnpm build
npx wrangler deploy --env staging
```

Smoke test, in this order:

```powershell
# 1. The site renders
curl -I https://turkcyber-staging.dndr.net/

# 2. Staging is not indexable
curl -sI https://turkcyber-staging.dndr.net/ | findstr /i "x-robots-tag"
#    expect: noindex, nofollow

# 3. The beacon answers and reaches the database
curl -sI "https://turkcyber-staging.dndr.net/collect?path=turkcyber-staging.dndr.net/&referrer=&t=1"
#    expect: content-type: image/gif  and  x-turkcyber-collect: ok

# 4. A row landed, with country and city populated
npx wrangler d1 execute turkcyber-analytics-staging --env staging --remote ^
  --command "SELECT occurred_at, local_date, ip, country, city, source FROM visitor_events ORDER BY id DESC LIMIT 3"

# 5. The console refuses anonymous access
curl -sI https://turkcyber-staging.dndr.net/boss
#    expect: 401, plus cache-control: no-store and x-robots-tag: noindex, nofollow

# 6. Comments read path
curl -s "https://turkcyber-staging.dndr.net/api/comments?slug=passkey-nedir"
```

Then in a browser:

- sign in to `/boss`, confirm the summary cards and table render,
- apply a filter **with JavaScript disabled** and confirm it still narrows both
  the table and the counter,
- submit a comment, confirm it does **not** appear publicly,
- approve it in `/boss/comments/`, confirm it appears,
- confirm reloading an article twice in one session produces **one** row.

---

## Phase D — import legacy analytics into staging

Do this in staging first, always.

```powershell
node scripts/import-legacy-analytics.mjs --input <export-file> --source legacy_php --env staging --remote
```

The script writes SQL and prints the command; it never executes anything itself.

Before applying:

```powershell
npx wrangler d1 execute turkcyber-analytics-staging --env staging --remote ^
  --command "SELECT source, count(*) FROM visitor_events GROUP BY source"
```

Apply, then run the same count again and reconcile:

- imported row count matches the source file's record count minus reported skips,
- `source = 'worker'` count is **unchanged**,
- the date range matches the source,
- `/boss/analytics/` shows `#` continuous across the whole table and `DAY`
  restarting at local midnight.

**Do not run destructive cleanup on the historical source files until these
counts reconcile.**

---

## Phase E — provision production infrastructure

**No DNS or route change in this phase.** Creating these resources does not
affect the live site.

```powershell
npx wrangler d1 create turkcyber-app-production
npx wrangler d1 create turkcyber-analytics-production
npx wrangler kv namespace create THROTTLE_KV --env production
```

Fill `REPLACE_WITH_PRODUCTION_*` in `wrangler.jsonc` — **only the production
block**. Apply migrations with `--env production --remote`, listing before and
after.

Create a production Turnstile widget scoped to `turkcyber.com` only. Set the
five production secrets, one command each, with **different values** from
staging — particularly `SESSION_SECRET` and `COMMENT_IP_PEPPER`.

Never import staging comments, audit rows or analytics into production.

---

## Phase F — document and preserve rollback

Before anything public changes, record the current state so it can be restored.

1. Record the current DNS for `turkcyber.com`: every record, type, value, TTL,
   and whether it is proxied. Save it in the repository as
   `docs/dns-before-cutover.md` (no secrets).
2. Record the current nameservers and the registrar (GoDaddy).
3. **Take a full copy of the Hostinger document root and keep it.**
4. **Do not delete anything on Hostinger.** The legacy site stays in place,
   untouched, until the owner verifies the new site and removes it deliberately.
5. Record the legacy analytics source files' location and checksums.

Rollback = repoint DNS to Hostinger. That only works while Hostinger still
serves the old site, which is why nothing there is removed during cutover.

---

## Phase G — production deploy WITHOUT routes

```powershell
pnpm build
npx wrangler deploy --env production
```

With `routes: []` this publishes the Worker without attaching it to any
hostname. `turkcyber.com` is still served by Hostinger. Verify on the
`*.workers.dev` hostname that the site renders, `/boss` returns 401 and the
beacon returns a pixel.

This is the last phase that requires no authorization.

---

## Phase H — cutover  ⚠ REQUIRES EXPLICIT OWNER AUTHORIZATION

**Do not perform any step in this phase without the owner's explicit,
specific approval for this action.** Authorization for phases A–G is not
authorization for this one.

1. Confirm the zone `turkcyber.com` is on Cloudflare nameservers. Domain
   registration stays at GoDaddy; only DNS moves.

2. Add the routes to `env.production` in `wrangler.jsonc`:

```jsonc
"routes": [
  { "pattern": "turkcyber.com/collect*", "zone_name": "turkcyber.com" },
  { "pattern": "turkcyber.com/api/*",    "zone_name": "turkcyber.com" },
  { "pattern": "turkcyber.com/boss*",    "zone_name": "turkcyber.com" },
  { "pattern": "turkcyber.com/*",        "zone_name": "turkcyber.com" }
]
```

The trailing `*` on `/collect*` is required — see HANDOFF.md §10.

3. Deploy:

```powershell
pnpm build
npx wrangler deploy --env production
```

4. Smoke-test production, same list as phase C plus:

```powershell
curl -sI https://turkcyber.com/ | findstr /i "strict-transport-security"
#    expect HSTS present ONLY in production
curl -s https://turkcyber.com/robots.txt
curl -s https://turkcyber.com/sitemap.xml | findstr /i boss
#    expect: no output
```

5. Confirm `x-robots-tag: noindex` is **absent** in production (it is staging-only).

6. Watch `/boss/analytics/` for real traffic arriving with `source = 'worker'`.

---

## Phase I — after verification

Only once the owner has verified the new site over several days:

- import the legacy analytics into production and reconcile counts,
- submit the sitemap to search consoles,
- decommission the Hostinger site — **the owner does this, not an agent.**

---

## Stop conditions

Stop and ask, at any phase, if:

- a command prints an unexpected account, zone or database name,
- a `REPLACE_WITH_*` placeholder is still present in the block being deployed,
- a staging value would be reused in production,
- migration `list` shows something pending after `apply`,
- the beacon returns `no-database`,
- `/boss` returns anything other than 401 while signed out,
- `/boss` appears in `sitemap.xml` or is missing from `robots.txt`,
- any Hostinger file would be modified or deleted.
