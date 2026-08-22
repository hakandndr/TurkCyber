/**
 * Public comments API.
 *
 *   GET  /api/comments?slug=<article-slug>  → approved comments
 *   POST /api/comments                      → submit for moderation
 *
 * An outage here must never break an article. The article page renders from
 * static HTML and loads comments afterwards; when this endpoint fails the page
 * shows a Turkish notice and the content stays readable.
 */
import type { Env } from '../lib/env';
import { clientIp, isSameOrigin, jsonResponse } from '../lib/http';
import { sanitizeField } from '../lib/sanitize';
import { hmacHex } from '../lib/auth';
import { verifyTurnstile } from '../lib/turnstile';
import {
  bump,
  COMMENT_MAX_PER_WINDOW,
  COMMENT_WINDOW_SECONDS,
  commentKey,
  peek,
} from '../lib/throttle';
import { threadComments, validateComment, type PublicComment } from '../lib/comments';

/** Cap the body Cloudflare will read, so a large POST cannot be used as a lever. */
const MAX_REQUEST_BYTES = 16_384;

export async function handleComments(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') return listComments(request, env);
  if (request.method === 'POST') return submitComment(request, env);
  return jsonResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET, POST' });
}

async function listComments(request: Request, env: Env): Promise<Response> {
  if (!env.APP_DB) return jsonResponse({ comments: [], unavailable: true }, 503);

  const slug = sanitizeField(
    new URL(request.url).searchParams.get('slug') ?? '',
    120,
  ).toLowerCase();
  if (!slug) return jsonResponse({ error: 'slug_required' }, 400);

  try {
    const { results } = await env.APP_DB.prepare(
      `SELECT id, parent_id, display_name, body, created_at
         FROM comments
        WHERE article_slug = ? AND status = 'approved'
        ORDER BY created_at ASC
        LIMIT 500`,
    )
      .bind(slug)
      .all<{
        id: number;
        parent_id: number | null;
        display_name: string;
        body: string;
        created_at: string;
      }>();

    const rows: PublicComment[] = (results ?? []).map((r) => ({
      id: r.id,
      parentId: r.parent_id,
      displayName: r.display_name,
      body: r.body,
      createdAt: r.created_at,
    }));

    return jsonResponse({ comments: threadComments(rows), count: rows.length });
  } catch (error) {
    console.error('comments: list failed', error);
    return jsonResponse({ comments: [], unavailable: true }, 503);
  }
}

async function submitComment(request: Request, env: Env): Promise<Response> {
  // SameSite=Lax already blocks the cookie on cross-site POSTs; this is the
  // explicit second layer so the check does not rely on browser defaults.
  if (!isSameOrigin(request)) {
    return jsonResponse({ error: 'forbidden', message: 'İstek reddedildi.' }, 403);
  }
  if (!env.APP_DB) {
    return jsonResponse(
      { error: 'unavailable', message: 'Yorumlar şu anda alınamıyor. Daha sonra deneyin.' },
      503,
    );
  }

  const declared = Number.parseInt(request.headers.get('content-length') ?? '0', 10);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return jsonResponse({ error: 'too_large', message: 'Yorumunuz çok uzun.' }, 413);
  }

  let payload: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_REQUEST_BYTES) {
      return jsonResponse({ error: 'too_large', message: 'Yorumunuz çok uzun.' }, 413);
    }
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'bad_request', message: 'İstek okunamadı.' }, 400);
  }

  const validation = validateComment({
    slug: payload.slug,
    name: payload.name,
    body: payload.body,
    parentId: payload.parentId,
  });
  if (!validation.ok) {
    return jsonResponse(
      { error: 'invalid', field: validation.field, message: validation.message },
      400,
    );
  }

  const ip = clientIp(request);
  const pepper = env.COMMENT_IP_PEPPER;
  // No raw IP is stored for comments. Without a pepper we would be storing a
  // plain hash, which is trivially reversible across the IPv4 space, so the
  // field is left null rather than pretending to protect it.
  const ipHash = pepper && ip ? await hmacHex(ip, pepper) : null;

  const throttleId = ipHash ?? ip;
  const existing = await peek(env.THROTTLE_KV, commentKey(throttleId), COMMENT_MAX_PER_WINDOW);
  if (existing.blocked) {
    return jsonResponse(
      {
        error: 'rate_limited',
        message: 'Çok fazla yorum gönderdiniz. Biraz sonra tekrar deneyin.',
      },
      429,
    );
  }

  const turnstile = await verifyTurnstile(
    typeof payload.turnstileToken === 'string' ? payload.turnstileToken : null,
    env.TURNSTILE_SECRET_KEY,
    ip,
  );
  if (!turnstile.ok) {
    console.warn('comments: turnstile refused', turnstile.reason);
    return jsonResponse(
      { error: 'turnstile', message: 'Doğrulama tamamlanamadı. Sayfayı yenileyip tekrar deneyin.' },
      400,
    );
  }

  const cf = (request as { cf?: IncomingRequestCfProperties }).cf;

  try {
    await env.APP_DB.prepare(
      `INSERT INTO comments
         (article_slug, parent_id, display_name, body, status, created_at,
          ip_hash, user_agent, country)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    )
      .bind(
        validation.value.articleSlug,
        validation.value.parentId,
        validation.value.displayName,
        validation.value.body,
        new Date().toISOString(),
        ipHash,
        sanitizeField(request.headers.get('user-agent') ?? ''),
        sanitizeField(cf?.country ?? ''),
      )
      .run();
  } catch (error) {
    console.error('comments: insert failed', error);
    return jsonResponse(
      { error: 'unavailable', message: 'Yorumunuz kaydedilemedi. Daha sonra deneyin.' },
      503,
    );
  }

  await bump(
    env.THROTTLE_KV,
    commentKey(throttleId),
    COMMENT_MAX_PER_WINDOW,
    COMMENT_WINDOW_SECONDS,
  );

  // Nothing is publicly visible until an owner approves it.
  return jsonResponse({ ok: true, message: 'Yorumunuz inceleme için gönderildi.' }, 202);
}
