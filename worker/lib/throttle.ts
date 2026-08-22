/**
 * Short-TTL counters for login throttling and comment rate limiting.
 *
 * Backed by Workers KV. Counters expire by themselves; nothing sweeps them.
 * If KV is unavailable the caller decides the failure mode — login fails
 * closed only where that is safe to do.
 */

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_SECONDS = 900; // 15 minutes

export const COMMENT_MAX_PER_WINDOW = 3;
export const COMMENT_WINDOW_SECONDS = 600; // 10 minutes

export interface ThrottleState {
  count: number;
  /** True once the count has reached the limit for this window. */
  blocked: boolean;
}

/** Read the current counter without incrementing. */
export async function peek(
  kv: KVNamespace | undefined,
  key: string,
  limit: number,
): Promise<ThrottleState> {
  if (!kv) return { count: 0, blocked: false };
  const raw = await kv.get(key);
  const count = raw ? Number.parseInt(raw, 10) || 0 : 0;
  return { count, blocked: count >= limit };
}

/**
 * Increment the counter for `key` and report whether the limit is now reached.
 *
 * KV has no atomic increment. A read-modify-write can undercount under
 * concurrent requests from the same address, which is acceptable here: the
 * counter is an abuse brake, not an accounting record.
 */
export async function bump(
  kv: KVNamespace | undefined,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<ThrottleState> {
  if (!kv) return { count: 0, blocked: false };
  const raw = await kv.get(key);
  const count = (raw ? Number.parseInt(raw, 10) || 0 : 0) + 1;
  await kv.put(key, String(count), { expirationTtl: windowSeconds });
  return { count, blocked: count >= limit };
}

export async function reset(kv: KVNamespace | undefined, key: string): Promise<void> {
  if (!kv) return;
  await kv.delete(key);
}

export const loginKey = (ip: string): string => `login:${ip || 'unknown'}`;
export const commentKey = (ipHash: string): string => `comment:${ipHash || 'unknown'}`;
