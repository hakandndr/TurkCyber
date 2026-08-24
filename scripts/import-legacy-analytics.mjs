#!/usr/bin/env node
/**
 * Prepare the owner-supplied legacy analytics.log for ANALYTICS_DB.
 *
 * Inspected source format:
 *   IP | YYYY-MM-DD HH:mm:ss | country | city | device / browser
 *
 * Six observed rows carry a raw user-agent in the final field instead of the
 * compact device/browser pair. Those values are preserved without guessing.
 *
 * Safe by default: without --write-sql this command is a read-only dry run.
 * It never invokes Wrangler or connects to D1. SQL generation requires an
 * explicit output path outside the repository because it contains private
 * source fields.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LEGACY_SOURCE = 'legacy_analytics_log';
export const DEFAULT_INPUT_TIMEZONE = 'America/Los_Angeles';

const args = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')
    ? args[index + 1]
    : fallback;
};
const has = (name) => args.includes(`--${name}`);

export function parseLegacyAnalytics(raw, options = {}) {
  const timezone = options.timezone || DEFAULT_INPUT_TIMEZONE;
  const source = options.source || LEGACY_SOURCE;
  const host = options.host || 'turkcyber.com';
  const lines = raw.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();

  const rows = [];
  const rejected = [];
  const repeated = new Map();

  for (const [index, rawLine] of lines.entries()) {
    const sourceLine = index + 1;
    if (!rawLine.trim()) {
      rejected.push({ sourceLine, reason: 'blank-line' });
      continue;
    }

    const fields = rawLine.split('|').map((value) => value.trim());
    if (fields.length !== 5) {
      rejected.push({ sourceLine, reason: 'field-count' });
      continue;
    }

    const [ip, rawTimestamp, country, city, deviceField] = fields;
    if (!isIP(ip) || ip.length > 64) {
      rejected.push({ sourceLine, reason: 'invalid-ip' });
      continue;
    }
    if (!validText(country, 64) || !validText(city, 128)) {
      rejected.push({ sourceLine, reason: 'invalid-location' });
      continue;
    }

    const timestamp = parseZonedTimestamp(rawTimestamp, timezone);
    if (!timestamp.ok) {
      rejected.push({ sourceLine, reason: timestamp.reason });
      continue;
    }

    const client = parseClient(deviceField);
    if (!client.ok) {
      rejected.push({ sourceLine, reason: client.reason });
      continue;
    }

    // The occurrence ordinal preserves genuinely repeated visits while making
    // the same multiset idempotent even if a later copy is reordered.
    const canonical = JSON.stringify([
      ip,
      rawTimestamp,
      country,
      city,
      client.device,
      client.browser,
      client.userAgent,
    ]);
    const occurrence = repeated.get(canonical) || 0;
    repeated.set(canonical, occurrence + 1);
    const recordHash = sha256(`${canonical}\0${occurrence}`);

    rows.push({
      sourceLine,
      recordHash,
      rawTimestamp,
      occurred_at: timestamp.iso,
      local_date: rawTimestamp.slice(0, 10),
      host,
      // The source did not record these fields. Empty/NULL represents absence;
      // '/', 'Direct' or another synthetic value would be invented.
      path: '',
      referrer: null,
      referrer_raw: null,
      ip,
      country,
      region: null,
      city,
      asn: null,
      device: client.device,
      browser: client.browser,
      user_agent: client.userAgent,
      source,
    });
  }

  const reasonCounts = Object.fromEntries(
    [...new Set(rejected.map((item) => item.reason))]
      .sort()
      .map((reason) => [reason, rejected.filter((item) => item.reason === reason).length]),
  );
  const repeatedSourceRows = [...repeated.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
  const occurred = rows.map((row) => row.occurred_at).sort();
  const rawDates = rows.map((row) => row.rawTimestamp).sort();

  return {
    rows,
    rejected,
    summary: {
      sourceRows: lines.length,
      parsedValid: rows.length,
      malformedRejected: rejected.length,
      rejectedByReason: reasonCounts,
      repeatedSourceRowsPreserved: repeatedSourceRows,
      filteredByAge: 0,
      minSourceTimestamp: rawDates[0] || null,
      maxSourceTimestamp: rawDates.at(-1) || null,
      minOccurredAtUtc: occurred[0] || null,
      maxOccurredAtUtc: occurred.at(-1) || null,
      inputTimezone: timezone,
    },
  };
}

export function buildImportSql(rows, sourceMeta) {
  const statements = [
    `-- Private legacy analytics import from ${basename(sourceMeta.path)}`,
    `-- Source SHA-256: ${sourceMeta.sha256}`,
    `-- ${rows.length} valid rows; no age filter; no DELETE statement.`,
    `-- Idempotence is provided by legacy_analytics_imports.record_hash.`,
    '',
    `CREATE TABLE IF NOT EXISTS legacy_analytics_imports (`,
    `  record_hash TEXT PRIMARY KEY,`,
    `  visitor_event_id INTEGER NOT NULL UNIQUE,`,
    `  source_file_sha256 TEXT NOT NULL,`,
    `  source_line INTEGER NOT NULL,`,
    `  imported_at TEXT NOT NULL`,
    `);`,
    '',
  ];

  for (const row of rows) {
    statements.push(
      `INSERT INTO visitor_events (occurred_at, local_date, host, path, referrer, referrer_raw, ` +
        `ip, country, region, city, asn, device, browser, user_agent, source) ` +
        `SELECT ${[
          sqlValue(row.occurred_at),
          sqlValue(row.local_date),
          sqlValue(row.host),
          sqlValue(row.path),
          sqlValue(row.referrer),
          sqlValue(row.referrer_raw),
          sqlValue(row.ip),
          sqlValue(row.country),
          sqlValue(row.region),
          sqlValue(row.city),
          sqlValue(row.asn),
          sqlValue(row.device),
          sqlValue(row.browser),
          sqlValue(row.user_agent),
          sqlValue(row.source),
        ].join(', ')} WHERE NOT EXISTS (` +
        `SELECT 1 FROM legacy_analytics_imports WHERE record_hash = ${sqlValue(row.recordHash)}` +
        `);`,
      `INSERT OR IGNORE INTO legacy_analytics_imports (` +
        `record_hash, visitor_event_id, source_file_sha256, source_line, imported_at` +
        `) SELECT ${sqlValue(row.recordHash)}, last_insert_rowid(), ${sqlValue(
          sourceMeta.sha256,
        )}, ${row.sourceLine}, CURRENT_TIMESTAMP WHERE changes() = 1;`,
    );
  }

  statements.push('');
  return statements.join('\n');
}

function parseClient(value) {
  if (!validText(value, 300)) return { ok: false, reason: 'invalid-client' };
  const compact = value.match(/^(Desktop|Mobile|Legacy)\s+\/\s+(.+)$/i);
  if (compact && validText(compact[2], 80)) {
    return {
      ok: true,
      device: titleCase(compact[1]),
      browser: compact[2],
      userAgent: null,
    };
  }
  if (value.includes('/')) {
    return { ok: true, device: 'unknown', browser: 'unknown', userAgent: value };
  }
  return { ok: false, reason: 'invalid-client' };
}

function titleCase(value) {
  const lower = value.toLowerCase();
  return lower[0].toUpperCase() + lower.slice(1);
}

function validText(value, max) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(value)
  );
}

export function parseZonedTimestamp(value, timezone) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { ok: false, reason: 'invalid-timestamp-format' };
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const calendar = new Date(naive);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day ||
    calendar.getUTCHours() !== hour ||
    calendar.getUTCMinutes() !== minute ||
    calendar.getUTCSeconds() !== second
  ) {
    return { ok: false, reason: 'impossible-calendar-time' };
  }

  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return { ok: false, reason: 'invalid-input-timezone' };
  }

  const wanted = value.replace(' ', 'T');
  const candidates = [];
  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidate = new Date(naive - offsetMinutes * 60_000);
    if (formatLocal(formatter, candidate) === wanted) candidates.push(candidate.toISOString());
  }
  const unique = [...new Set(candidates)];
  if (unique.length === 0) return { ok: false, reason: 'nonexistent-local-time' };
  if (unique.length > 1) return { ok: false, reason: 'ambiguous-local-time' };
  return { ok: true, iso: unique[0] };
}

function formatLocal(formatter, date) {
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function outputIsOutsideRepository(path) {
  const repo = resolve(process.cwd());
  const output = resolve(path);
  const rel = relative(repo, output);
  return rel.startsWith('..') || isAbsolute(rel);
}

function run() {
  const input = flag('input');
  const timezone = flag('input-timezone', process.env.ANALYTICS_TIMEZONE || DEFAULT_INPUT_TIMEZONE);
  const out = flag('out');
  const writeSql = has('write-sql');

  if (!input) {
    console.error(
      'Usage: node scripts/import-legacy-analytics.mjs --input <analytics.log> [--input-timezone zone]',
    );
    console.error('       [--write-sql --out <absolute-path-outside-repository>]');
    process.exit(1);
  }
  if (!existsSync(input)) {
    console.error(`Input not found: ${input}`);
    process.exit(1);
  }
  if (writeSql && (!out || !outputIsOutsideRepository(out))) {
    console.error('--write-sql requires --out at a path outside the repository.');
    process.exit(1);
  }
  if (out && !writeSql) {
    console.error('--out is only accepted together with --write-sql.');
    process.exit(1);
  }

  const bytes = readFileSync(input);
  const raw = bytes.toString('utf8');
  const parsed = parseLegacyAnalytics(raw, { timezone });
  const sourceMeta = {
    path: resolve(input),
    sizeBytes: statSync(input).size,
    sha256: sha256(bytes),
  };
  const report = {
    file: basename(input),
    sizeBytes: sourceMeta.sizeBytes,
    sha256: sourceMeta.sha256,
    ...parsed.summary,
    generatedSql: false,
  };

  if (writeSql) {
    const sql = buildImportSql(parsed.rows, sourceMeta);
    writeFileSync(resolve(out), sql, { encoding: 'utf8', flag: 'wx' });
    report.generatedSql = true;
    report.sqlOutput = resolve(out);
  }

  console.log(JSON.stringify(report, null, 2));
  if (parsed.rejected.length > 0) process.exitCode = 2;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) run();
