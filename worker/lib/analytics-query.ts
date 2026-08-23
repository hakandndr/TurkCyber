/**
 * Analytics queries for the /boss panel.
 *
 * Every value derived from a request is a bound parameter. The only
 * interpolated SQL in this file is BOT_SQL, which is built from a compile-time
 * constant list in worker/lib/ua.ts.
 */
import { BOT_SQL } from './ua';

export const PAGE_SIZE = 100;

/** Repeat-visitor thresholds. Boundaries, not middles — see the tests. */
export const REPEAT_THRESHOLD = 5;
export const HIGH_REPEAT_THRESHOLD = 20;

export type RepeatFlag = 'ok' | 'repeat' | 'high';

export function repeatFlag(visits: number): RepeatFlag {
  if (visits >= HIGH_REPEAT_THRESHOLD) return 'high';
  if (visits >= REPEAT_THRESHOLD) return 'repeat';
  return 'ok';
}

export interface FilterInput {
  ip?: string;
  country?: string;
  city?: string;
  path?: string;
  referrer?: string;
  flag?: string;
  humans?: string;
}

export interface BuiltFilters {
  /** `WHERE ...` or an empty string. */
  clause: string;
  /** Bound parameters, in clause order. */
  params: (string | number)[];
  /** Normalised values, so the form can be re-rendered with what was typed. */
  active: Required<Omit<FilterInput, 'humans'>> & { humans: boolean };
}

const FLAG_CLAUSES: Record<string, string> = {
  ok: `coalesce(visits, 1) < ${REPEAT_THRESHOLD}`,
  repeat: `coalesce(visits, 1) BETWEEN ${REPEAT_THRESHOLD} AND ${HIGH_REPEAT_THRESHOLD - 1}`,
  high: `coalesce(visits, 1) >= ${HIGH_REPEAT_THRESHOLD}`,
};

export function buildFilters(input: FilterInput): BuiltFilters {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  const like = (value: string | undefined): string => `%${(value ?? '').trim()}%`;
  const text = (value: string | undefined): string => (value ?? '').trim().slice(0, 120);

  const ip = text(input.ip);
  const country = text(input.country);
  const city = text(input.city);
  const path = text(input.path);
  const referrer = text(input.referrer);
  const flag = FLAG_CLAUSES[input.flag ?? ''] ? (input.flag as string) : '';
  const humans = input.humans === '1';

  if (ip) {
    conditions.push('ip LIKE ?');
    params.push(like(ip));
  }
  if (country) {
    conditions.push('country LIKE ?');
    params.push(like(country));
  }
  if (city) {
    conditions.push('city LIKE ?');
    params.push(like(city));
  }
  if (path) {
    conditions.push('(host || path) LIKE ?');
    params.push(like(path));
  }
  if (referrer) {
    conditions.push('referrer LIKE ?');
    params.push(like(referrer));
  }
  if (flag) conditions.push(FLAG_CLAUSES[flag]!);
  if (humans) conditions.push(`NOT ${BOT_SQL}`);

  return {
    clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
    active: { ip, country, city, path, referrer, flag, humans },
  };
}

/**
 * Row listing.
 *
 * `seq` and `day_seq` are derived with ROW_NUMBER(), never from `id`. `id` is
 * insert order; a historical import runs after live rows exist, so the ids
 * interleave the two eras and produce a page numbered 52, 53, 1802, 1803.
 */
const RANKED_CTE = `
WITH ranked AS (
  SELECT visitor_events.*,
         ROW_NUMBER() OVER (ORDER BY occurred_at, id) AS seq,
         ROW_NUMBER() OVER (PARTITION BY local_date ORDER BY occurred_at, id) AS day_seq
    FROM visitor_events
),
repeat_counts AS (
  SELECT ip AS rip, count(*) AS visits FROM visitor_events GROUP BY ip
),
joined AS (
  SELECT ranked.*, repeat_counts.visits
    FROM ranked LEFT JOIN repeat_counts ON repeat_counts.rip = ranked.ip
)`;

export function rowsQuery(clause: string): string {
  return `${RANKED_CTE}
SELECT seq, day_seq, occurred_at, local_date, ip, country, region, city, host, path,
       referrer, device, browser, user_agent, source,
       coalesce(visits, 1) AS visits,
       CASE WHEN ${BOT_SQL} THEN 1 ELSE 0 END AS automated
  FROM joined
  ${clause}
 ORDER BY occurred_at DESC, seq DESC
 LIMIT ? OFFSET ?`;
}

/** Same CTE with count(*), so the pager and the table can never disagree. */
export function countQuery(clause: string): string {
  return `${RANKED_CTE}
SELECT count(*) AS total FROM joined ${clause}`;
}

export const SUMMARY_QUERY = `
SELECT count(*) AS events,
       count(DISTINCT ip) AS visitors,
       sum(CASE WHEN ${BOT_SQL} THEN 0 ELSE 1 END) AS humans,
       sum(CASE WHEN ${BOT_SQL} THEN 1 ELSE 0 END) AS automated
  FROM visitor_events`;

/**
 * Both sides of the comparison are wrapped in datetime(). Stored ISO strings
 * and datetime('now') are not the same textual format, and a raw string
 * comparison quietly returns wrong counts rather than an error.
 */
export const LAST_24H_QUERY = `
SELECT count(*) AS events FROM visitor_events
 WHERE datetime(occurred_at) >= datetime('now', '-1 day')`;

export const TOP_PAGES_QUERY = `
SELECT CASE WHEN host = 'unknown' THEN '—' ELSE host || path END AS location,
       count(*) AS events
  FROM visitor_events
 GROUP BY location ORDER BY events DESC LIMIT 6`;

/* ── Retention ──────────────────────────────────────────────────────────────
 *
 * /gizlilik/ states that visitor records are kept for at most 90 days. That
 * sentence is only true if something actually deletes them, so this is the
 * mechanism behind it.
 *
 * It is DELIBERATELY MANUAL. There is no cron trigger, no scheduled handler
 * and no automatic call anywhere in the Worker. Three reasons:
 *
 *   1. An unattended DELETE against the only copy of the analytics history is
 *      a single bug away from destroying it. A human pressing a button is a
 *      cheap and very effective safety interlock.
 *   2. The legacy import (~1,661 historical records) has not happened yet.
 *      A scheduled purge running before that import lands would silently
 *      delete rows the moment they arrive.
 *   3. Every run is auditable and attributable to an operator, which an
 *      automatic job is not.
 *
 * If this ever becomes automatic, /gizlilik/ changes in the same commit.
 */

/** The retention window /gizlilik/ commits to. Not a legal requirement. */
export const RETENTION_DAYS = 90;

export interface RetentionStats {
  total: number;
  oldest: string | null;
  newest: string | null;
  /** Rows older than the cutoff — the number the delete would remove. */
  older: number;
  /** ISO timestamp; rows strictly older than this are deletable. */
  cutoff: string;
}

export function retentionCutoff(now: Date, days: number = RETENTION_DAYS): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export const RETENTION_SUMMARY_QUERY = `
SELECT count(*) AS total, min(occurred_at) AS oldest, max(occurred_at) AS newest
  FROM visitor_events`;

export const RETENTION_OLDER_QUERY = `
SELECT count(*) AS older FROM visitor_events WHERE occurred_at < ?`;

/**
 * The purge itself.
 *
 * `visitor_events` only. This statement must never be pointed at APP_DB: the
 * comments and the audit trail live there, they are not visitor analytics, and
 * nothing in the retention promise covers them.
 */
export const RETENTION_DELETE = `DELETE FROM visitor_events WHERE occurred_at < ?`;

/** Typed by the operator to confirm. Deliberately not a plain "Yes". */
export const RETENTION_CONFIRM_PHRASE = 'SIL';
