/**
 * Test doubles.
 *
 * The database stand-in is deliberately a small object rather than a mocking
 * library: these tests assert behaviour at the boundary, and a twenty-line fake
 * is easier to reason about than a mock framework's call graph.
 */

export interface FakeStatement {
  bind: (...args: unknown[]) => FakeStatement;
  run: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  first: () => Promise<unknown>;
}

export interface FakeDbOptions {
  /** Throw on every statement, simulating an unhealthy database. */
  throws?: boolean;
  /** Rows returned by `all()`. */
  rows?: unknown[];
  /** Row returned by `first()`. */
  first?: unknown;
  /** Observe successful statement execution without changing the fake result. */
  onRun?: () => void;
  /** Override the default D1-like run result. */
  runResult?: unknown;
}

export function fakeDb(options: FakeDbOptions = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  const db = {
    calls,
    prepare(sql: string): FakeStatement {
      const record = { sql, params: [] as unknown[] };
      calls.push(record);
      const statement: FakeStatement = {
        bind(...args: unknown[]) {
          record.params = args;
          return statement;
        },
        async run() {
          if (options.throws) throw new Error('D1 unavailable');
          options.onRun?.();
          return (
            options.runResult ?? {
              success: true,
              meta: { changes: 1, last_row_id: 1 },
            }
          );
        },
        async all() {
          if (options.throws) throw new Error('D1 unavailable');
          return { results: options.rows ?? [] };
        },
        async first() {
          if (options.throws) throw new Error('D1 unavailable');
          return options.first ?? null;
        },
      };
      return statement;
    },
    async batch(statements: FakeStatement[]) {
      if (options.throws) throw new Error('D1 unavailable');
      return statements.map(() => ({ success: true }));
    },
  };

  return db;
}

/** In-memory KV with TTL ignored — the tests drive expiry explicitly. */
export function fakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

/** Minimal ExecutionContext: waitUntil resolves inline so tests can await it. */
export function fakeCtx() {
  const promises: Promise<unknown>[] = [];
  return {
    promises,
    waitUntil(promise: Promise<unknown>) {
      promises.push(promise);
    },
    passThroughOnException() {},
    async settled() {
      await Promise.allSettled(promises);
    },
  };
}

/** Build a PBKDF2 hash in the stored format, for verification tests. */
export async function makeHash(password: string, iterations = 100_000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
