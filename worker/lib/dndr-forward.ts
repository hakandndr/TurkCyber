/**
 * DNDR Analytics V2 dual-write — the additive secondary write.
 *
 * TurkCyber's own analytics (`visitor_events` in ANALYTICS_DB, read by
 * /boss/analytics) stay the authority. After a page view has been written
 * there, the same observation is also sent to the DNDR collector through a
 * Cloudflare Service Binding, so the two can be compared before anything is
 * cut over (DNDR docs/CONTROL-PLANE.md).
 *
 * Rules this module keeps:
 *
 * - It runs only after the source row is stored, inside ctx.waitUntil: the
 *   visitor's response never waits for it, and a source write that failed is
 *   never forwarded, so DNDR cannot hold a visit TurkCyber does not.
 * - The DNDR event id is the source row's own id, `visitor_events:<id>`. A
 *   retry of the same logical event carries the same id, so DNDR counts it
 *   once; no second identity is invented.
 * - Every failure is caught and logged as a status (no address, no secret);
 *   nothing it does can fail the request or touch the source row.
 * - It is enabled only where the binding exists AND the environment is one
 *   listed in DNDR_FORWARD_ENVIRONMENTS. Production has neither today.
 * - It sends no DNDR identity of its own choosing: the producer id is the
 *   binding's `props.producerId`, set in wrangler.jsonc and read by DNDR; the
 *   hostname is the one this Worker was invoked on, never the beacon's
 *   client-supplied host.
 */
import type { Env } from './env';

/** Environments where the dual-write may run. Adding one is a reviewed change. */
export const DNDR_FORWARD_ENVIRONMENTS: readonly string[] = ['staging'];

/** One extra attempt when the binding call itself fails; same event id. */
export const DNDR_FORWARD_ATTEMPTS = 2;

export type DndrStatus = 'accepted' | 'duplicate' | 'rejected' | 'error';

export interface DndrPageEvent {
  producerEventId: string;
  hostname: string;
  path: string;
  referrer: string | null;
  ip: string;
  userAgent: string;
  country: string;
  region: string;
  regionCode: string;
  city: string;
  asn: number | null;
}

export interface DndrResult {
  status: DndrStatus;
  reason?: string;
}

/** The ProducerApi entrypoint of dndr-collector, as this Worker sees it. */
export interface DndrCollector {
  recordPage(event: DndrPageEvent): Promise<DndrResult>;
}

export function dndrForwardingEnabled(env: Env): boolean {
  const binding = env.DNDR_COLLECTOR as Partial<DndrCollector> | undefined;
  return (
    Boolean(binding && typeof binding.recordPage === 'function') &&
    DNDR_FORWARD_ENVIRONMENTS.includes(env.ENVIRONMENT ?? '')
  );
}

export function producerEventId(rowId: number): string {
  return `visitor_events:${rowId}`;
}

/** The D1 row id of a successful insert, or null when D1 did not report one. */
export function insertedRowId(result: unknown): number | null {
  const id = (result as { meta?: { last_row_id?: unknown } } | null)?.meta?.last_row_id;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Send one event. Never throws. Returns the final status for the caller's
 * log line; `error` after the last attempt means DNDR may be missing this
 * event, which the parity report will show by id.
 */
export async function forwardToDndr(env: Env, event: DndrPageEvent): Promise<DndrStatus> {
  const binding = env.DNDR_COLLECTOR as DndrCollector;
  for (let attempt = 1; attempt <= DNDR_FORWARD_ATTEMPTS; attempt += 1) {
    try {
      const result = await binding.recordPage(event);
      const status: DndrStatus =
        result && ['accepted', 'duplicate', 'rejected', 'error'].includes(result.status)
          ? result.status
          : 'error';
      if (status !== 'error' || attempt === DNDR_FORWARD_ATTEMPTS) {
        // Event id and outcome only: never the address or the user agent.
        console.log(
          `dndr-forward: ${status}${result?.reason ? ` (${result.reason})` : ''} ${event.producerEventId}`,
        );
        return status;
      }
    } catch (error) {
      if (attempt === DNDR_FORWARD_ATTEMPTS) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`dndr-forward: error (${message}) ${event.producerEventId}`);
        return 'error';
      }
    }
  }
  return 'error';
}
