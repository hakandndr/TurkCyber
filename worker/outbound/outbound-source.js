// Trusted source boundary. Optional source storage completes before forwarding.
import { outboundDestination } from './destination.js';
import { OUTBOUND_SCRIPT } from './outbound-client.js';

export const OUTBOUND_ENDPOINT = '/__analytics/outbound';
export const OUTBOUND_SCRIPT_PATH = '/__analytics/outbound.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED = new Set(['eventId', 'path', 'destination']);

export async function boundedJson(request) {
  if (!request.body || Number(request.headers.get('content-length') || 0) > 4096) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body));
  } finally {
    reader.releaseLock();
  }
}

export function outboundEvent(request, body, aliases) {
  const current = new URL(request.url);
  if (
    request.method !== 'POST' ||
    request.headers.get('origin') !== current.origin ||
    !aliases.includes(current.hostname) ||
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !ALLOWED.has(key)) ||
    !UUID.test(body.eventId || '')
  )
    return null;
  const destination = outboundDestination(body.destination, aliases);
  if (!destination) return null;
  let source;
  try {
    source = new URL(request.headers.get('referer'));
  } catch {
    return null;
  }
  if (
    source.origin !== current.origin ||
    source.pathname !== body.path ||
    source.pathname.length > 2048 ||
    !request.headers.get('cf-connecting-ip')
  )
    return null;
  const cf = request.cf || {};
  return {
    producerEventId: `outbound:${body.eventId}`,
    hostname: current.hostname,
    path: source.pathname,
    eventType: 'OUTBOUND_CLICK',
    occurredAt: new Date().toISOString(),
    outboundHost: destination.host,
    outboundUrl: destination.url,
    ip: request.headers.get('cf-connecting-ip'),
    userAgent: request.headers.get('user-agent') || '',
    referrer: source.origin,
    country: cf.country || '',
    region: cf.region || '',
    regionCode: cf.regionCode || '',
    city: cf.city || '',
    asn: Number.isInteger(Number(cf.asn)) ? Number(cf.asn) : null,
  };
}

export async function forwardEvent(env, type, event) {
  const method =
    type === 'PAGE' ? 'recordPage' : type === 'OUTBOUND_CLICK' ? 'recordActivity' : null;
  if (!method || !event || typeof env?.DNDR_COLLECTOR?.[method] !== 'function') return 'error';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const status = (await env.DNDR_COLLECTOR[method](event))?.status || 'error';
      if (status !== 'error') return status;
    } catch {
      /* Source writes and navigation survive delivery failure. */
    }
  }
  return 'error';
}

export async function storeOutbound(db, event) {
  // The first accepted observation owns this identity, including on retries.
  await db
    .prepare(
      'INSERT OR IGNORE INTO outbound_events (event_id,occurred_at,path,destination_host,destination_url,event_json) VALUES (?,?,?,?,?,?)',
    )
    .bind(
      event.producerEventId,
      event.occurredAt,
      event.path,
      event.outboundHost,
      event.outboundUrl,
      JSON.stringify(event),
    )
    .run();
  const stored = await db
    .prepare('SELECT event_json FROM outbound_events WHERE event_id=?')
    .bind(event.producerEventId)
    .first();
  if (!stored) throw Error('outbound_not_stored');
  return JSON.parse(stored.event_json);
}

export function outboundScriptResponse() {
  return new Response(OUTBOUND_SCRIPT, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

export function injectOutbound(
  response,
  aliases,
  endpoint = OUTBOUND_ENDPOINT,
  scriptPath = OUTBOUND_SCRIPT_PATH,
) {
  if (
    response.status !== 200 ||
    !response.headers.get('content-type')?.toLowerCase().startsWith('text/html')
  )
    return response;
  // No layout, text or navigation changes. Only a same-origin deferred script.
  try {
    return new HTMLRewriter()
      .on('head', {
        element(element) {
          element.append(
            `<script src="${scriptPath}" data-endpoint="${endpoint}" data-same-site="${aliases.join(',')}" defer></script>`,
            { html: true },
          );
        },
      })
      .transform(response);
  } catch {
    return response;
  }
}

export async function handleOutbound(
  request,
  env,
  ctx,
  { aliases, db = null, local = false, forward = null, acceptsPath = () => true, profile = null },
) {
  let event;
  try {
    event = outboundEvent(request, await boundedJson(request), aliases);
  } catch {
    event = null;
  }
  if (!event || !acceptsPath(event.path))
    return new Response(null, { status: 400, headers: { 'cache-control': 'no-store' } });
  if (local && !db)
    return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
  if (!ctx?.waitUntil)
    return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
  ctx.waitUntil(
    (async () => {
      try {
        const observed = profile ? { ...event, sourceProfile: profile(request) } : event;
        const stored = db ? await storeOutbound(db, observed) : observed;
        const payload = { ...stored };
        delete payload.sourceProfile;
        await (forward ? forward(payload) : forwardEvent(env, 'OUTBOUND_CLICK', payload));
      } catch {
        /* No local success means no central copy; neither blocks navigation. */
      }
    })(),
  );
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
