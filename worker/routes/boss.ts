/**
 * The private /boss console: authentication, analytics, comment moderation.
 *
 * Never linked publicly, never in the sitemap, disallowed in robots.txt. Every
 * response carries no-store, no-referrer and noindex.
 */
import type { Env } from '../lib/env';
import { PRIVATE_HEADERS, clientIp, htmlResponse, isSameOrigin, jsonResponse } from '../lib/http';
import {
  IDLE_SECONDS,
  clearedSessionCookie,
  readCookie,
  refreshSession,
  SESSION_COOKIE,
  sessionCookie,
  signSession,
  verifyPassword,
  verifySession,
  type SessionPayload,
} from '../lib/auth';
import {
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_SECONDS,
  bump,
  loginKey,
  peek,
  reset,
} from '../lib/throttle';
import {
  LAST_24H_QUERY,
  PAGE_SIZE,
  RETENTION_CONFIRM_PHRASE,
  RETENTION_DAYS,
  RETENTION_DELETE,
  RETENTION_OLDER_QUERY,
  RETENTION_SUMMARY_QUERY,
  SUMMARY_QUERY,
  TOP_PAGES_QUERY,
  buildFilters,
  countQuery,
  retentionCutoff,
  rowsQuery,
  type RetentionStats,
} from '../lib/analytics-query';
import { DEFAULT_TIMEZONE } from '../lib/time';
import {
  renderAnalytics,
  renderComments,
  renderLogin,
  renderOverview,
  renderSystem,
  renderTable,
  renderUnconfigured,
  type ModerationRow,
  type SummaryData,
  type VisitRow,
} from './boss-views';

const GENERIC_LOGIN_ERROR = 'Kullanıcı adı veya şifre hatalı.';

export async function handleBoss(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  // Normalise so /boss, /boss/ and /boss/analytics all resolve consistently.
  const path = url.pathname.replace(/\/+$/, '') || '/boss';

  // A partially configured panel is worse than none. Refuse outright.
  if (!env.BOSS_USER || !env.BOSS_PASSWORD_HASH || !env.SESSION_SECRET) {
    return htmlResponse(renderUnconfigured(), 503);
  }

  if (path === '/boss/login' && request.method === 'POST') return login(request, env);
  if (path === '/boss/logout' && request.method === 'POST') return logout();

  const session = await verifySession(
    readCookie(request.headers.get('cookie'), SESSION_COOKIE),
    env.SESSION_SECRET,
  );
  if (!session) {
    // 401 with no data in the body.
    return htmlResponse(renderLogin(), 401);
  }

  const refreshed = refreshSession(session);
  const cookie = sessionCookie(await signSession(refreshed, env.SESSION_SECRET), IDLE_SECONDS);
  const withCookie = (response: Response): Response => {
    const headers = new Headers(response.headers);
    headers.append('set-cookie', cookie);
    return new Response(response.body, { status: response.status, headers });
  };

  try {
    if (path === '/boss') return withCookie(await overview(env));
    if (path === '/boss/analytics') return withCookie(await analytics(request, env));
    if (path === '/boss/comments') return withCookie(await commentsPage(request, env));
    if (path === '/boss/system') {
      return withCookie(await systemPage(env, noticeFrom(url)));
    }

    /*
     * Manual analytics retention.
     *
     * POST only, same-origin only, session required (that check has already
     * happened above), confirmation phrase required, audited. It touches
     * ANALYTICS_DB and nothing else. Nothing calls this on a schedule — see
     * the note in worker/lib/analytics-query.ts.
     */
    if (path === '/boss/analytics/purge') {
      if (request.method !== 'POST') {
        return htmlResponse('Method not allowed.', 405, { allow: 'POST' });
      }
      return withCookie(await purgeAnalytics(request, env, refreshed));
    }

    const moderate = path.match(/^\/boss\/comments\/(approve|reject|spam|delete)$/);
    if (moderate && request.method === 'POST') {
      return withCookie(await moderateComment(request, env, moderate[1]!, refreshed));
    }
    if (moderate) {
      return htmlResponse('Method not allowed.', 405, { allow: 'POST' });
    }

    return htmlResponse('Not found.', 404);
  } catch (error) {
    // Name the failure rather than falling through to the platform's generic
    // "Worker threw exception" page, which tells nobody anything.
    console.error('boss: handler failed', error);
    return withCookie(
      htmlResponse(
        renderOverview(
          EMPTY_SUMMARY,
          [],
          [],
          timeZone(env),
          `Panel query failed: ${String(error)}`,
        ),
        500,
      ),
    );
  }
}

const EMPTY_SUMMARY: SummaryData = {
  events: 0,
  visitors: 0,
  humans: 0,
  automated: 0,
  last24h: 0,
  pendingComments: 0,
};

const timeZone = (env: Env): string => env.ANALYTICS_TIMEZONE || DEFAULT_TIMEZONE;

async function login(request: Request, env: Env): Promise<Response> {
  if (!isSameOrigin(request)) return htmlResponse(renderLogin('İstek reddedildi.'), 403);

  const ip = clientIp(request);
  const key = loginKey(ip);

  // Checked BEFORE verifying the password, so a correct password is still
  // refused while the lockout window is open.
  const state = await peek(env.THROTTLE_KV, key, LOGIN_MAX_ATTEMPTS);
  if (state.blocked) {
    return htmlResponse(renderLogin('Çok fazla deneme. Daha sonra tekrar deneyin.'), 429);
  }

  const form = await request.formData();
  const username = String(form.get('username') ?? '');
  const password = String(form.get('password') ?? '');

  const userOk = username === env.BOSS_USER;
  const check = await verifyPassword(password, env.BOSS_PASSWORD_HASH!);

  if (!userOk || !check.ok) {
    await bump(env.THROTTLE_KV, key, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS);
    // The operator gets which CHECK failed; never a value, never to the visitor.
    console.warn(
      `boss: sign-in refused (user ${userOk ? 'ok' : 'mismatch'}, password ${
        check.ok ? 'ok' : 'failed'
      }, reason ${check.reason})`,
    );
    return htmlResponse(renderLogin(GENERIC_LOGIN_ERROR), 401);
  }

  await reset(env.THROTTLE_KV, key);

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { u: username, s: now, e: now + IDLE_SECONDS };
  const token = await signSession(payload, env.SESSION_SECRET!);

  return new Response(null, {
    status: 303,
    headers: {
      location: '/boss/',
      'set-cookie': sessionCookie(token, IDLE_SECONDS),
      ...PRIVATE_HEADERS,
    },
  });
}

function logout(): Response {
  return new Response(null, {
    status: 303,
    headers: { location: '/boss', 'set-cookie': clearedSessionCookie(), ...PRIVATE_HEADERS },
  });
}

async function loadSummary(env: Env): Promise<SummaryData> {
  const pendingPromise = loadPendingCommentCount(env);
  if (!env.ANALYTICS_DB) {
    return { ...EMPTY_SUMMARY, pendingComments: await pendingPromise };
  }
  const [summary, last24, pending] = await Promise.all([
    env.ANALYTICS_DB.prepare(SUMMARY_QUERY).first<{
      events: number;
      visitors: number;
      humans: number;
      automated: number;
    }>(),
    env.ANALYTICS_DB.prepare(LAST_24H_QUERY).first<{ events: number }>(),
    pendingPromise,
  ]);
  return {
    events: summary?.events ?? 0,
    visitors: summary?.visitors ?? 0,
    humans: summary?.humans ?? 0,
    automated: summary?.automated ?? 0,
    last24h: last24?.events ?? 0,
    pendingComments: pending,
  };
}

async function overview(env: Env): Promise<Response> {
  if (!env.ANALYTICS_DB) {
    const summary = await loadSummary(env);
    return htmlResponse(
      renderOverview(summary, [], [], timeZone(env), 'ANALYTICS_DB is not bound.'),
      503,
    );
  }
  const summary = await loadSummary(env);
  const [rows, top] = await Promise.all([
    env.ANALYTICS_DB.prepare(rowsQuery('')).bind(20, 0).all<VisitRow>(),
    env.ANALYTICS_DB.prepare(TOP_PAGES_QUERY).all<{ location: string; events: number }>(),
  ]);
  return htmlResponse(
    renderOverview(summary, rows.results ?? [], top.results ?? [], timeZone(env)),
  );
}

async function analytics(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const params = url.searchParams;

  if (!env.ANALYTICS_DB) {
    const summary = await loadSummary(env);
    return htmlResponse(
      renderAnalytics(
        summary,
        buildFilters({}),
        [],
        0,
        0,
        1,
        '',
        timeZone(env),
        'ANALYTICS_DB is not bound.',
      ),
      503,
    );
  }

  const filters = buildFilters({
    ip: params.get('ip') ?? '',
    country: params.get('country') ?? '',
    city: params.get('city') ?? '',
    path: params.get('path') ?? '',
    referrer: params.get('referrer') ?? '',
    flag: params.get('flag') ?? '',
    humans: params.get('humans') ?? '',
  });

  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [matched, totalRow, rows, summary] = await Promise.all([
    env.ANALYTICS_DB.prepare(countQuery(filters.clause))
      .bind(...filters.params)
      .first<{ total: number }>(),
    env.ANALYTICS_DB.prepare(countQuery('')).first<{ total: number }>(),
    env.ANALYTICS_DB.prepare(rowsQuery(filters.clause))
      .bind(...filters.params, PAGE_SIZE, offset)
      .all<VisitRow>(),
    loadSummary(env),
  ]);

  const matchedCount = matched?.total ?? 0;
  const totalCount = totalRow?.total ?? 0;
  const results = rows.results ?? [];

  // Live-filter partial. The full page above already works without JavaScript.
  if (params.get('partial') === '1') {
    return jsonResponse(
      { table: renderTable(results, timeZone(env)), matched: matchedCount, total: totalCount },
      200,
      PRIVATE_HEADERS,
    );
  }

  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(filters.active)) {
    if (k === 'humans') {
      if (v) query.set('humans', '1');
    } else if (v) {
      query.set(k, String(v));
    }
  }

  return htmlResponse(
    renderAnalytics(
      summary,
      filters,
      results,
      matchedCount,
      totalCount,
      page,
      query.toString(),
      timeZone(env),
    ),
  );
}

const VALID_STATUSES = new Set(['pending', 'approved', 'rejected', 'spam']);

async function commentsPage(request: Request, env: Env): Promise<Response> {
  const requested = new URL(request.url).searchParams.get('status') ?? 'pending';
  const status = VALID_STATUSES.has(requested) ? requested : 'pending';

  if (!env.APP_DB) {
    return htmlResponse(renderComments([], status, {}, timeZone(env), 'APP_DB is not bound.'), 503);
  }

  const [rows, countRows] = await Promise.all([
    env.APP_DB.prepare(
      `SELECT id, article_slug, parent_id, display_name, body, status, created_at,
              email, comment_ip, country, city, region_code
         FROM comments WHERE status = ?
        ORDER BY created_at DESC LIMIT 200`,
    )
      .bind(status)
      .all<ModerationRow>(),
    env.APP_DB.prepare(`SELECT status, count(*) AS n FROM comments GROUP BY status`).all<{
      status: string;
      n: number;
    }>(),
  ]);

  const counts: Record<string, number> = {};
  for (const row of countRows.results ?? []) counts[row.status] = row.n;

  return htmlResponse(renderComments(rows.results ?? [], status, counts, timeZone(env)));
}

async function moderateComment(
  request: Request,
  env: Env,
  action: string,
  session: SessionPayload,
): Promise<Response> {
  if (!isSameOrigin(request)) return htmlResponse('Forbidden.', 403);
  if (!env.APP_DB) return htmlResponse('APP_DB is not bound.', 503);

  const form = await request.formData();
  const id = Number.parseInt(String(form.get('id') ?? ''), 10);
  const back = String(form.get('status') ?? 'pending');
  if (!Number.isInteger(id) || id <= 0) return htmlResponse('Bad request.', 400);

  const statements = [];
  if (action === 'delete') {
    statements.push(env.APP_DB.prepare(`DELETE FROM comments WHERE id = ?`).bind(id));
  } else {
    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'spam';
    statements.push(
      env.APP_DB.prepare(`UPDATE comments SET status = ?, approved_at = ? WHERE id = ?`).bind(
        status,
        status === 'approved' ? new Date().toISOString() : null,
        id,
      ),
    );
  }

  statements.push(
    env.APP_DB.prepare(
      `INSERT INTO audit_events (occurred_at, actor, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, 'comment', ?, ?)`,
    ).bind(new Date().toISOString(), session.u, action, String(id), `via /boss/comments`),
  );

  await env.APP_DB.batch(statements);

  const target = VALID_STATUSES.has(back) ? back : 'pending';
  return new Response(null, {
    status: 303,
    headers: { location: `/boss/comments/?status=${target}`, ...PRIVATE_HEADERS },
  });
}

/**
 * Retention counts.
 *
 * Read-only. Runs on every System page load so the operator always sees the
 * real state rather than a number cached from an earlier visit.
 */
async function loadRetention(env: Env): Promise<RetentionStats | undefined> {
  if (!env.ANALYTICS_DB) return undefined;
  const cutoff = retentionCutoff(new Date());
  const [summary, older] = await Promise.all([
    env.ANALYTICS_DB.prepare(RETENTION_SUMMARY_QUERY).first<{
      total: number;
      oldest: string | null;
      newest: string | null;
    }>(),
    env.ANALYTICS_DB.prepare(RETENTION_OLDER_QUERY).bind(cutoff).first<{ older: number }>(),
  ]);
  return {
    total: summary?.total ?? 0,
    oldest: summary?.oldest ?? null,
    newest: summary?.newest ?? null,
    older: older?.older ?? 0,
    cutoff,
  };
}

/** Notices are passed as a flag, never as free text — the query string is visitor-writable. */
const NOTICES: Record<string, { text: string; ok: boolean }> = {
  purged: { text: 'Eski ziyaret kayıtları silindi.', ok: true },
  nothing: { text: `${RETENTION_DAYS} günden eski kayıt bulunamadı.`, ok: true },
  unconfirmed: { text: 'Onay metni eşleşmedi. Hiçbir kayıt silinmedi.', ok: false },
};

function noticeFrom(url: URL): { text: string; ok: boolean } | undefined {
  return NOTICES[url.searchParams.get('notice') ?? ''];
}

async function purgeAnalytics(
  request: Request,
  env: Env,
  session: SessionPayload,
): Promise<Response> {
  if (!isSameOrigin(request)) return htmlResponse('Forbidden.', 403);
  if (!env.ANALYTICS_DB) return htmlResponse('ANALYTICS_DB is not bound.', 503);

  const form = await request.formData();
  const confirm = String(form.get('confirm') ?? '')
    .trim()
    .toUpperCase();

  // Fail closed. An unconfirmed request deletes nothing and says so.
  if (confirm !== RETENTION_CONFIRM_PHRASE) {
    return redirectToSystem('unconfirmed');
  }

  const cutoff = retentionCutoff(new Date());
  const before = await env.ANALYTICS_DB.prepare(RETENTION_OLDER_QUERY)
    .bind(cutoff)
    .first<{ older: number }>();
  const count = before?.older ?? 0;

  if (count === 0) return redirectToSystem('nothing');

  // ANALYTICS_DB only. The audit record goes to APP_DB because that is where
  // the audit trail lives — an INSERT, never a DELETE against that database.
  await env.ANALYTICS_DB.prepare(RETENTION_DELETE).bind(cutoff).run();

  if (env.APP_DB) {
    await env.APP_DB.prepare(
      `INSERT INTO audit_events (occurred_at, actor, action, entity_type, entity_id, details)
       VALUES (?, ?, 'analytics_purge', 'analytics', ?, ?)`,
    )
      .bind(
        new Date().toISOString(),
        session.u,
        cutoff,
        `deleted ${count} visitor_events older than ${RETENTION_DAYS}d`,
      )
      .run()
      // An audit write that fails must not make the operator think the purge
      // failed — it already happened. Log it and carry on.
      .catch((error: unknown) => {
        console.error('boss: analytics purge audit write failed', error);
      });
  }

  console.warn(`boss: purged ${count} visitor_events older than ${cutoff} (actor ${session.u})`);
  return redirectToSystem('purged');
}

function redirectToSystem(notice: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: `/boss/system/?notice=${notice}`, ...PRIVATE_HEADERS },
  });
}

async function systemPage(env: Env, notice?: { text: string; ok: boolean }): Promise<Response> {
  const info: Record<string, string> = {
    environment: env.ENVIRONMENT ?? 'unknown',
    timezone: timeZone(env),
    APP_DB: env.APP_DB ? 'bound' : 'MISSING',
    ANALYTICS_DB: env.ANALYTICS_DB ? 'bound' : 'MISSING',
    THROTTLE_KV: env.THROTTLE_KV ? 'bound' : 'MISSING',
    turnstile: env.TURNSTILE_SECRET_KEY ? 'configured' : 'MISSING',
    comment_pepper: env.COMMENT_IP_PEPPER ? 'configured' : 'MISSING',
  };

  let audit: Array<{ occurred_at: string; actor: string; action: string; entity_id: string }> = [];
  if (env.APP_DB) {
    const rows = await env.APP_DB.prepare(
      `SELECT occurred_at, actor, action, entity_id FROM audit_events
        ORDER BY occurred_at DESC LIMIT 50`,
    )
      .all<{ occurred_at: string; actor: string; action: string; entity_id: string }>()
      .catch(() => ({ results: [] }));
    audit = rows.results ?? [];
  }

  const [retention, pendingComments] = await Promise.all([
    loadRetention(env).catch((error: unknown) => {
      console.error('boss: retention stats failed', error);
      return undefined;
    }),
    loadPendingCommentCount(env),
  ]);

  return htmlResponse(renderSystem(info, audit, timeZone(env), pendingComments, retention, notice));
}

async function loadPendingCommentCount(env: Env): Promise<number> {
  if (!env.APP_DB) return 0;
  const row = await env.APP_DB.prepare(
    `SELECT count(*) AS n FROM comments WHERE status = 'pending'`,
  )
    .first<{ n: number }>()
    .catch(() => null);
  return row?.n ?? 0;
}
