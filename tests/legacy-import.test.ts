import { describe, expect, it } from 'vitest';
import {
  LEGACY_SOURCE,
  buildImportSql,
  parseLegacyAnalytics,
  parseZonedTimestamp,
} from '../scripts/import-legacy-analytics.mjs';

const row = '203.0.113.4 | 2025-05-14 17:41:22 | Example Country | Example City | Desktop / Chrome';

describe('legacy analytics.log parser', () => {
  it('preserves an imported City, ST value exactly and does not invent a region', () => {
    const parsed = parseLegacyAnalytics(
      '203.0.113.4 | 2025-05-14 17:41:22 | US | Santa Ana, CA | Desktop / Chrome\n',
    );
    expect(parsed.rows[0].city).toBe('Santa Ana, CA');
    expect(parsed.rows[0].region).toBeNull();
  });

  it('maps only present fields and preserves repeated visits', () => {
    const parsed = parseLegacyAnalytics(`${row}\n${row}\n`);
    expect(parsed.summary).toMatchObject({
      sourceRows: 2,
      parsedValid: 2,
      malformedRejected: 0,
      repeatedSourceRowsPreserved: 1,
      filteredByAge: 0,
    });
    expect(parsed.rows[0]).toMatchObject({
      host: 'turkcyber.com',
      path: '',
      referrer: null,
      device: 'Desktop',
      browser: 'Chrome',
      source: LEGACY_SOURCE,
    });
    expect(parsed.rows[0]!.recordHash).not.toBe(parsed.rows[1]!.recordHash);
  });

  it('preserves a raw user-agent without guessing device or browser', () => {
    const parsed = parseLegacyAnalytics(
      '2001:db8::1 | 2026-01-01 10:00:00 | Example Country | Example City | Mozilla/5.0 ExampleBot/1.0',
    );
    expect(parsed.rows[0]).toMatchObject({
      device: 'unknown',
      browser: 'unknown',
      user_agent: 'Mozilla/5.0 ExampleBot/1.0',
    });
  });

  it('rejects malformed, impossible and DST-ambiguous rows safely', () => {
    const bad = [
      'not-an-ip | 2025-05-14 17:41:22 | Country | City | Desktop / Chrome',
      '203.0.113.4 | 2025-02-30 17:41:22 | Country | City | Desktop / Chrome',
      '203.0.113.4 | 2026-03-08 02:30:00 | Country | City | Desktop / Chrome',
      '203.0.113.4 | 2026-11-01 01:30:00 | Country | City | Desktop / Chrome',
    ].join('\n');
    const parsed = parseLegacyAnalytics(bad);
    expect(parsed.summary.parsedValid).toBe(0);
    expect(parsed.summary.malformedRejected).toBe(4);
    expect(parsed.summary.rejectedByReason).toMatchObject({
      'invalid-ip': 1,
      'impossible-calendar-time': 1,
      'nonexistent-local-time': 1,
      'ambiguous-local-time': 1,
    });
  });

  it('converts local timestamps using real DST offsets', () => {
    expect(parseZonedTimestamp('2026-01-15 12:00:00', 'America/Los_Angeles')).toMatchObject({
      ok: true,
      iso: '2026-01-15T20:00:00.000Z',
    });
    expect(parseZonedTimestamp('2026-07-15 12:00:00', 'America/Los_Angeles')).toMatchObject({
      ok: true,
      iso: '2026-07-15T19:00:00.000Z',
    });
  });

  it('generates additive, ledger-backed SQL with no deletion', () => {
    const parsed = parseLegacyAnalytics(`${row}\n`);
    const sql = buildImportSql(parsed.rows, {
      path: 'D:/analytics.log',
      sha256: 'example-hash',
    });
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS legacy_analytics_imports');
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql).toContain("'legacy_analytics_log'");
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/);
  });
});
