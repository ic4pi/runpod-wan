import { defaultDeps, authConfigured } from '../lib/env';
import { COOKIE_ACCESS, parseCookies } from '../lib/cookies';
import { json, sameOrigin, sessionCookies, signedOutCookies, validCredentials } from '../lib/http';
import { passwordLogin, signOut, signUp } from '../lib/supabase';

/** POST { action: 'login' | 'signup' | 'logout', email, password } */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const d = defaultDeps();
  if (!authConfigured(d.env)) return json({ error: 'not_configured' }, 503);

  let body: { action?: string; email?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }

  if (body.action === 'logout') {
    const token = parseCookies(request.headers.get('cookie'))[COOKIE_ACCESS];
    if (token) await signOut(d, token);
    return json({ ok: true }, 200, signedOutCookies());
  }

  if (body.action !== 'login' && body.action !== 'signup') return json({ error: 'bad_request' }, 400);
  const creds = validCredentials(body.email, body.password);
  if (!creds) return json({ error: 'invalid_input', message: 'Enter a valid email and a password of 8 to 72 characters.' }, 400);

  try {
    if (body.action === 'login') {
      const s = await passwordLogin(d, creds.email, creds.password);
      if (!s) return json({ error: 'invalid_login', message: 'Wrong email or password.' }, 401);
      return json({ ok: true }, 200, sessionCookies(s));
    }
    const r = await signUp(d, creds.email, creds.password);
    if (r === 'rejected') return json({ error: 'signup_rejected', message: 'Could not create that account. Try a different password, or sign in if you already have one.' }, 400);
    if (r === 'confirm') return json({ ok: true, confirm: true });
    return json({ ok: true }, 200, sessionCookies(r));
  } catch {
    return json({ error: 'unavailable', message: 'Sign-in is unavailable right now. Try again in a minute.' }, 503);
  }
}
