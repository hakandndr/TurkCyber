import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COMMENT_MODERATION_URL,
  COMMENT_NOTIFICATION_FROM,
  COMMENT_NOTIFICATION_SUBJECT,
  COMMENT_NOTIFICATION_TO,
  buildCommentNotificationText,
  commentNotificationIdempotencyKey,
  sendCommentNotification,
  type PendingCommentNotification,
} from '../worker/lib/comment-notification';
import { handleComments } from '../worker/routes/comments';
import { formatOwnerTimestamp } from '../worker/lib/time';
import { fakeCtx, fakeDb, fakeKv } from './helpers';
import type { Env } from '../worker/lib/env';

const ORIGIN = 'https://turkcyber.com';
const RESEND_URL = 'https://api.resend.com/emails';

const notification = (
  overrides: Partial<PendingCommentNotification> = {},
): PendingCommentNotification => ({
  id: 42,
  environment: 'staging',
  author: 'Staging Test',
  email: 'owner@example.com',
  ip: '203.0.113.42',
  country: 'US',
  city: 'Santa Ana',
  regionCode: 'CA',
  createdAt: '2026-08-24T12:00:00.000Z',
  timeZone: 'America/Los_Angeles',
  articleSlug: 'passkey-nedir',
  body: 'Clearly labeled staging test comment.',
  ...overrides,
});

const commentRequest = (): Request => {
  const request = new Request(`${ORIGIN}/api/comments`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      'cf-connecting-ip': '203.0.113.42',
    },
    body: JSON.stringify({
      slug: 'passkey-nedir',
      name: 'Staging Test',
      email: 'owner@example.com',
      body: 'Clearly labeled staging test comment.',
      turnstileToken: 'valid-test-token',
    }),
  });
  Object.defineProperty(request, 'cf', {
    value: { country: 'US', city: 'Santa Ana', regionCode: 'CA' },
  });
  return request;
};

const env = (db: ReturnType<typeof fakeDb>): Env =>
  ({
    APP_DB: db,
    THROTTLE_KV: fakeKv(),
    TURNSTILE_SECRET_KEY: 'test',
    COMMENT_IP_PEPPER: 'pepper',
    RESEND_API_KEY: 'resend-test-secret',
    ENVIRONMENT: 'staging',
  }) as unknown as Env;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('comment notification content', () => {
  it('uses the exact sender, recipient, subject, moderation URL and private context', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    });

    await sendCommentNotification('private-api-key', notification(), fetcher);

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe(RESEND_URL);
    const payload = JSON.parse(String(requests[0]!.init?.body)) as Record<string, unknown>;
    expect(payload).toMatchObject({
      from: COMMENT_NOTIFICATION_FROM,
      to: [COMMENT_NOTIFICATION_TO],
      subject: COMMENT_NOTIFICATION_SUBJECT,
    });
    expect(payload.text).toContain('Comment ID: 42');
    expect(payload.text).toContain('Location: Santa Ana, CA (US)');
    expect(payload.text).toContain('Timestamp: Aug 24, 2026 · 5:00 AM PDT');
    expect(payload.text).toContain(COMMENT_MODERATION_URL);
    expect(JSON.stringify(payload)).not.toContain('private-api-key');
    expect(JSON.stringify(payload)).not.toContain('valid-test-token');
    expect(JSON.stringify(payload)).not.toMatch(/password|session|hash/i);
  });

  it('renders missing optional moderation fields safely', () => {
    const text = buildCommentNotificationText(
      notification({ email: null, ip: null, country: null, city: null, regionCode: null }),
    );
    expect(text).toContain('Email: —');
    expect(text).toContain('IP: —');
    expect(text).toContain('Location: —');
  });

  it('converts UTC timestamps to the configured timezone with DST-aware labels', () => {
    expect(formatOwnerTimestamp('2026-08-24T08:57:48.621Z', 'America/Los_Angeles')).toBe(
      'Aug 24, 2026 · 1:57 AM PDT',
    );
    expect(formatOwnerTimestamp('2026-01-15T20:00:00.000Z', 'America/Los_Angeles')).toBe(
      'Jan 15, 2026 · 12:00 PM PST',
    );
  });

  it('uses a stable comment identity so provider retries deliver once', async () => {
    const delivered = new Set<string>();
    let deliveryCount = 0;
    const keys: string[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const key = new Headers(init?.headers).get('idempotency-key')!;
      keys.push(key);
      if (!delivered.has(key)) {
        delivered.add(key);
        deliveryCount += 1;
      }
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    });
    const value = notification();

    await sendCommentNotification('key', value, fetcher);
    await sendCommentNotification('key', value, fetcher);

    expect(keys).toEqual([
      commentNotificationIdempotencyKey(value),
      commentNotificationIdempotencyKey(value),
    ]);
    expect(deliveryCount).toBe(1);
  });
});

describe('comment notification scheduling', () => {
  it('schedules exactly one notification, only after the pending insert succeeds', async () => {
    const events: string[] = [];
    const db = fakeDb({ onRun: () => events.push('insert') });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('siteverify')) {
        events.push('turnstile');
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url === RESEND_URL) {
        events.push('resend');
        return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const ctx = fakeCtx();

    const response = await handleComments(commentRequest(), env(db), ctx);
    await ctx.settled();

    expect(response.status).toBe(202);
    expect(ctx.promises).toHaveLength(1);
    expect(events.indexOf('insert')).toBeLessThan(events.indexOf('resend'));
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === RESEND_URL)).toHaveLength(1);
  });

  it('schedules no notification when the comment insert fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    );
    const ctx = fakeCtx();

    const response = await handleComments(commentRequest(), env(fakeDb({ throws: true })), ctx);

    expect(response.status).toBe(503);
    expect(ctx.promises).toHaveLength(0);
  });

  it('schedules no notification when Turnstile fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })),
    );
    const db = fakeDb();
    const ctx = fakeCtx();

    const response = await handleComments(commentRequest(), env(db), ctx);

    expect(response.status).toBe(400);
    expect(db.calls).toHaveLength(0);
    expect(ctx.promises).toHaveLength(0);
  });

  it('keeps the public submission successful when Resend fails and logs safely', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('siteverify')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      return new Response('provider failure', { status: 503 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ctx = fakeCtx();

    const response = await handleComments(commentRequest(), env(fakeDb()), ctx);
    await ctx.settled();

    expect(response.status).toBe(202);
    expect(ctx.promises).toHaveLength(1);
    const log = error.mock.calls.flat().join(' ');
    expect(log).toContain('comment_notification_failed');
    expect(log).toContain('"comment_id":1');
    expect(log).toContain('"provider":"resend"');
    expect(log).toContain('"status":503');
    expect(log).not.toContain('resend-test-secret');
    expect(log).not.toContain('owner@example.com');
    expect(log).not.toContain('203.0.113.42');
  });
});
