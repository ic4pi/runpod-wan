import { defaultDeps, authConfigured } from '../lib/env';
import { COOKIE_REFRESH, parseCookies } from '../lib/cookies';
import { json, redirect, safeNext, sameOrigin, sessionCookies, signedOutCookies } from '../lib/http';
import { refreshSession } from '../lib/supabase';

async function renew(request: Request) {
  const d = defaultDeps();
  if (!authConfigured(d.env)) return null;
  const rt = parseCookies(request.headers.get('cookie'))[COOKIE_REFRESH];
  if (!rt) return null;
  try { return await refreshSession(d, rt); } catch { return null; }
}

/** Used by the paywall: swap an expired sign-in for a fresh one, then go back where you were. */
export async function GET(request: Request): Promise<Response> {
  const next = safeNext(new URL(request.url).searchParams.get('next'));
  const s = await renew(request);
  if (!s) return redirect('/account/', signedOutCookies());
  const to = new URL(next, 'https://x.invalid');
  to.searchParams.set('_r', '1');
  return redirect(`${to.pathname}${to.search}`, sessionCookies(s));
}

/** Used by the account page. */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const s = await renew(request);
  return s ? json({ ok: true }, 200, sessionCookies(s)) : json({ error: 'signed_out' }, 401, signedOutCookies());
}
