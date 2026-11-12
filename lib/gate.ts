import type { Deps } from './env';
import { authConfigured } from './env';
import { COOKIE_ACCESS, COOKIE_ENT, COOKIE_REFRESH, parseCookies, setCookie } from './cookies';
import { moduleForPath } from './modules';
import { readEntitlements, signEntitlements } from './session';
import { getUser, listOwned } from './supabase';

export const ENT_TTL_SECONDS = 600;

export type Decision =
  | { allow: true; setCookies: string[] }
  | { allow: false; redirect: string };

/**
 * Decides whether a request may see a paid module. It fails CLOSED:
 * anything unclear (missing config, outage, bad cookie) means "not allowed".
 */
export async function decide(req: { url: string; cookie: string | null }, d: Deps): Promise<Decision> {
  const url = new URL(req.url);
  const mod = moduleForPath(url.pathname);
  if (!mod) return { allow: true, setCookies: [] };

  if (!authConfigured(d.env)) return { allow: false, redirect: '/account/?error=config' };

  const cookies = parseCookies(req.cookie);

  // Fast path: a valid signed note says this user owns the module.
  const note = await readEntitlements(d.env.SESSION_SECRET!, cookies[COOKIE_ENT], d.now());
  if (note && note.mods.includes(mod)) return { allow: true, setCookies: [] };

  const login = `/account/?need=${mod}`;
  const refresh = `/api/refresh?next=${encodeURIComponent(url.pathname)}`;
  const access = cookies[COOKIE_ACCESS];
  // after one refresh attempt (marked _r) do not bounce again: send to sign-in instead of looping
  const canRefresh = !!cookies[COOKIE_REFRESH] && !url.searchParams.has('_r');

  if (!access) return { allow: false, redirect: canRefresh ? refresh : login };

  try {
    const user = await getUser(d, access);
    if (!user) return { allow: false, redirect: canRefresh ? refresh : login };

    const owned = await listOwned(d, access);
    if (!owned.includes(mod)) return { allow: false, redirect: login };

    const value = await signEntitlements(d.env.SESSION_SECRET!, { uid: user.id, mods: owned, exp: d.now() + ENT_TTL_SECONDS * 1000 });
    return { allow: true, setCookies: [setCookie(COOKIE_ENT, value, ENT_TTL_SECONDS)] };
  } catch {
    return { allow: false, redirect: '/account/?error=unavailable' };
  }
}
