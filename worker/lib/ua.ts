/**
 * User-agent interpretation and bot classification.
 *
 * The bot list is kept here as a visible application-level constant rather than
 * inside a dependency. Deciding what counts as a visitor is an editorial
 * judgement and it needs adjusting as new crawlers appear.
 */

export type Device = 'Mobile' | 'Desktop';

const MOBILE = /Mobile|Android|iPhone|iPad/i;

export function detectDevice(userAgent: string): Device {
  return MOBILE.test(userAgent || '') ? 'Mobile' : 'Desktop';
}

/**
 * Browser name and major version.
 *
 * Order matters: Edge and Opera both advertise Chrome in their user agent, so
 * they must be checked first or every Edge visit is recorded as Chrome.
 */
export function detectBrowser(userAgent: string): string {
  const ua = userAgent || '';
  let match: RegExpMatchArray | null;

  if ((match = ua.match(/Edg\/(\d+)/))) return `Edge ${match[1]}`;
  if ((match = ua.match(/OPR\/(\d+)/))) return `Opera ${match[1]}`;
  if ((match = ua.match(/Chrome\/(\d+)/))) return `Chrome ${match[1]}`;
  if ((match = ua.match(/Firefox\/(\d+)/))) return `Firefox ${match[1]}`;
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Other';
}

/**
 * Substrings that mark an automated client. Lowercase; matched against a
 * lowercased user agent.
 *
 * Bots are classified, never dropped — the owner wants them visible in the
 * data, separated rather than deleted.
 */
export const BOT_PATTERNS: readonly string[] = [
  'bot',
  'crawl',
  'spider',
  'slurp',
  'headless',
  'preview',
  'scan',
  'monitor',
  'uptime',
  'curl',
  'wget',
  'python-requests',
  'go-http-client',
  'java/',
  'facebookexternalhit',
  'whatsapp',
  'telegram',
  'ahrefs',
  'semrush',
  'dataforseo',
];

export function isAutomated(userAgent: string): boolean {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return false;
  return BOT_PATTERNS.some((pattern) => ua.includes(pattern));
}

/**
 * SQL fragment classifying a row as automated.
 *
 * Interpolating BOT_PATTERNS here is safe because the list is a compile-time
 * constant defined in this file. Every value originating from a request must be
 * bound, never interpolated.
 */
export const BOT_SQL = `(${BOT_PATTERNS.map(
  (p) => `lower(coalesce(user_agent,'')) LIKE '%${p}%'`,
).join(' OR ')})`;
