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
