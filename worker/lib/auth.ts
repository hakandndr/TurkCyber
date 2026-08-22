/**
 * /boss authentication: PBKDF2 password verification and signed session
 * cookies. Follows BLUEPRINT-visitor-analytics.md §5.
 *
 * There is no server-side session store — a Worker keeps nothing between
 * requests — so the cookie carries its own expiry and is signed.
 */

/**
 * Hard ceiling, not a preference.
 *
 * The Cloudflare Workers runtime REFUSES PBKDF2 above 100,000 iterations: it
 * throws NotSupportedError rather than returning a mismatch. OWASP recommends
 * more; it cannot be used here. Raising this number breaks login at runtime,
 * not at build time.
 */
export const MAX_PBKDF2_ITERATIONS = 100_000;
export const MIN_PBKDF2_ITERATIONS = 1_000;

/** Refreshed on every authenticated request. */
export const IDLE_SECONDS = 1_800; // 30 minutes
/** Anchored at sign-in and never moved. */
export const ABSOLUTE_SECONDS = 28_800; // 8 hours

export const SESSION_COOKIE = 'tc_boss';

/** Constant-time comparison. Length mismatch short-circuits, which is fine. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** Why a sign-in was refused. Logged for the operator; never shown publicly. */
export interface PasswordCheck {
  ok: boolean;
  reason: 'ok' | 'hash-format' | 'iterations-out-of-range' | 'mismatch' | 'empty-password';
}

/**
 * Verify a password against a stored `pbkdf2$<iterations>$<salt>$<hash>` value.
 *
 * Every rejection path returns false. An unusable stored hash must not take the
 * request down — a thrown error here would turn a configuration mistake into a
 * 500 on the login page.
 */
export async function verifyPassword(password: string, stored: string): Promise<PasswordCheck> {
  if (!password) return { ok: false, reason: 'empty-password' };
  if (!stored) return { ok: false, reason: 'hash-format' };

  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return { ok: false, reason: 'hash-format' };
  }

  const iterations = Number.parseInt(parts[1]!, 10);
  if (
    !Number.isInteger(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS
  ) {
    return { ok: false, reason: 'iterations-out-of-range' };
  }

  let salt: Uint8Array;
  let expected: Uint8Array;
  try {
    salt = base64ToBytes(parts[2]!);
    expected = base64ToBytes(parts[3]!);
  } catch {
    return { ok: false, reason: 'hash-format' };
  }
  if (salt.length === 0 || expected.length === 0) {
    return { ok: false, reason: 'hash-format' };
  }

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
      key,
      expected.length * 8,
    );
    const ok = timingSafeEqual(new Uint8Array(bits), expected);
    return { ok, reason: ok ? 'ok' : 'mismatch' };
  } catch {
    // Runtime refused the parameters (e.g. iteration ceiling). Never throw.
    return { ok: false, reason: 'iterations-out-of-range' };
  }
}

export interface SessionPayload {
  /** Username. */
  u: string;
  /** Absolute anchor — set at sign-in, never moved. Epoch seconds. */
  s: number;
  /** Idle deadline — refreshed on each request. Epoch seconds. */
  e: number;
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmac(body, secret);
  return `${body}.${signature}`;
}

/**
 * Verify and decode a session token.
 *
 * The signature is checked BEFORE the payload is parsed. A tampered body must
 * be rejected without its contents ever being trusted.
 */
export async function verifySession(
  token: string | null | undefined,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): Promise<SessionPayload | null> {
  if (!token || !secret) return null;

  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = await hmac(body, secret);
  const encoder = new TextEncoder();
  if (!timingSafeEqual(encoder.encode(signature), encoder.encode(expected))) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload?.u !== 'string' || !payload.u) return null;
  if (!Number.isFinite(payload.s) || !Number.isFinite(payload.e)) return null;

  // Idle timeout.
  if (now > payload.e) return null;
  // Absolute timeout — activity must not extend a session past this cap.
  if (now > payload.s + ABSOLUTE_SECONDS) return null;

  return payload;
}

/** Reissue with a fresh idle deadline and the ORIGINAL absolute anchor. */
export function refreshSession(
  payload: SessionPayload,
  now: number = Math.floor(Date.now() / 1000),
): SessionPayload {
  return { u: payload.u, s: payload.s, e: now + IDLE_SECONDS };
}

export function sessionCookie(token: string, maxAge: number = IDLE_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

async function hmac(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return bytesToBase64Url(new Uint8Array(sig));
}

/** HMAC an arbitrary value to a hex digest — used for comment abuse keys. */
export async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBytes(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}
