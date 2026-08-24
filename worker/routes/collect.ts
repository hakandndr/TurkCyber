/**
 * The analytics beacon: GET /collect
 *
 * Contract: it ALWAYS returns the pixel. A failed analytics write must never
 * become a broken image on a visitor's page, so the database write is wrapped,
 * swallowed, and deferred with ctx.waitUntil so the response does not wait on
 * it.
 */
import type { Env } from '../lib/env';
import { sanitizeField } from '../lib/sanitize';
import { normalizeReferrer } from '../lib/referrer';
import { detectBrowser, detectDevice } from '../lib/ua';
import { DEFAULT_TIMEZONE, localDate } from '../lib/time';

/** 1x1 transparent GIF. */
const GIF = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

function pixel(status: string): Response {
  return new Response(GIF, {
    status: 200,
    headers: {
      'content-type': 'image/gif',
      'cache-control': 'no-store, no-cache, must-revalidate',
      // Diagnostic: makes "is the beacon reaching the database" answerable
      // with curl -I instead of a log hunt.
      'x-turkcyber-collect': status,
    },
  });
}

/** Split the reported `host + path` value into its two stored columns. */
export function splitLocation(raw: string): { host: string; path: string } {
  const value = sanitizeField(raw);
  if (!value) return { host: 'unknown', path: '/' };
  const slash = value.indexOf('/');
  if (slash < 0) return { host: value, path: '/' };
  return { host: value.slice(0, slash) || 'unknown', path: value.slice(slash) || '/' };
}

export async function handleCollect(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!env.ANALYTICS_DB) return pixel('no-database');

  try {
    const url = new URL(request.url);
    const { host, path } = splitLocation(url.searchParams.get('path') ?? '');
    const referrerRaw = sanitizeField(url.searchParams.get('referrer') ?? '');
    const userAgent = sanitizeField(request.headers.get('user-agent') ?? '');

    // Geolocation comes from the edge. Cloudflare resolves request.cf before
    // the Worker runs, so this costs nothing. An outbound geo-IP lookup in the
    // request path would add latency, an external dependency and a rate limit.
    const cf = (request as { cf?: IncomingRequestCfProperties }).cf;
    const now = new Date();

    const row = {
      occurred_at: now.toISOString(),
      local_date: localDate(now, env.ANALYTICS_TIMEZONE || DEFAULT_TIMEZONE),
      host,
      path,
      referrer: sanitizeField(normalizeReferrer(referrerRaw)),
      referrer_raw: referrerRaw,
      ip: sanitizeField(request.headers.get('cf-connecting-ip') ?? ''),
      country: sanitizeField(cf?.country ?? ''),
      // New Worker rows keep the compact ISO region code. Imported legacy
      // rows remain untouched and retain their original city strings.
      region: sanitizeField(cf?.regionCode ?? ''),
      city: sanitizeField(cf?.city ?? ''),
      asn: typeof cf?.asn === 'number' ? cf.asn : null,
      device: detectDevice(userAgent),
      browser: detectBrowser(userAgent),
      user_agent: userAgent,
      source: 'worker',
    };

    const write = env.ANALYTICS_DB.prepare(
      `INSERT INTO visitor_events
         (occurred_at, local_date, host, path, referrer, referrer_raw, ip,
          country, region, city, asn, device, browser, user_agent, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        row.occurred_at,
        row.local_date,
        row.host,
        row.path,
        row.referrer,
        row.referrer_raw,
        row.ip,
        row.country,
        row.region,
        row.city,
        row.asn,
        row.device,
        row.browser,
        row.user_agent,
        row.source,
      )
      .run()
      .catch((error: unknown) => {
        console.error('collect: write failed', error);
      });

    ctx.waitUntil(write);
    return pixel('ok');
  } catch (error) {
    console.error('collect: unexpected failure', error);
    return pixel('error');
  }
}
