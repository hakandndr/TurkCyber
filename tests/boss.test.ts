import { describe, expect, it } from 'vitest';
import { handleBoss } from '../worker/routes/boss';
import { IDLE_SECONDS, signSession } from '../worker/lib/auth';
import { fakeDb, fakeKv, makeHash } from './helpers';
import type { Env } from '../worker/lib/env';

const ORIGIN = 'https://turkcyber.com';
const SECRET = 'session-secret-for-tests-only-not-real';
const PASSWORD = 'a-good-owner-password';

async function makeEnv(over: Partial<Env> = {}): Promise<Env> {
  return {
    BOSS_USER: 'owner',
    BOSS_PASSWORD_HASH: await makeHash(PASSWORD),
    SESSION_SECRET: SECRET,
    ANALYTICS_DB: fakeDb({ rows: [], first: { total: 0, events: 0 } }),
    APP_DB: fakeDb({ rows: [], first: { n: 0 } }),
    THROTTLE_KV: fakeKv(),
    ANALYTICS_TIMEZONE: 'America/Los_Angeles',
    ENVIRONMENT: 'test',
    ...over,
  } as unknown as Env;
}

const get = (path = '/boss/', headers: Record<string, string> = {}): Request =>
  new Request(`${ORIGIN}${path}`, { headers });

const login = (username: string, password: string): Request => {
  const body = new FormData();
  body.set('username', username);
  body.set('password', password);
  return new Request(`${ORIGIN}/boss/login/`, {
    method: 'POST',
    headers: { origin: ORIGIN },
    body,
  });
};

async function authedCookie(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const token = await signSession({ u: 'owner', s: now, e: now + IDLE_SECONDS }, SECRET);
  return `tc_boss=${token}`;
}

describe('configuration', () => {
  it('returns 503 rather than a partly working panel when a secret is missing', async () => {
    for (const missing of ['BOSS_USER', 'BOSS_PASSWORD_HASH', 'SESSION_SECRET'] as const) {
      const env = await makeEnv({ [missing]: undefined });
      const response = await handleBoss(get(), env);
      expect(response.status).toBe(503);
      expect(await response.text()).toContain('not configured');
    }
  });
});

describe('anonymous access', () => {
  it('returns 401 and leaks no visitor data in the body', async () => {
    const env = await makeEnv();
    const response = await handleBoss(get(), env);
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    // No table, no summary numbers, no addresses.
    expect(body).not.toContain('ADDRESS');
    expect(body).not.toContain('all time');
    expect(body).toContain('Sign in');
  });

  it('carries the private headers on every response', async () => {
    const env = await makeEnv();
    const response = await handleBoss(get(), env);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('same-origin');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });
});

describe('sign-in', () => {
  it('refuses a wrong password and sets no cookie', async () => {
    const env = await makeEnv();
    const response = await handleBoss(login('owner', 'wrong'), env);

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(await response.text()).toContain('Kullanıcı adı veya şifre hatalı.');
  });

  it('produces an IDENTICAL response for a bad username and a bad password', async () => {
    // The strongest form of "do not reveal which half failed": the two
    // responses must be indistinguishable to the client.
    const wrongUser = await handleBoss(login('someone-else', PASSWORD), await makeEnv());
    const wrongPass = await handleBoss(login('owner', 'not-the-password'), await makeEnv());

    expect(wrongUser.status).toBe(wrongPass.status);
    expect(await wrongUser.text()).toBe(await wrongPass.text());
  });

  it('issues a hardened cookie on success', async () => {
    const env = await makeEnv();
    const response = await handleBoss(login('owner', PASSWORD), env);
    const cookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/boss/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('refuses a cross-origin login attempt', async () => {
    const env = await makeEnv();
    const body = new FormData();
    body.set('username', 'owner');
    body.set('password', PASSWORD);
    const response = await handleBoss(
      new Request(`${ORIGIN}/boss/login/`, {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
        body,
      }),
      env,
    );
    expect(response.status).toBe(403);
  });

  it('locks out after five failures — and refuses the CORRECT password meanwhile', async () => {
    const env = await makeEnv();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = await handleBoss(login('owner', 'wrong'), env);
      expect(response.status).toBe(401);
    }

    // Sixth attempt is throttled.
    const throttled = await handleBoss(login('owner', 'wrong'), env);
    expect(throttled.status).toBe(429);

    // The correct password is refused too, while the window is open.
    const correct = await handleBoss(login('owner', PASSWORD), env);
    expect(correct.status).toBe(429);
    expect(correct.headers.get('set-cookie')).toBeNull();
  });
});

describe('authenticated access', () => {
  it('renders the overview and refreshes the session cookie', async () => {
    const env = await makeEnv();
    const response = await handleBoss(get('/boss/', { cookie: await authedCookie() }), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(await response.text()).toContain('all time');
  });

  it('rejects a tampered cookie', async () => {
    const env = await makeEnv();
    const cookie = (await authedCookie()).replace('tc_boss=', 'tc_boss=x');
    const response = await handleBoss(get('/boss/', { cookie }), env);
    expect(response.status).toBe(401);
  });

  it('names the failure instead of throwing when a query fails', async () => {
    const env = await makeEnv({ ANALYTICS_DB: fakeDb({ throws: true }) as never });
    const response = await handleBoss(get('/boss/', { cookie: await authedCookie() }), env);
    expect(response.status).toBe(500);
    expect(await response.text()).toContain('Panel query failed');
  });

  it('reports an unbound analytics database as 503', async () => {
    const env = await makeEnv({ ANALYTICS_DB: undefined });
    const response = await handleBoss(get('/boss/', { cookie: await authedCookie() }), env);
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('ANALYTICS_DB is not bound');
  });
});

describe('moderation', () => {
  const form = (id: string): FormData => {
    const body = new FormData();
    body.set('id', id);
    body.set('status', 'pending');
    return body;
  };

  it('requires authentication', async () => {
    const env = await makeEnv();
    const response = await handleBoss(
      new Request(`${ORIGIN}/boss/comments/approve/`, {
        method: 'POST',
        headers: { origin: ORIGIN },
        body: form('1'),
      }),
      env,
    );
    expect(response.status).toBe(401);
  });

  it('shows private email, IP and available location only in authenticated moderation', async () => {
    const app = fakeDb({
      rows: [
        {
          id: 7,
          article_slug: 'passkey-nedir',
          parent_id: null,
          display_name: 'Ayşe',
          body: 'İncelenecek yorum.',
          status: 'pending',
          created_at: '2026-08-24T00:00:00.000Z',
          email: 'ayse@example.com',
          comment_ip: '203.0.113.42',
          country: 'US',
          city: 'Santa Ana',
          region_code: 'CA',
        },
      ],
    });
    const env = await makeEnv({ APP_DB: app as never });
    const response = await handleBoss(
      get('/boss/comments/', { cookie: await authedCookie() }),
      env,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(app.calls[0]!.sql).toMatch(/email, comment_ip, country, city, region_code/);
    expect(html).toContain('ayse@example.com');
    expect(html).toContain('203.0.113.42');
    expect(html).toMatch(/<b>country<\/b>US/);
    expect(html).toMatch(/<b>location<\/b>Santa Ana, CA/);
    expect(html).toContain('/passkey-nedir/');
  });

  it('renders safe fallbacks for historical comments without email or raw IP', async () => {
    const app = fakeDb({
      rows: [
        {
          id: 1,
          article_slug: 'eski-yazi',
          parent_id: null,
          display_name: 'Eski yorumcu',
          body: 'Migrasyon öncesi yorum.',
          status: 'pending',
          created_at: '2026-08-23T00:00:00.000Z',
          email: null,
          comment_ip: null,
          country: null,
          city: null,
          region_code: null,
        },
      ],
    });
    const response = await handleBoss(
      get('/boss/comments/', { cookie: await authedCookie() }),
      await makeEnv({ APP_DB: app as never }),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toMatch(/<b>email<\/b>—/);
    expect(html).toMatch(/<b>ip<\/b>—/);
    expect(html).toMatch(/<b>location<\/b>—/);
  });

  it('shows a compact pending badge across every authenticated boss page', async () => {
    for (const path of ['/boss/', '/boss/analytics/', '/boss/comments/', '/boss/system/']) {
      const app = fakeDb({ rows: [{ status: 'pending', n: 3 }], first: { n: 3 } });
      const env = await makeEnv({ APP_DB: app as never });
      const response = await handleBoss(get(path, { cookie: await authedCookie() }), env);
      const html = await response.text();

      expect(response.status, path).toBe(200);
      expect(html, path).toContain('aria-label="Comments, 3 pending comments"');
      expect(html, path).toContain('class="nav-badge" aria-hidden="true">3</span>');
    }
  });

  it('hides the pending badge at zero and renders the singular count', async () => {
    const zero = await handleBoss(get('/boss/', { cookie: await authedCookie() }), await makeEnv());
    expect(await zero.text()).not.toContain('<span class="nav-badge"');

    const one = await handleBoss(
      get('/boss/', { cookie: await authedCookie() }),
      await makeEnv({ APP_DB: fakeDb({ first: { n: 1 } }) as never }),
    );
    const html = await one.text();
    expect(html).toContain('aria-label="Comments, 1 pending comment"');
    expect(html).toContain('class="nav-badge" aria-hidden="true">1</span>');
  });

  it('requires POST — a GET must not mutate', async () => {
    const env = await makeEnv();
    const response = await handleBoss(
      get('/boss/comments/approve/', { cookie: await authedCookie() }),
      env,
    );
    expect(response.status).toBe(405);
  });

  it('requires a same-origin request', async () => {
    const env = await makeEnv();
    const response = await handleBoss(
      new Request(`${ORIGIN}/boss/comments/approve/`, {
        method: 'POST',
        headers: { origin: 'https://evil.example', cookie: await authedCookie() },
        body: form('1'),
      }),
      env,
    );
    expect(response.status).toBe(403);
  });

  it('writes an audit event alongside the status change', async () => {
    const db = fakeDb();
    const env = await makeEnv({ APP_DB: db as never });
    const response = await handleBoss(
      new Request(`${ORIGIN}/boss/comments/approve/`, {
        method: 'POST',
        headers: { origin: ORIGIN, cookie: await authedCookie() },
        body: form('42'),
      }),
      env,
    );

    expect(response.status).toBe(303);
    const sql = db.calls.map((c) => c.sql).join(' ');
    expect(sql).toContain('UPDATE comments');
    expect(sql).toContain('INSERT INTO audit_events');
    // The audit row records the actor and never a secret.
    const audit = db.calls.find((c) => c.sql.includes('audit_events'))!;
    expect(audit.params).toContain('owner');
    expect(audit.params.join(' ')).not.toContain(SECRET);
  });

  it('rejects a malformed comment id', async () => {
    const env = await makeEnv();
    const response = await handleBoss(
      new Request(`${ORIGIN}/boss/comments/approve/`, {
        method: 'POST',
        headers: { origin: ORIGIN, cookie: await authedCookie() },
        body: form('not-a-number'),
      }),
      env,
    );
    expect(response.status).toBe(400);
  });
});

/*
 * Manual analytics retention.
 *
 * /gizlilik/ promises visitor records are kept for at most 90 days. These
 * assertions keep that promise honest AND keep the delete from ever touching
 * anything it should not.
 */
describe('analytics retention', () => {
  /**
   * An environment whose analytics database reports `older` rows past the
   * cutoff. The fakes are returned alongside so the SQL they received can be
   * inspected — `Env` types them as D1Database, which has no `calls`.
   */
  const retentionEnv = async (older: number) => {
    const analytics = fakeDb({
      rows: [],
      first: {
        total: 500,
        oldest: '2026-01-01T00:00:00.000Z',
        newest: '2026-08-01T00:00:00.000Z',
        older,
      },
    });
    const app = fakeDb({ rows: [], first: { n: 0 } });
    const env = await makeEnv({
      ANALYTICS_DB: analytics as unknown as Env['ANALYTICS_DB'],
      APP_DB: app as unknown as Env['APP_DB'],
    });
    return { env, analytics, app };
  };

  const purgeRequest = async (confirm: string, sameOrigin = true): Promise<Request> => {
    const cookie = await authedCookie();
    const body = new FormData();
    body.set('confirm', confirm);
    return new Request(`${ORIGIN}/boss/analytics/purge/`, {
      method: 'POST',
      headers: sameOrigin ? { origin: ORIGIN, cookie } : { cookie },
      body,
    });
  };

  const hasDelete = (db: ReturnType<typeof fakeDb>): boolean =>
    db.calls.some((call) => /\bDELETE\b/i.test(call.sql));

  it('refuses anything but POST', async () => {
    const { env } = await retentionEnv(120);
    const response = await handleBoss(
      get('/boss/analytics/purge/', { cookie: await authedCookie() }),
      env,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('requires a session', async () => {
    const { env, analytics } = await retentionEnv(120);
    const body = new FormData();
    body.set('confirm', 'SIL');
    const response = await handleBoss(
      new Request(`${ORIGIN}/boss/analytics/purge/`, {
        method: 'POST',
        headers: { origin: ORIGIN },
        body,
      }),
      env,
    );
    expect(response.status).toBe(401);
    expect(hasDelete(analytics)).toBe(false);
  });

  it('refuses a cross-origin submission', async () => {
    const { env, analytics } = await retentionEnv(120);
    const response = await handleBoss(await purgeRequest('SIL', false), env);
    expect(response.status).toBe(403);
    expect(hasDelete(analytics)).toBe(false);
  });

  it('deletes nothing when the confirmation phrase does not match', async () => {
    const { env, analytics } = await retentionEnv(120);
    const response = await handleBoss(await purgeRequest('evet'), env);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('notice=unconfirmed');
    expect(hasDelete(analytics)).toBe(false);
  });

  it('deletes only from visitor_events, and only past the cutoff', async () => {
    const { env, analytics } = await retentionEnv(120);
    const response = await handleBoss(await purgeRequest('SIL'), env);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('notice=purged');

    const deletes = analytics.calls.filter((call) => /\bDELETE\b/i.test(call.sql));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]!.sql).toContain('visitor_events');
    // The cutoff is a bound parameter, never interpolated.
    expect(deletes[0]!.sql).toContain('occurred_at < ?');
    expect(String(deletes[0]!.params[0])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  /*
   * The single most important assertion in this file. APP_DB holds the
   * comments and the audit trail; the retention promise does not cover them,
   * and a DELETE aimed there would be unrecoverable.
   */
  it('never issues a delete against APP_DB', async () => {
    const { env, app } = await retentionEnv(120);
    await handleBoss(await purgeRequest('SIL'), env);

    for (const call of app.calls) {
      expect(call.sql, `APP_DB received: ${call.sql}`).not.toMatch(/\bDELETE\b/i);
    }
  });

  it('writes an audit record naming the operator and the count', async () => {
    const { env, app } = await retentionEnv(120);
    await handleBoss(await purgeRequest('SIL'), env);

    const audit = app.calls.find((call) => /INSERT INTO audit_events/i.test(call.sql));
    expect(audit).toBeDefined();
    expect(audit!.sql).toContain('analytics_purge');
    expect(audit!.params).toContain('owner');
    expect(audit!.params.join(' ')).toContain('120');
    expect(audit!.params.join(' ')).not.toContain(SECRET);
  });

  it('does nothing when there is nothing older than the window', async () => {
    const { env, analytics } = await retentionEnv(0);
    const response = await handleBoss(await purgeRequest('SIL'), env);

    expect(response.headers.get('location')).toContain('notice=nothing');
    expect(hasDelete(analytics)).toBe(false);
  });

  it('shows the retention counts on the system page', async () => {
    const { env } = await retentionEnv(42);
    const response = await handleBoss(get('/boss/system/', { cookie: await authedCookie() }), env);
    const html = await response.text();

    expect(html).toContain('retention');
    // The count is in the button label, so it cannot be pressed unread.
    expect(html).toMatch(/42 kaydı sil/);
  });

  it('offers no delete button when there is nothing to delete', async () => {
    const { env } = await retentionEnv(0);
    const html = await (
      await handleBoss(get('/boss/system/', { cookie: await authedCookie() }), env)
    ).text();

    expect(html).not.toContain('kaydı sil');
    expect(html).toContain('Silinecek bir şey bulunmuyor');
  });
});
