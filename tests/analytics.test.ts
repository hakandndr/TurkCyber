import { describe, expect, it } from 'vitest';
import { buildFilters, repeatFlag, rowsQuery, countQuery } from '../worker/lib/analytics-query';
import { BOT_SQL, detectBrowser, detectDevice, isAutomated } from '../worker/lib/ua';
import { formatPanelTimestamp, localDate, parseStoredTimestamp } from '../worker/lib/time';
import { normalizeReferrer } from '../worker/lib/referrer';
import { sanitizeField, sanitizeMultiline } from '../worker/lib/sanitize';
import { handleCollect, splitLocation } from '../worker/routes/collect';
import { escapeHtml } from '../worker/lib/http';
import { formatLocation } from '../worker/lib/location';
import { renderTable } from '../worker/routes/boss-views';
import { fakeCtx, fakeDb } from './helpers';
import type { Env } from '../worker/lib/env';

const TZ = 'America/Los_Angeles';

describe('repeat flags', () => {
  it('classifies at the boundaries, not the middles', () => {
    expect(repeatFlag(1)).toBe('ok');
    expect(repeatFlag(4)).toBe('ok');
    expect(repeatFlag(5)).toBe('repeat');
    expect(repeatFlag(19)).toBe('repeat');
    expect(repeatFlag(20)).toBe('high');
    expect(repeatFlag(500)).toBe('high');
  });
});

describe('buildFilters', () => {
  it('produces an empty clause and no params for empty input', () => {
    const built = buildFilters({});
    expect(built.clause).toBe('');
    expect(built.params).toEqual([]);
  });

  it('binds every request-derived value rather than interpolating it', () => {
    const built = buildFilters({
      ip: "1.2.3.4' OR 1=1 --",
      country: 'TR',
      city: 'Ankara',
      path: '/rehberler/',
      referrer: 'google',
    });

    // Five conditions, five placeholders, five bound values.
    expect(built.clause.match(/\?/g)).toHaveLength(5);
    expect(built.params).toHaveLength(5);
    // The injection attempt travels as data, never as SQL.
    expect(built.clause).not.toContain('OR 1=1');
    expect(built.params[0]).toBe("%1.2.3.4' OR 1=1 --%");
  });

  it('ignores an unknown flag value', () => {
    expect(buildFilters({ flag: 'nonsense' }).clause).toBe('');
    expect(buildFilters({ flag: 'high' }).clause).toContain('>= 20');
  });

  it('adds the humans-only clause only when humans=1', () => {
    expect(buildFilters({ humans: '1' }).clause).toContain('NOT');
    expect(buildFilters({ humans: '0' }).clause).toBe('');
  });

  it('returns the active values so the form can be re-rendered', () => {
    const built = buildFilters({ ip: ' 10.0.0.1 ', humans: '1', flag: 'repeat' });
    expect(built.active.ip).toBe('10.0.0.1');
    expect(built.active.humans).toBe(true);
    expect(built.active.flag).toBe('repeat');
  });
});

describe('sequence numbering', () => {
  it('derives both sequences with ROW_NUMBER, never from id', () => {
    const sql = rowsQuery('');
    expect(sql).toContain('ROW_NUMBER() OVER (ORDER BY occurred_at, id) AS seq');
    expect(sql).toContain('PARTITION BY local_date');
    // If seq came from id, an import would interleave the two eras.
    expect(sql).not.toMatch(/AS seq[\s\S]{0,40}\bid\b\s*AS/);
  });

  it('counts through the same CTE so the pager and table agree', () => {
    expect(countQuery('')).toContain('ranked');
    expect(countQuery('')).toContain('count(*)');
  });
});

describe('user agent detection', () => {
  it('checks Edge before Chrome', () => {
    const edge =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    expect(detectBrowser(edge)).toBe('Edge 120');
  });

  it('checks Opera before Chrome', () => {
    const opera = 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0';
    expect(detectBrowser(opera)).toBe('Opera 106');
  });

  it('detects the remaining browsers', () => {
    expect(detectBrowser('Mozilla/5.0 Chrome/121.0.0.0 Safari/537.36')).toBe('Chrome 121');
    expect(detectBrowser('Mozilla/5.0 Firefox/122.0')).toBe('Firefox 122');
    expect(detectBrowser('Mozilla/5.0 (Macintosh) Version/17.0 Safari/605.1.15')).toBe('Safari');
    expect(detectBrowser('')).toBe('Other');
  });

  it('detects mobile devices', () => {
    expect(detectDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('Mobile');
    expect(detectDevice('Mozilla/5.0 (Linux; Android 14)')).toBe('Mobile');
    expect(detectDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Desktop');
  });
});

describe('bot classification', () => {
  it('flags known automated clients and leaves humans alone', () => {
    expect(isAutomated('Googlebot/2.1')).toBe(true);
    expect(isAutomated('curl/8.4.0')).toBe(true);
    expect(isAutomated('python-requests/2.31.0')).toBe(true);
    expect(isAutomated('facebookexternalhit/1.1')).toBe(true);
    expect(isAutomated('Mozilla/5.0 Chrome/121.0.0.0 Safari/537.36')).toBe(false);
    expect(isAutomated('')).toBe(false);
  });

  it('builds SQL from the constant list only', () => {
    expect(BOT_SQL).toContain("LIKE '%bot%'");
    expect(BOT_SQL.startsWith('(')).toBe(true);
  });
});

describe('local date and timestamps', () => {
  it('computes the local date in the display timezone', () => {
    // 2026-06-15 06:30 UTC is still 2026-06-14 in Los Angeles (PDT, UTC-7).
    expect(localDate(new Date('2026-06-15T06:30:00Z'), TZ)).toBe('2026-06-14');
    // 2026-06-15 08:00 UTC has crossed into the 15th locally.
    expect(localDate(new Date('2026-06-15T08:00:00Z'), TZ)).toBe('2026-06-15');
  });

  it('handles both DST periods correctly — the fixed-offset bug', () => {
    // Summer (PDT, UTC-7): 07:30 UTC is 00:30 local on the same day.
    expect(localDate(new Date('2026-07-04T07:30:00Z'), TZ)).toBe('2026-07-04');
    // Winter (PST, UTC-8): 07:30 UTC is still 23:30 on the PREVIOUS day.
    expect(localDate(new Date('2026-01-04T07:30:00Z'), TZ)).toBe('2026-01-03');
  });

  it('formats midnight and noon as 12, never 0', () => {
    // 07:00 UTC in July = 00:00:00 PDT
    expect(formatPanelTimestamp('2026-07-04T07:00:00Z', TZ)).toBe('2026-07-04 12:00:00am');
    // 19:00 UTC in July = 12:00:00 PDT
    expect(formatPanelTimestamp('2026-07-04T19:00:00Z', TZ)).toBe('2026-07-04 12:00:00pm');
  });

  it('normalises the am/pm marker to lowercase without punctuation', () => {
    const formatted = formatPanelTimestamp('2026-08-04T20:09:04Z', TZ);
    expect(formatted).toBe('2026-08-04 1:09:04pm');
    expect(formatted).not.toMatch(/[A-Z.]/);
  });

  it('accepts the space-separated form SQLite produces', () => {
    expect(parseStoredTimestamp('2026-08-04 20:09:04')?.toISOString()).toBe(
      '2026-08-04T20:09:04.000Z',
    );
    expect(formatPanelTimestamp('2026-08-04 20:09:04', TZ)).toBe('2026-08-04 1:09:04pm');
  });

  it('returns empty rather than throwing on unusable input', () => {
    expect(formatPanelTimestamp('', TZ)).toBe('');
    expect(formatPanelTimestamp('not a date', TZ)).toBe('');
    expect(parseStoredTimestamp('')).toBeNull();
  });
});

describe('referrer normalisation', () => {
  it('labels known sources and falls back to the hostname', () => {
    expect(normalizeReferrer('')).toBe('Direct');
    expect(normalizeReferrer('https://www.google.com/search?q=x')).toBe('Google');
    expect(normalizeReferrer('https://instagram.com/p/abc')).toBe('Instagram');
    expect(normalizeReferrer('https://news.ycombinator.com/item?id=1')).toBe(
      'news.ycombinator.com',
    );
  });

  it('uses an unparsable value as its own label rather than discarding it', () => {
    // Not a URL at all — kept verbatim so nothing is silently lost.
    expect(normalizeReferrer('not a url at all')).toBe('not a url at all');
  });

  it('uses the hostname for schemes that still parse', () => {
    // android-app:// parses, so the hostname is the useful grouping label.
    expect(normalizeReferrer('android-app://com.example')).toBe('com.example');
  });
});

describe('sanitisation', () => {
  it('strips control characters and caps length', () => {
    const withControls = `line1${String.fromCharCode(10)}line2${String.fromCharCode(9)}x`;
    expect(sanitizeField(withControls)).toBe('line1 line2 x');
    expect(sanitizeField('a'.repeat(500))).toHaveLength(300);
  });

  it('preserves paragraph breaks in multiline text but drops other controls', () => {
    const LF = String.fromCharCode(10);
    const NUL = String.fromCharCode(0);
    const result = sanitizeMultiline(`first${LF}${LF}second${NUL}x`, 2000);

    // The paragraph break survives; the NUL is removed without leaving a gap.
    expect(result).toBe(`first${LF}${LF}secondx`);
    expect(result).not.toContain(NUL);
  });
});

describe('splitLocation', () => {
  it('splits host and path, with sane fallbacks', () => {
    expect(splitLocation('turkcyber.com/rehberler/')).toEqual({
      host: 'turkcyber.com',
      path: '/rehberler/',
    });
    expect(splitLocation('turkcyber.com')).toEqual({ host: 'turkcyber.com', path: '/' });
    expect(splitLocation('')).toEqual({ host: 'unknown', path: '/' });
  });
});

describe('private location display', () => {
  it('adds a two-letter state only for US locations', () => {
    expect(formatLocation('US', 'Santa Ana', 'CA')).toBe('Santa Ana, CA');
    expect(formatLocation('US', 'New York', 'NY')).toBe('New York, NY');
    expect(formatLocation('TR', 'İstanbul', '34')).toBe('İstanbul');
  });

  it('handles missing or legacy region values without inventing data', () => {
    expect(formatLocation('US', 'Austin', null)).toBe('Austin');
    expect(formatLocation('US', null, 'TX')).toBe('—');
    expect(formatLocation('US', 'Santa Ana, CA', null)).toBe('Santa Ana, CA');
    expect(formatLocation('US', 'Santa Ana', 'California')).toBe('Santa Ana');
  });
});

describe('the beacon always returns a pixel', () => {
  const request = new Request('https://turkcyber.com/collect?path=turkcyber.com%2F&referrer=&t=1', {
    headers: { 'user-agent': 'Mozilla/5.0 Chrome/121.0.0.0 Safari/537.36' },
  });

  it('returns a GIF when the binding is absent', async () => {
    const response = await handleCollect(request, {} as Env, fakeCtx() as never);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/gif');
    expect(response.headers.get('x-turkcyber-collect')).toBe('no-database');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await response.arrayBuffer()).byteLength).toBe(43);
  });

  it('returns a GIF when the database write throws', async () => {
    const ctx = fakeCtx();
    const env = { ANALYTICS_DB: fakeDb({ throws: true }) } as unknown as Env;
    const response = await handleCollect(request, env, ctx as never);
    await ctx.settled();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/gif');
    expect(response.headers.get('x-turkcyber-collect')).toBe('ok');
  });

  it('writes one row with bound parameters', async () => {
    const ctx = fakeCtx();
    const db = fakeDb();
    const env = { ANALYTICS_DB: db, ANALYTICS_TIMEZONE: TZ } as unknown as Env;
    const geoRequest = new Request(request);
    Object.defineProperty(geoRequest, 'cf', {
      value: { country: 'US', city: 'Santa Ana', region: 'California', regionCode: 'CA' },
    });
    await handleCollect(geoRequest, env, ctx as never);
    await ctx.settled();

    expect(db.calls).toHaveLength(1);
    expect(db.calls[0]!.sql).toContain('INSERT INTO visitor_events');
    // 15 columns, 15 bound values, no interpolation.
    expect(db.calls[0]!.params).toHaveLength(15);
    expect(db.calls[0]!.params).toContain('turkcyber.com');
    expect(db.calls[0]!.params).toContain('worker');
    expect(db.calls[0]!.params).toContain('CA');
    expect(db.calls[0]!.params).not.toContain('California');
  });
});

describe('panel escaping', () => {
  it('renders an attacker-controlled user agent as text', () => {
    const html = renderTable(
      [
        {
          seq: 1,
          day_seq: 1,
          occurred_at: '2026-08-04T20:09:04Z',
          local_date: '2026-08-04',
          ip: '1.2.3.4',
          country: 'TR',
          region: null,
          city: '<img src=x onerror=alert(1)>',
          host: 'turkcyber.com',
          path: '/"><script>alert(1)</script>',
          referrer: null,
          device: 'Desktop',
          browser: 'Chrome 121',
          user_agent: '<script>alert("xss")</script>',
          source: 'worker',
          visits: 1,
          automated: 0,
        },
      ],
      TZ,
    );

    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes the five dangerous characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
    expect(escapeHtml(null)).toBe('');
  });
});
