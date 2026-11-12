import type { Env } from './env';
import { COOKIE_ACCESS, COOKIE_ENT, COOKIE_REFRESH, setCookie } from './cookies';
import type { SupaSession } from './supabase';

export function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const h = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function redirect(to: string, cookies: string[] = []): Response {
  const h = new Headers({ Location: to, 'Cache-Control': 'no-store' });
  for (const c of cookies) h.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers: h });
}

/** CSRF guard for browser calls: the request must come from this same site. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (origin) return origin === new URL(req.url).origin;
  return req.headers.get('sec-fetch-site') === 'same-origin';
}

export const siteOrigin = (req: Request, env: Env) => env.SITE_URL || new URL(req.url).origin;

/** Only allow redirecting to a path on this site. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\') || next.includes('\n') || next.includes('\r')) return '/account/';
  return next;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function validCredentials(email: unknown, password: unknown): { email: string; password: string } | null {
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  const e = email.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) return null;
  if (password.length < 8 || password.length > 72) return null;
  return { email: e, password };
}

export function sessionCookies(s: SupaSession): string[] {
  return [
    setCookie(COOKIE_ACCESS, s.access_token, s.expires_in || 3600),
    setCookie(COOKIE_REFRESH, s.refresh_token, 60 * 60 * 24 * 30),
    setCookie(COOKIE_ENT, '', 0), // drop any cached ownership so the next check is fresh
  ];
}

export const signedOutCookies = () => [COOKIE_ACCESS, COOKIE_REFRESH, COOKIE_ENT].map((n) => setCookie(n, '', 0));
