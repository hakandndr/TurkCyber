import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../worker/lib/env';
import {
  DNDR_FORWARD_ATTEMPTS,
  DNDR_FORWARD_ENVIRONMENTS,
  dndrForwardingEnabled,
  forwardToDndr,
  insertedRowId,
  producerEventId,
  type DndrPageEvent,
  type DndrResult,
} from '../worker/lib/dndr-forward';
import { handleCollect } from '../worker/routes/collect';
import { fakeCtx, fakeDb } from './helpers';

// Addresses come from reserved documentation ranges (RFC 5737).
const VISITOR = '203.0.113.91';

function beacon(host = 'turkcyber-staging.dndr.net'): Request {
  const request = new Request(
    `https://${host}/collect?path=${encodeURIComponent(`${host}/teknik/ornek-yazi/`)}&referrer=https%3A%2F%2Fwww.google.com%2F&t=1`,
    {
      headers: {
        'user-agent': 'Mozilla/5.0 Chrome/121.0.0.0 Safari/537.36',
        'cf-connecting-ip': VISITOR,
      },
    },
  );
  Object.defineProperty(request, 'cf', {
    value: { country: 'TR', city: 'Istanbul', region: 'Istanbul', regionCode: '34', asn: 64496 },
  });
  return request;
}

function collector(result: DndrResult | (() => Promise<DndrResult>) = { status: 'accepted' }) {
  const calls: DndrPageEvent[] = [];
  return {
    calls,
    async recordPage(event: DndrPageEvent): Promise<DndrResult> {
      calls.push(event);
      return typeof result === 'function' ? result() : result;
    },
  };
}

function stagingEnv(extra: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: 'staging',
    ANALYTICS_TIMEZONE: 'America/Los_Angeles',
    ANALYTICS_DB: fakeDb({ runResult: { success: true, meta: { changes: 1, last_row_id: 41 } } }),
    ...extra,
  } as unknown as Env;
}

async function collect(env: Env, request = beacon()) {
  const ctx = fakeCtx();
  const response = await handleCollect(request, env, ctx as never);
  await ctx.settled();
  return response;
}

describe('the source analytics write is unchanged', () => {
  it('writes the same one row with the same 15 bound values, with or without DNDR', async () => {
    const plain = fakeDb();
    await collect({
      ANALYTICS_DB: plain,
      ANALYTICS_TIMEZONE: 'America/Los_Angeles',
    } as unknown as Env);
    const dndr = collector();
    const withDndr = fakeDb();
    await collect(stagingEnv({ ANALYTICS_DB: withDndr as never, DNDR_COLLECTOR: dndr }));
    expect(withDndr.calls).toHaveLength(1);
    expect(withDndr.calls[0]!.sql).toBe(plain.calls[0]!.sql);
    // Same values apart from the instant and the local date.
    const strip = (params: unknown[]) => params.filter((_, index) => index > 1);
    expect(strip(withDndr.calls[0]!.params)).toEqual(strip(plain.calls[0]!.params));
    expect(dndr.calls).toHaveLength(1);
  });
});

describe('DNDR forwarding is additive and staging-only', () => {
  it('forwards the stored row with its own id as the producer event id', async () => {
    const dndr = collector();
    const response = await collect(stagingEnv({ DNDR_COLLECTOR: dndr }));
    expect(response.headers.get('content-type')).toBe('image/gif');
    expect(dndr.calls).toEqual([
      {
        producerEventId: 'visitor_events:41',
        hostname: 'turkcyber-staging.dndr.net',
        path: '/teknik/ornek-yazi/',
        referrer: 'https://www.google.com/',
        ip: VISITOR,
        userAgent: 'Mozilla/5.0 Chrome/121.0.0.0 Safari/537.36',
        country: 'TR',
        region: 'Istanbul',
        regionCode: '34',
        city: 'Istanbul',
        asn: 64496,
      },
    ]);
  });

  it('sends the hostname this Worker was invoked on, never the beacon host claim', async () => {
    const dndr = collector();
    const spoofed = new Request(
      'https://turkcyber-staging.dndr.net/collect?path=dndr.net%2F&referrer=&t=1&site=site_dndr_net&producerId=prd_x',
      { headers: { 'cf-connecting-ip': VISITOR } },
    );
    await collect(stagingEnv({ DNDR_COLLECTOR: dndr }), spoofed);
    expect(dndr.calls[0]!.hostname).toBe('turkcyber-staging.dndr.net');
    expect(Object.keys(dndr.calls[0]!)).not.toContain('producerId');
    expect(Object.keys(dndr.calls[0]!)).not.toContain('siteId');
  });

  it('forwards in production with the production binding', async () => {
    const dndr = collector();
    const db = fakeDb();
    await collect({
      ...stagingEnv({ DNDR_COLLECTOR: dndr, ANALYTICS_DB: db as never }),
      ENVIRONMENT: 'production',
    } as Env);
    expect(db.calls).toHaveLength(1);
    expect(dndr.calls).toHaveLength(1);
    expect(DNDR_FORWARD_ENVIRONMENTS).toEqual(['staging', 'production']);
  });

  it('does nothing in development or an unknown environment, even with a binding', async () => {
    for (const environment of ['development', 'Production', 'preview', undefined]) {
      const dndr = collector();
      const db = fakeDb();
      await collect({
        ...stagingEnv({ DNDR_COLLECTOR: dndr, ANALYTICS_DB: db as never }),
        ENVIRONMENT: environment,
      } as Env);
      expect(dndr.calls).toHaveLength(0);
      expect(db.calls).toHaveLength(1);
    }
    expect(dndrForwardingEnabled({ ENVIRONMENT: 'staging' } as Env)).toBe(false);
    expect(
      dndrForwardingEnabled({ ENVIRONMENT: 'staging', DNDR_COLLECTOR: {} } as unknown as Env),
    ).toBe(false);
  });

  it('never forwards a row that was not stored', async () => {
    const dndr = collector();
    await collect(
      stagingEnv({ DNDR_COLLECTOR: dndr, ANALYTICS_DB: fakeDb({ throws: true }) as never }),
    );
    expect(dndr.calls).toHaveLength(0);
    const noId = collector();
    await collect(
      stagingEnv({
        DNDR_COLLECTOR: noId,
        ANALYTICS_DB: fakeDb({ runResult: { success: true } }) as never,
      }),
    );
    expect(noId.calls).toHaveLength(0);
  });
});

describe('failure isolation', () => {
  it('a throwing or failing collector never breaks the response or the source write', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      for (const failing of [
        collector(async () => {
          throw new Error('binding unavailable');
        }),
        collector({ status: 'error', reason: 'write_failed' }),
        collector({ status: 'rejected', reason: 'producer_disabled' }),
        collector({ status: 'rejected', reason: 'registry_unavailable' }),
        collector(async () => undefined as unknown as DndrResult),
      ]) {
        const db = fakeDb({ runResult: { success: true, meta: { last_row_id: 7 } } });
        const response = await collect(
          stagingEnv({ DNDR_COLLECTOR: failing, ANALYTICS_DB: db as never }),
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('x-turkcyber-collect')).toBe('ok');
        expect(db.calls).toHaveLength(1);
      }
    } finally {
      log.mockRestore();
      quiet.mockRestore();
    }
  });

  it('retries a failed call once with the same event id, and logs no address', async () => {
    const logged: string[] = [];
    const log = vi
      .spyOn(console, 'log')
      .mockImplementation((line: string) => void logged.push(line));
    const err = vi
      .spyOn(console, 'error')
      .mockImplementation((line: string) => void logged.push(line));
    try {
      let calls = 0;
      const flaky = collector(async () => {
        calls += 1;
        if (calls === 1) throw new Error('transient');
        return { status: 'accepted' };
      });
      const env = stagingEnv({ DNDR_COLLECTOR: flaky });
      const status = await forwardToDndr(env, {
        producerEventId: 'visitor_events:9',
        hostname: 'turkcyber-staging.dndr.net',
        path: '/',
        referrer: '',
        ip: VISITOR,
        userAgent: 'x',
        country: '',
        region: '',
        regionCode: '',
        city: '',
        asn: null,
      });
      expect(status).toBe('accepted');
      expect(flaky.calls.map((event) => event.producerEventId)).toEqual([
        'visitor_events:9',
        'visitor_events:9',
      ]);
      expect(DNDR_FORWARD_ATTEMPTS).toBe(2);
      const alwaysDown = collector(async () => {
        throw new Error('down');
      });
      expect(await forwardToDndr(stagingEnv({ DNDR_COLLECTOR: alwaysDown }), flaky.calls[0]!)).toBe(
        'error',
      );
      expect(alwaysDown.calls).toHaveLength(2);
      // A rejection is final: it is not retried.
      const refused = collector({ status: 'rejected', reason: 'producer_disabled' });
      expect(await forwardToDndr(stagingEnv({ DNDR_COLLECTOR: refused }), flaky.calls[0]!)).toBe(
        'rejected',
      );
      expect(refused.calls).toHaveLength(1);
      expect(logged.join('\n')).not.toContain(VISITOR);
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  });
});

describe('identity helpers', () => {
  it('derives the event id from the stored row and nothing else', () => {
    expect(producerEventId(41)).toBe('visitor_events:41');
    expect(insertedRowId({ meta: { last_row_id: 41 } })).toBe(41);
    for (const value of [
      null,
      {},
      { meta: {} },
      { meta: { last_row_id: 0 } },
      { meta: { last_row_id: '41' } },
    ]) {
      expect(insertedRowId(value)).toBeNull();
    }
  });
});

describe('configuration', () => {
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const parsed = JSON.parse(config.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1')) as {
    services?: unknown;
    env: Record<string, { services?: Array<Record<string, unknown>> }>;
  };

  it('binds each environment to its own collector, with its producer id as binding props', () => {
    expect(parsed.env.staging!.services).toEqual([
      {
        binding: 'DNDR_COLLECTOR',
        service: 'dndr-collector-staging',
        entrypoint: 'ProducerApi',
        props: { producerId: 'prd_turkcyber_staging_binding' },
      },
    ]);
    expect(parsed.services).toBeUndefined();
    expect(parsed.env.production!.services).toEqual([
      {
        binding: 'DNDR_COLLECTOR',
        service: 'dndr-collector',
        entrypoint: 'ProducerApi',
        props: { producerId: 'prd_turkcyber_binding' },
      },
    ]);
    expect(JSON.stringify(parsed.env.production!.services)).not.toMatch(/staging/);
    expect(JSON.stringify(parsed.env.staging!.services)).not.toMatch(
      /"dndr-collector"|prd_turkcyber_binding/,
    );
  });
});
