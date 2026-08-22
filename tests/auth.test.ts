import { describe, expect, it } from 'vitest';
import {
  ABSOLUTE_SECONDS,
  IDLE_SECONDS,
  clearedSessionCookie,
  readCookie,
  refreshSession,
  sessionCookie,
  signSession,
  timingSafeEqual,
  verifyPassword,
  verifySession,
} from '../worker/lib/auth';
import { makeHash } from './helpers';

const SECRET = 'test-secret-value-long-enough-to-be-realistic';

describe('verifyPassword', () => {
  it('accepts the correct password', async () => {
    const hash = await makeHash('correct horse battery staple');
    const result = await verifyPassword('correct horse battery staple', hash);
    expect(result.ok).toBe(true);
    expect(result.reason).toBe('ok');
  });

  it('rejects the wrong password', async () => {
    const hash = await makeHash('correct horse battery staple');
    const result = await verifyPassword('wrong password', hash);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('mismatch');
  });

  it('rejects an empty password', async () => {
    const hash = await makeHash('something');
    const result = await verifyPassword('', hash);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty-password');
  });

  it('rejects a bcrypt hash rather than throwing', async () => {
    const bcrypt = '$2b$12$abcdefghijklmnopqrstuv.wxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012';
    const result = await verifyPassword('anything', bcrypt);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('hash-format');
  });

  it('rejects a malformed hash rather than throwing', async () => {
    for (const bad of ['', 'pbkdf2$100000$onlythree', 'notpbkdf2$100000$a$b', 'pbkdf2$$$']) {
      const result = await verifyPassword('anything', bad);
      expect(result.ok).toBe(false);
    }
  });

  it('REJECTS an out-of-range iteration count by returning false, not throwing', async () => {
    // Above the Workers ceiling. This must be a clean false: the runtime throws
    // NotSupportedError for these parameters, and an unusable stored hash must
    // not take the request down.
    const tooMany = (await makeHash('pw', 100_000)).replace('$100000$', '$200000$');
    const tooFew = (await makeHash('pw', 100_000)).replace('$100000$', '$10$');

    const high = await verifyPassword('pw', tooMany);
    expect(high.ok).toBe(false);
    expect(high.reason).toBe('iterations-out-of-range');

    const low = await verifyPassword('pw', tooFew);
    expect(low.ok).toBe(false);
    expect(low.reason).toBe('iterations-out-of-range');
  });

  it('accepts exactly 100000 iterations — the documented ceiling', async () => {
    const hash = await makeHash('pw', 100_000);
    expect((await verifyPassword('pw', hash)).ok).toBe(true);
  });
});

describe('timingSafeEqual', () => {
  it('compares equal and unequal arrays', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe('session tokens', () => {
  const now = 1_800_000_000;

  it('round-trips a valid session', async () => {
    const token = await signSession({ u: 'owner', s: now, e: now + IDLE_SECONDS }, SECRET);
    const payload = await verifySession(token, SECRET, now + 10);
    expect(payload?.u).toBe('owner');
  });

  it('rejects a token signed with a different key', async () => {
    const token = await signSession({ u: 'owner', s: now, e: now + IDLE_SECONDS }, SECRET);
    expect(await verifySession(token, 'another-secret', now)).toBeNull();
  });

  it('rejects an edited payload', async () => {
    const token = await signSession({ u: 'owner', s: now, e: now + IDLE_SECONDS }, SECRET);
    const [, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'attacker', s: now, e: now + 9999 })).toString(
      'base64url',
    );
    expect(await verifySession(`${forged}.${signature}`, SECRET, now)).toBeNull();
  });

  it('rejects garbage and missing tokens', async () => {
    expect(await verifySession(null, SECRET, now)).toBeNull();
    expect(await verifySession('', SECRET, now)).toBeNull();
    expect(await verifySession('nodot', SECRET, now)).toBeNull();
    expect(await verifySession('.sig', SECRET, now)).toBeNull();
    expect(await verifySession('body.', SECRET, now)).toBeNull();
  });

  it('enforces the idle timeout', async () => {
    const token = await signSession({ u: 'owner', s: now, e: now + IDLE_SECONDS }, SECRET);
    expect(await verifySession(token, SECRET, now + IDLE_SECONDS - 1)).not.toBeNull();
    expect(await verifySession(token, SECRET, now + IDLE_SECONDS + 1)).toBeNull();
  });

  it('enforces the absolute deadline across continuous activity', async () => {
    // Refresh every 20 minutes for nine hours. Activity must not extend the
    // session past the eight-hour cap.
    let payload = { u: 'owner', s: now, e: now + IDLE_SECONDS };
    let clock = now;
    let alive = true;

    for (let minute = 20; minute <= 9 * 60; minute += 20) {
      clock = now + minute * 60;
      const token = await signSession(payload, SECRET);
      const verified = await verifySession(token, SECRET, clock);
      if (!verified) {
        alive = false;
        break;
      }
      payload = refreshSession(verified, clock);
    }

    expect(alive).toBe(false);
    expect(clock).toBeGreaterThan(now + ABSOLUTE_SECONDS);
  });
});

describe('cookies', () => {
  it('sets HttpOnly, Secure and SameSite=Lax', () => {
    const cookie = sessionCookie('token-value');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });

  it('clears with Max-Age=0 and the same attributes', () => {
    const cookie = clearedSessionCookie();
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
  });

  it('reads a named cookie out of a header', () => {
    expect(readCookie('a=1; tc_boss=xyz; b=2', 'tc_boss')).toBe('xyz');
    expect(readCookie('a=1', 'tc_boss')).toBeNull();
    expect(readCookie(null, 'tc_boss')).toBeNull();
  });
});
