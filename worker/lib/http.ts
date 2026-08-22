/** Shared HTTP helpers: escaping, headers, small response builders. */

/**
 * Escape a value for interpolation into HTML text or a double-quoted attribute.
 *
 * Every analytics and comment field is attacker-controlled — user agents,
 * referrers, paths, display names, comment bodies. Rendering any of them raw is
 * a stored XSS against the only account that matters.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Headers required on every private response. */
export const PRIVATE_HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
};

function toRecord(init: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export function htmlResponse(body: string, status = 200, extra: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...PRIVATE_HEADERS, ...toRecord(extra) },
  });
}

export function jsonResponse(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...toRecord(extra),
    },
  });
}

/** Client address as seen by Cloudflare. */
export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? '';
}

/**
 * Reject cross-origin state-changing requests.
 *
 * SameSite=Lax already blocks the cookie on cross-site POSTs; this is the
 * second, explicit layer so the check does not depend on browser defaults.
 */
export function isSameOrigin(request: Request): boolean {
  const target = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin) return origin === target;

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin === target;
    } catch {
      return false;
    }
  }
  // Neither header present: refuse rather than assume.
  return false;
}
