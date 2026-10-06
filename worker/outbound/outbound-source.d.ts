import type { D1Database } from '@cloudflare/workers-types';
export interface OutboundEvent {
  producerEventId: string;
  hostname: string;
  path: string;
  eventType: 'OUTBOUND_CLICK';
  occurredAt: string;
  outboundHost: string;
  outboundUrl: string;
  ip: string;
  userAgent: string;
  referrer: string;
  country: string;
  region: string;
  regionCode: string;
  city: string;
  asn: number | null;
}
interface Collector {
  recordActivity?(event: OutboundEvent): Promise<{ status: string }>;
}
interface Context {
  waitUntil(promise: Promise<unknown>): void;
}
export function handleOutbound(
  request: Request,
  env: { ENVIRONMENT?: string; DNDR_COLLECTOR?: Collector },
  ctx: Context | undefined,
  options: {
    aliases: string[];
    db?: D1Database;
    local?: boolean;
    acceptsPath?: (path: string) => boolean;
    profile?: (request: Request) => unknown;
  },
): Promise<Response>;
export function injectOutbound(
  response: Response,
  aliases: string[],
  endpoint?: string,
  scriptPath?: string,
): Response;
export function outboundScriptResponse(): Response;
