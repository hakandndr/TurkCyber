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
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
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
