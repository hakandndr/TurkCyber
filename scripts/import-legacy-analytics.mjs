#!/usr/bin/env node
/**
 * Import historical TurkCyber analytics into ANALYTICS_DB.
 *
 *   node scripts/import-legacy-analytics.mjs --input <file> [--source legacy_php]
 *                                            [--env staging] [--remote]
 *
 * Design rules, all of them load-bearing:
 *
 *   1. IDEMPOTENT. The generated SQL begins with
 *        DELETE FROM visitor_events WHERE source = '<tag>';
 *      so re-running replaces exactly the imported era and nothing else. Live
 *      rows (source = 'worker') are never touched.
 *
 *   2. NO DEDUPLICATION. Two identical-looking historical rows may be two real
 *      visits. Nothing is collapsed unless semantic equivalence is proven, and
 *      it has not been.
 *
 *   3. ORIGINALS PRESERVED. Timestamps, IP addresses and location fields are
 *      carried across as they are. Unknown device/browser values are stored as
 *      'unknown' rather than guessed from data that was never recorded.
 *
 *   4. NEVER EXECUTES. This script only writes a .sql file and prints the
 *      command to apply it. Choosing the target database stays a deliberate,
 *      human act.
 *
 * Accepted input: JSON array, NDJSON, or CSV with a header row. Field names are
 * matched case-insensitively against several known spellings, because the two
 * historical formats did not agree.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
};
const has = (name) => args.includes(`--${name}`);

const input = flag('input');
const source = flag('source', 'legacy_php');
const envName = flag('env');
const remote = has('remote');
const outFile = flag('out', `migrations/analytics/import-${source}.sql`);

if (!input) {
  console.error('Usage: node scripts/import-legacy-analytics.mjs --input <file> [--source tag]');
  console.error('       [--out file.sql] [--env staging] [--remote]');
  process.exit(1);
}
if (!/^[a-z0-9_]+$/.test(source)) {
  console.error(`Refusing: --source must match [a-z0-9_]+ (got "${source}").`);
  process.exit(1);
}

const raw = readFileSync(input, 'utf8');
const records = parseInput(raw, input);

if (records.length === 0) {
  console.error('No records parsed. Nothing written.');
  process.exit(1);
}

const TIMEZONE = process.env.ANALYTICS_TIMEZONE || 'America/Los_Angeles';
const localDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const rows = [];
const skipped = [];

for (const [index, record] of records.entries()) {
  const occurredAt = parseTimestamp(
    pick(record, ['occurred_at', 'date', 'timestamp', 'time', 'tarih']),
  );
  if (!occurredAt) {
    skipped.push({ index, reason: 'unparsable timestamp' });
    continue;
  }

  const location = String(pick(record, ['location', 'page', 'url', 'sayfa']) ?? '');
  let host = String(pick(record, ['host', 'domain']) ?? '');
  let path = String(pick(record, ['path', 'uri']) ?? '');
  if (!host && location) {
    const stripped = location.replace(/^https?:\/\//, '');
    const slash = stripped.indexOf('/');
    host = slash < 0 ? stripped : stripped.slice(0, slash);
    path = slash < 0 ? '/' : stripped.slice(slash);
  }

  rows.push({
    occurred_at: occurredAt.toISOString(),
    // Recomputed from the preserved UTC timestamp using a real timezone
    // database — never a fixed -7 hour offset, which is wrong for half the year.
    local_date: localDayFormatter.format(occurredAt),
    host: clean(host) || 'unknown',
    path: clean(path) || '/',
    referrer: clean(pick(record, ['referrer', 'ref', 'referer'])) || 'Direct',
    referrer_raw: clean(pick(record, ['referrer_raw', 'referrer', 'referer'])),
    ip: clean(pick(record, ['ip', 'ip_address', 'address'])),
    country: clean(pick(record, ['country', 'ulke'])),
    region: clean(pick(record, ['region', 'state'])),
    city: clean(pick(record, ['city', 'sehir'])),
    asn: toInt(pick(record, ['asn'])),
    // Not invented. If the historical format did not record it, it stays unknown.
    device: clean(pick(record, ['device'])) || 'unknown',
    browser: clean(pick(record, ['browser'])) || 'unknown',
    user_agent: clean(pick(record, ['user_agent', 'useragent', 'ua']), 300),
    source,
  });
}

const sql = [
  `-- Historical analytics import: ${basename(input)}`,
  `-- Generated ${new Date().toISOString()} - ${rows.length} rows, source='${source}'`,
  `-- Re-runnable: the DELETE below scopes the operation to this source tag only.`,
  `-- Live rows written by the Worker (source='worker') are never affected.`,
  '',
  'BEGIN TRANSACTION;',
  `DELETE FROM visitor_events WHERE source = '${source}';`,
  '',
  ...rows.map(
    (row) =>
      `INSERT INTO visitor_events (occurred_at, local_date, host, path, referrer, referrer_raw, ` +
      `ip, country, region, city, asn, device, browser, user_agent, source) VALUES (` +
      [
        q(row.occurred_at),
        q(row.local_date),
        q(row.host),
        q(row.path),
        q(row.referrer),
        q(row.referrer_raw),
        q(row.ip),
        q(row.country),
        q(row.region),
        q(row.city),
        row.asn === null ? 'NULL' : row.asn,
        q(row.device),
        q(row.browser),
        q(row.user_agent),
        q(row.source),
      ].join(', ') +
      ');',
  ),
  '',
  'COMMIT;',
].join('\n');

writeFileSync(outFile, sql);

const dates = rows.map((r) => r.occurred_at).sort();
console.log('');
console.log(`  input        ${input}`);
console.log(`  parsed       ${records.length} records`);
console.log(`  importable   ${rows.length} rows`);
console.log(`  skipped      ${skipped.length}`);
console.log(`  source tag   ${source}`);
console.log(`  date range   ${dates[0] ?? '-'}  ..  ${dates[dates.length - 1] ?? '-'}`);
console.log(`  with ip      ${rows.filter((r) => r.ip).length}`);
console.log(`  with city    ${rows.filter((r) => r.city).length}`);
console.log(`  written to   ${outFile}`);
console.log('');

if (skipped.length > 0) {
  console.log('  skipped records (first 5):');
  for (const item of skipped.slice(0, 5)) console.log(`    #${item.index}: ${item.reason}`);
  console.log('');
}

const target = envName ? `--env ${envName}` : '';
const location = remote ? '--remote' : '--local';

console.log('  Reconcile counts BEFORE and AFTER applying:');
console.log(`    npx wrangler d1 execute ANALYTICS_DB ${target} ${location} \\`);
console.log(`      --command "SELECT source, count(*) FROM visitor_events GROUP BY source"`);
console.log('');
console.log('  Apply:');
console.log(
  `    npx wrangler d1 execute ANALYTICS_DB ${target} ${location} --file ${outFile}`.replace(
    /\s+/g,
    ' ',
  ),
);
console.log('');
console.log('  Do not run destructive cleanup on the historical source files until the');
console.log('  D1 counts have been reconciled against them.');

// ---------------------------------------------------------------- helpers

function parseInput(text, filename) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) return JSON.parse(trimmed);

  if (trimmed.startsWith('{')) {
    return trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  if (/\.csv$/i.test(filename) || trimmed.includes(',')) return parseCsv(trimmed);

  throw new Error(`Unrecognised input format in ${filename}`);
}

function parseCsv(text) {
  const lines = text.split('\n').filter((line) => line.trim());
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(header.map((key, i) => [key, cells[i] ?? '']));
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function pick(record, names) {
  const lower = Object.fromEntries(Object.entries(record).map(([k, v]) => [k.toLowerCase(), v]));
  for (const name of names) {
    const value = lower[name.toLowerCase()];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return undefined;
}

function parseTimestamp(value) {
  if (value === undefined) return null;
  if (typeof value === 'number') {
    // Seconds or milliseconds since the epoch.
    const date = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return parseTimestamp(Number(text));
  const normalised = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clean(value, max = 300) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function toInt(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

/** Single-quote escaping for SQLite string literals. */
function q(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`;
}
