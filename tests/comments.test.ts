import { afterEach, describe, expect, it, vi } from 'vitest';
import { threadComments, validateComment, type PublicComment } from '../worker/lib/comments';
import { handleComments } from '../worker/routes/comments';
import { isSameOrigin } from '../worker/lib/http';
import { bump, peek, reset } from '../worker/lib/throttle';
import { verifyTurnstile } from '../worker/lib/turnstile';
import { fakeDb, fakeKv } from './helpers';
import type { Env } from '../worker/lib/env';

const ORIGIN = 'https://turkcyber.com';

const post = (body: unknown, headers: Record<string, string> = {}): Request =>
  new Request(`${ORIGIN}/api/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('validateComment', () => {
  const valid = { slug: 'passkey-nedir', name: 'Ayşe', body: 'Faydalı bir rehber olmuş.' };

  it('accepts a well-formed comment', () => {
    const result = validateComment(valid);
    expect(result.ok).toBe(true);
  });

  it('rejects an invalid slug', () => {
    for (const slug of ['', '../etc/passwd', 'Has Spaces', 'trailing-', 'a//b', 'x.y']) {
      const result = validateComment({ ...valid, slug });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.field).toBe('slug');
    }
  });

  it('normalises slug case rather than rejecting it', () => {
    // Build-generated slugs are lowercase, but a link with different casing
    // should still resolve to the same article rather than failing.
    const result = validateComment({ ...valid, slug: 'Passkey-Nedir' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.articleSlug).toBe('passkey-nedir');
  });

  it('rejects a too-short name and body', () => {
    expect(validateComment({ ...valid, name: 'A' }).ok).toBe(false);
    expect(validateComment({ ...valid, body: 'ab' }).ok).toBe(false);
  });

  it('truncates oversized input rather than accepting it whole', () => {
    const result = validateComment({ ...valid, body: 'a'.repeat(5000) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.body.length).toBe(2000);
  });

  it('treats HTML as text — it is stored verbatim, never as markup', () => {
    const result = validateComment({ ...valid, body: '<script>alert(1)</script> selam' });
    expect(result.ok).toBe(true);
    // Nothing is stripped or "sanitised into" markup; it stays literal text and
    // is escaped at render time.
    if (result.ok) expect(result.value.body).toContain('<script>');
  });

  it('rejects a malformed parent id', () => {
    expect(validateComment({ ...valid, parentId: 'abc' }).ok).toBe(false);
    expect(validateComment({ ...valid, parentId: '-3' }).ok).toBe(false);
    expect(validateComment({ ...valid, parentId: '7' }).ok).toBe(true);
  });

  it('preserves Turkish characters', () => {
    const result = validateComment({ ...valid, name: 'Çağrı', body: 'Şifre güvenliği önemli.' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.displayName).toBe('Çağrı');
      expect(result.value.body).toBe('Şifre güvenliği önemli.');
    }
  });
});

describe('threadComments', () => {
  const at = (n: number): string => `2026-08-0${n}T00:00:00Z`;
  const rows: PublicComment[] = [
    { id: 1, parentId: null, displayName: 'A', body: 'root', createdAt: at(1) },
    { id: 2, parentId: 1, displayName: 'B', body: 'reply', createdAt: at(2) },
    { id: 3, parentId: 2, displayName: 'C', body: 'reply to reply', createdAt: at(3) },
    { id: 4, parentId: null, displayName: 'D', body: 'other root', createdAt: at(4) },
  ];

  it('keeps threading to a single level', () => {
    const threaded = threadComments(rows);
    expect(threaded).toHaveLength(2);
    // The reply-to-a-reply is attached to the top-level root, not nested deeper.
    expect(threaded[0]!.replies.map((r) => r.id)).toEqual([2, 3]);
    expect(threaded[1]!.replies).toEqual([]);
  });

  it('drops orphans and survives a cycle without hanging', () => {
    const cyclic: PublicComment[] = [
      { id: 10, parentId: 11, displayName: 'X', body: 'a', createdAt: at(1) },
      { id: 11, parentId: 10, displayName: 'Y', body: 'b', createdAt: at(2) },
    ];
    expect(threadComments(cyclic)).toEqual([]);
    expect(
      threadComments([{ id: 20, parentId: 999, displayName: 'Z', body: 'c', createdAt: at(1) }]),
    ).toEqual([]);
  });
});

describe('same-origin enforcement', () => {
  it('accepts a matching origin and refuses everything else', () => {
    expect(isSameOrigin(post({}, { origin: ORIGIN }))).toBe(true);
    expect(isSameOrigin(post({}, { origin: 'https://evil.example' }))).toBe(false);
    expect(isSameOrigin(post({}, { origin: 'null', referer: `${ORIGIN}/boss/login/` }))).toBe(true);
    expect(
      isSameOrigin(post({}, { origin: 'null', referer: 'https://evil.example/boss/login/' })),
    ).toBe(false);
    expect(isSameOrigin(post({}, { origin: 'null' }))).toBe(false);
    // No Origin and no Referer: refuse rather than assume.
    const bare = new Request(`${ORIGIN}/api/comments`, { method: 'POST' });
    expect(isSameOrigin(bare)).toBe(false);
  });
});

describe('POST /api/comments', () => {
  const baseEnv = (over: Partial<Env> = {}): Env =>
    ({
      APP_DB: fakeDb(),
      THROTTLE_KV: fakeKv(),
      TURNSTILE_SECRET_KEY: undefined,
      COMMENT_IP_PEPPER: 'pepper',
      ...over,
    }) as unknown as Env;

  it('refuses a cross-origin submission', async () => {
    const response = await handleComments(
      post(
        { slug: 'passkey-nedir', name: 'Ali', body: 'merhaba' },
        { origin: 'https://evil.example' },
      ),
      baseEnv(),
    );
    expect(response.status).toBe(403);
  });

  it('rejects an unparsable body', async () => {
    const response = await handleComments(post('{not json'), baseEnv());
    expect(response.status).toBe(400);
  });

  it('rejects invalid input before touching the database', async () => {
    const db = fakeDb();
    const response = await handleComments(
      post({ slug: 'ok-slug', name: 'A', body: 'x' }),
      baseEnv({ APP_DB: db as never }),
    );
    expect(response.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it('rejects an oversized payload', async () => {
    const response = await handleComments(
      post({ slug: 'passkey-nedir', name: 'Ali', body: 'a'.repeat(20_000) }),
      baseEnv(),
    );
    expect(response.status).toBe(413);
  });

  it('fails closed when Turnstile cannot be verified', async () => {
    // No secret configured means the check cannot be performed. The submission
    // is refused rather than accepted unverified.
    const db = fakeDb();
    const response = await handleComments(
      post({ slug: 'passkey-nedir', name: 'Ali', body: 'merhaba dünya' }),
      baseEnv({ APP_DB: db as never }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'turnstile' });
    expect(db.calls).toHaveLength(0);
  });

  it('returns 503 rather than throwing when APP_DB is unbound', async () => {
    const response = await handleComments(
      post({ slug: 'passkey-nedir', name: 'Ali', body: 'merhaba dünya' }),
      baseEnv({ APP_DB: undefined }),
    );
    expect(response.status).toBe(503);
  });

  it('only allows GET and POST', async () => {
    const response = await handleComments(
      new Request(`${ORIGIN}/api/comments`, { method: 'DELETE' }),
      baseEnv(),
    );
    expect(response.status).toBe(405);
  });

  it('stores new moderation IP and Cloudflare location separately from the keyed hash', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true }), {
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const db = fakeDb();
    const request = post(
      {
        slug: 'passkey-nedir',
        name: 'Ayşe',
        email: 'ayse@example.com',
        body: 'Moderasyon bağlamı için test yorumu.',
        turnstileToken: 'valid-test-token',
      },
      { 'cf-connecting-ip': '203.0.113.42' },
    );
    Object.defineProperty(request, 'cf', {
      value: { country: 'US', city: 'Santa Ana', regionCode: 'CA' },
    });

    const response = await handleComments(
      request,
      baseEnv({ APP_DB: db as never, TURNSTILE_SECRET_KEY: 'test' }),
    );

    expect(response.status).toBe(202);
    const insert = db.calls.find((call) => call.sql.includes('INSERT INTO comments'))!;
    expect(insert.sql).toContain('ip_hash');
    expect(insert.sql).toContain('comment_ip');
    expect(insert.sql).toContain('city');
    expect(insert.sql).toContain('region_code');
    expect(insert.params).toContain('203.0.113.42');
    expect(insert.params).toContain('US');
    expect(insert.params).toContain('Santa Ana');
    expect(insert.params).toContain('CA');
    expect(insert.params).toContain('ayse@example.com');
    expect(
      insert.params.find((value) => typeof value === 'string' && value.length === 64),
    ).toBeDefined();
  });
});

describe('GET /api/comments', () => {
  it('requests only approved comments for the slug', async () => {
    const db = fakeDb({ rows: [] });
    const response = await handleComments(
      new Request(`${ORIGIN}/api/comments?slug=passkey-nedir`),
      { APP_DB: db } as unknown as Env,
    );
    expect(response.status).toBe(200);
    expect(db.calls[0]!.sql).toContain("status = 'approved'");
    expect(db.calls[0]!.params).toEqual(['passkey-nedir']);
  });

  it('never returns pending comments to the public endpoint', async () => {
    const db = fakeDb({ rows: [] });
    await handleComments(new Request(`${ORIGIN}/api/comments?slug=x-y`), {
      APP_DB: db,
    } as unknown as Env);
    expect(db.calls[0]!.sql).not.toContain('pending');
  });

  it('never selects or returns private email, IP, hash or location metadata', async () => {
    const db = fakeDb({
      rows: [
        {
          id: 1,
          parent_id: null,
          display_name: 'Ayşe',
          body: 'Herkese açık yorum.',
          created_at: '2026-08-24T00:00:00.000Z',
          email: 'private@example.com',
          comment_ip: '203.0.113.42',
          ip_hash: 'private-hash',
          country: 'TR',
          city: 'İstanbul',
          region_code: '34',
        },
      ],
    });
    const response = await handleComments(
      new Request(`${ORIGIN}/api/comments?slug=passkey-nedir`),
      { APP_DB: db } as unknown as Env,
    );
    const body = await response.text();

    expect(db.calls[0]!.sql).not.toMatch(/email|comment_ip|ip_hash|country|city|region_code/i);
    expect(body).not.toContain('private@example.com');
    expect(body).not.toContain('203.0.113.42');
    expect(body).not.toContain('private-hash');
    expect(body).not.toContain('İstanbul');
  });

  it('degrades to a 503 with an empty list when the query fails', async () => {
    const response = await handleComments(new Request(`${ORIGIN}/api/comments?slug=x-y`), {
      APP_DB: fakeDb({ throws: true }),
    } as unknown as Env);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ comments: [], unavailable: true });
  });
});

describe('throttling', () => {
  it('blocks after the limit and clears on reset', async () => {
    const kv = fakeKv();
    const key = 'login:1.2.3.4';

    for (let i = 1; i <= 4; i += 1) {
      const state = await bump(kv as never, key, 5, 900);
      expect(state.blocked).toBe(false);
    }
    const fifth = await bump(kv as never, key, 5, 900);
    expect(fifth.blocked).toBe(true);

    // A correct password must still be refused while the window is open.
    expect((await peek(kv as never, key, 5)).blocked).toBe(true);

    await reset(kv as never, key);
    expect((await peek(kv as never, key, 5)).blocked).toBe(false);
  });

  it('is a no-op when KV is unbound rather than throwing', async () => {
    expect((await bump(undefined, 'k', 5, 900)).blocked).toBe(false);
    expect((await peek(undefined, 'k', 5)).blocked).toBe(false);
  });
});

describe('verifyTurnstile', () => {
  it('fails closed on a missing secret or token', async () => {
    expect((await verifyTurnstile('token', undefined)).ok).toBe(false);
    expect((await verifyTurnstile(null, 'secret')).ok).toBe(false);
  });
});
