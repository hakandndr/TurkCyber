/**
 * Timezone handling for analytics.
 *
 * SQLite has no timezone database. `date(occurred_at, '-7 hours')` looks like
 * it works and is silently wrong for half the year. The local date is therefore
 * computed in application code at write time and stored alongside the UTC
 * timestamp — see BLUEPRINT-visitor-analytics.md §6.
 */

export const DEFAULT_TIMEZONE = 'America/Los_Angeles';

/**
 * `YYYY-MM-DD` in the given timezone.
 *
 * `en-CA` is used because it yields ISO-ordered output, which sorts correctly
 * as text and needs no reassembly.
 */
export function localDate(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Panel timestamp: `2026-08-04 1:09:04pm`.
 *
 * Built from `formatToParts` rather than a format string. The am/pm marker is
 * not stable across ICU builds — the same options produce `PM`, `p.m.` and
 * `pm` depending on the runtime, and the runtime under test is not the runtime
 * in production. Reading the parts and normalising pins the output.
 *
 * Midnight and noon are `12`, never `0`.
 */
export function formatPanelTimestamp(
  value: string | Date,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const date = value instanceof Date ? value : parseStoredTimestamp(value);
  if (!date || Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';

  let hour = Number.parseInt(get('hour'), 10);
  // Some ICU builds emit 0 for midnight even with hour12: true.
  if (!Number.isFinite(hour) || hour === 0) hour = 12;

  const marker = get('dayPeriod').toLowerCase().replace(/[^ap]/g, '').startsWith('p') ? 'pm' : 'am';

  return (
    `${get('year')}-${get('month')}-${get('day')} ` +
    `${hour}:${get('minute')}:${get('second')}${marker}`
  );
}

/**
 * Owner-facing timestamp: `Aug 24, 2026 · 1:57 AM PDT`.
 *
 * The IANA timezone is passed to Intl so daylight-saving transitions are
 * resolved by the runtime timezone database rather than a fixed UTC offset.
 */
export function formatOwnerTimestamp(
  value: string | Date,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const date = value instanceof Date ? value : parseStoredTimestamp(value);
  if (!date || Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  let hour = Number.parseInt(get('hour'), 10);
  if (!Number.isFinite(hour) || hour === 0) hour = 12;
  const marker = get('dayPeriod')
    .toUpperCase()
    .replace(/[^APM]/g, '');

  return (
    `${get('month')} ${get('day')}, ${get('year')} · ` +
    `${hour}:${get('minute')} ${marker} ${get('timeZoneName')}`
  ).trim();
}

/**
 * Accept both ISO 8601 (`2026-08-04T20:09:04.000Z`) and the space-separated
 * form SQLite produces (`2026-08-04 20:09:04`). The latter is not valid ISO and
 * parses inconsistently across engines, so it is normalised first and treated
 * as UTC, which is how it was written.
 */
export function parseStoredTimestamp(value: string): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const normalised = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}Z`
    : trimmed;
  const date = new Date(normalised);
  return Number.isNaN(date.getTime()) ? null : date;
}
