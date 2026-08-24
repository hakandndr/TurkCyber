/** Compact private-console location label using Cloudflare edge metadata. */
export function formatLocation(
  country: string | null | undefined,
  city: string | null | undefined,
  regionCode: string | null | undefined,
): string {
  const cleanCity = city?.trim() ?? '';
  if (!cleanCity) return '—';

  const cleanCountry = country?.trim().toUpperCase() ?? '';
  const cleanRegion = regionCode?.trim().toUpperCase() ?? '';
  if (cleanCountry !== 'US' || !/^[A-Z]{2}$/.test(cleanRegion)) return cleanCity;
  if (cleanCity.toUpperCase().endsWith(`, ${cleanRegion}`)) return cleanCity;
  return `${cleanCity}, ${cleanRegion}`;
}
