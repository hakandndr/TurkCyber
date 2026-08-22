# Security

## Reporting

Email `admin@turkcyber.com`. Please include enough detail to reproduce. There is
no bug bounty; reports are read and acted on.

Do not open a public GitHub issue for a vulnerability.

---

## Trust boundaries

| Boundary                  | What crosses it                          | Treatment                                                                      |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| Visitor → `/collect`      | query params, headers                    | sanitised, capped at 300 chars, bound into SQL                                 |
| Visitor → `/api/comments` | JSON body                                | validated, length-capped, Turnstile-verified, same-origin required             |
| Visitor → static site     | nothing                                  | fully static                                                                   |
| Operator → `/boss`        | credentials, filters, moderation actions | password + signed session; all filters bound; all mutations POST + same-origin |
| Database → `/boss` HTML   | attacker-controlled strings              | escaped at render                                                              |

**The rows in the analytics table are attacker-controlled.** User agents,
referrers and paths are written by whoever made the request. A private panel
that renders them raw is a stored XSS against the only account that matters.
Every value passes through `escapeHtml` in `worker/routes/boss-views.ts`, and a
test renders a row containing `<script>` and asserts it appears as text.

---

## SQL

Every request-derived value is a bound parameter. There is exactly one piece of
interpolated SQL in the codebase: `BOT_SQL` in `worker/lib/ua.ts`, built from a
compile-time constant array in the same file. It contains no request data.

`tests/analytics.test.ts` submits `1.2.3.4' OR 1=1 --` as an IP filter and
asserts the string travels as a bound parameter and never appears in the clause.

---

## Authentication

- PBKDF2-SHA256, 16-byte salt, 256 derived bits.
- **100,000 iterations is a hard ceiling**, not a tuning choice: the Workers
  runtime throws `NotSupportedError` above it. Raising it breaks sign-in at
  runtime, not at build time.
- Verification returns `false` for a malformed hash or an out-of-range iteration
  count rather than throwing — a bad stored secret must not take down the
  request.
- Constant-time comparison for both the derived bits and the session signature.
- Session cookies are `HttpOnly; Secure; SameSite=Lax; Path=/`.
- Idle timeout 30 minutes (refreshed); absolute timeout 8 hours (never moved).
- The signature is verified **before** the payload is parsed.
- Five failed attempts per IP per 15 minutes returns `429`, and the correct
  password is refused while the window is open.
- The visitor sees only `Kullanıcı adı veya şifre hatalı.` A test asserts the
  responses for a wrong username and a wrong password are byte-identical.
- The operator log reports _which check_ failed, never a value:
  `boss: sign-in refused (user mismatch, password failed, reason mismatch)`.

If any of `BOSS_USER`, `BOSS_PASSWORD_HASH` or `SESSION_SECRET` is missing, the
console returns `503 Panel is not configured` — never a partially working panel.

---

## Comments

- Turnstile is verified server-side and **fails closed**: a missing secret,
  missing token or network error all reject the submission.
- Same-origin is required explicitly, not left to `SameSite` alone.
- Rate limited to 3 submissions per abuse key per 10 minutes.
- Body capped at 2,000 characters; the request body is capped at 16 KB.
- HTML is never interpreted. It is stored verbatim and escaped at render.
- Nothing is publicly readable before an owner approves it — the public query
  filters `status = 'approved'` and a test asserts the word `pending` never
  appears in that SQL.
- No raw IP is stored. `ip_hash` is HMAC-SHA256 keyed with `COMMENT_IP_PEPPER`.

---

## Secrets

The GitHub repository is **public**. Assume every committed byte is public
forever.

Never commit: Cloudflare API tokens, D1 identifiers you consider sensitive,
passwords, password hashes, `SESSION_SECRET`, the Turnstile secret key,
`COMMENT_IP_PEPPER`, `.dev.vars`, `.env`, private analytics exports, or any
export containing full IP addresses.

`.gitignore` covers these. `pnpm scan:secrets` is the second layer: it checks
tracked files for credential shapes and for paths that must never be tracked,
and it runs in CI before anything else.

Set each secret as its own command:

```bash
npx wrangler secret put BOSS_USER
npx wrangler secret put BOSS_PASSWORD_HASH
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put COMMENT_IP_PEPPER
```

Piping several into one heredoc has scrambled them in practice and produced
three different failure modes at sign-in.

---

## Privacy commitments that are code, not prose

`/gizlilik/` states that full IP addresses are stored in the private analytics
database, that comments store only a non-reversible hash, that there is **no**
automatic retention job, and that Google Fonts receives the visitor's IP.

Each of those statements corresponds to something in the code. If any of them
changes — a retention job is added, fonts are self-hosted, a field is dropped —
`src/pages/gizlilik.astro` changes in the same commit. A privacy policy that
disagrees with the implementation is worse than none.

---

## Known gaps

- **No automated retention.** Analytics rows persist until deleted by hand. The
  privacy page says exactly this rather than promising a window that nothing
  enforces. Adding a scheduled cleanup is a small, well-scoped change; the
  privacy text must move with it.
- **Google Fonts is a third-party request.** Self-hosting removes it — see
  ARCHITECTURE.md §11.
- **KV rate limiting is not atomic.** Read-modify-write can undercount under
  concurrent requests from one address. Acceptable for an abuse brake; not
  suitable if it ever becomes an accounting record.
- **No CSP reporting endpoint.** Violations are invisible until someone notices.
