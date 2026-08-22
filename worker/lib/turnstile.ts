/** Cloudflare Turnstile server-side verification. */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult {
  ok: boolean;
  /** Short reason for logs. Never surfaced to the visitor verbatim. */
  reason: string;
}

/**
 * Verify a Turnstile token.
 *
 * Fails closed: a missing secret, a missing token or a network error all count
 * as failure. Comment submission is not important enough to justify accepting
 * unverified input when the check cannot be performed.
 */
export async function verifyTurnstile(
  token: string | null | undefined,
  secret: string | undefined,
  remoteIp?: string,
): Promise<TurnstileResult> {
  if (!secret) return { ok: false, reason: 'secret-missing' };
  if (!token) return { ok: false, reason: 'token-missing' };

  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (remoteIp) body.append('remoteip', remoteIp);

  try {
    const response = await fetch(VERIFY_URL, { method: 'POST', body });
    if (!response.ok) return { ok: false, reason: `http-${response.status}` };
    const data = (await response.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success === true) return { ok: true, reason: 'ok' };
    return { ok: false, reason: (data['error-codes'] ?? ['unknown']).join(',') };
  } catch {
    return { ok: false, reason: 'network-error' };
  }
}
