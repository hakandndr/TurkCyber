/**
 * Referrer normalisation.
 *
 * Produces a short label for grouping in the panel while the raw value is
 * stored untouched in `referrer_raw`, so normalisation can be revisited later
 * without having lost anything.
 */
export function normalizeReferrer(raw: string): string {
  const value = (raw || '').trim();
  if (!value) return 'Direct';

  const lower = value.toLowerCase();
  if (lower.includes('google')) return 'Google';
  if (lower.includes('instagram')) return 'Instagram';
  if (lower.includes('linkedin')) return 'LinkedIn';

  try {
    return new URL(value).hostname || value;
  } catch {
    // Not a URL — use the raw value as its own label rather than discarding it.
    return value;
  }
}
