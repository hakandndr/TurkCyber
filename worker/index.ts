/**
 * TurkCyber Worker entry point.
 *
 * Responsibilities, in order:
 *   1. Dynamic routes: /collect, /api/comments, /boss/*
 *   2. Everything else: the static Astro build, via the ASSETS binding
 *
 * Route patterns in wrangler.jsonc carry a trailing wildcard because Cloudflare
 * matches a pattern against the whole URL including the query string. That
 * wildcard also catches unrelated paths (/collections/*), so this file checks
 * the exact pathname and falls through to assets for anything it does not own.
 */
import type { Env } from './lib/env';
import { handleCollect } from './routes/collect';
import { handleComments } from './routes/comments';
import { handleBoss } from './routes/boss';

/**
 * Security headers applied to public HTML responses.
 *
 * The CSP admits Google Fonts (stylesheet + font files) and the Turnstile
 * widget, and nothing else. It was tested against the built site rather than
 * copied: Astro ships no inline script that needs unsafe-inline, and the two
 * small progressive-enhancement scripts are served as external files.
 */
const PUBLIC_SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self' https://formspree.io/f/mljrvker",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self' https://challenges.cloudflare.com",
    'frame-src https://challenges.cloudflare.com',
    "connect-src 'self' https://formspree.io/f/mljrvker",
    'upgrade-insecure-requests',
  ].join('; '),
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'permissions-policy': 'geolocation=(), microphone=(), camera=(), interest-cohort=()',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/collect' || path === '/collect/') {
      return handleCollect(request, env, ctx);
    }

    if (path === '/api/comments' || path === '/api/comments/') {
      return handleComments(request, env, ctx);
    }

    if (path === '/boss' || path.startsWith('/boss/')) {
      return handleBoss(request, env);
    }

    // Anything else is the static site.
    const response = await env.ASSETS.fetch(request);
    return withSecurityHeaders(response, env);
  },
} satisfies ExportedHandler<Env>;

function withSecurityHeaders(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(PUBLIC_SECURITY_HEADERS)) {
    headers.set(key, value);
  }
  // HSTS only in production, where every hostname in scope is known to be
  // HTTPS-only. Setting it in development or on a shared staging hostname can
  // strand a sibling service that is not.
  if (env.ENVIRONMENT === 'production') {
    headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
  // Staging must never be indexed.
  if (env.ENVIRONMENT === 'staging') {
    headers.set('x-robots-tag', 'noindex, nofollow');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
