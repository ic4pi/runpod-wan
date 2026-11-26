import { defaultDeps, authConfigured } from '../lib/env';
import { COOKIE_ACCESS, COOKIE_REFRESH, parseCookies } from '../lib/cookies';
import { json } from '../lib/http';
import { FREE_FOR_TESTING, MODULES } from '../lib/modules';
import { getUser, listOwned } from '../lib/supabase';

/** Who is signed in, what they own, and what is for sale. */
export async function GET(request: Request): Promise<Response> {
  const d = defaultDeps();
  const catalog = MODULES.map(({ id, name, tagline, why, priceCents, status }) => ({ id, name, tagline, why, priceCents, status }));
  const open = d.open ?? FREE_FOR_TESTING;
  const payments = !!d.env.STRIPE_SECRET_KEY && !!d.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!authConfigured(d.env)) return json({ error: 'not_configured', catalog, payments, open }, 503);

  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies[COOKIE_ACCESS];
  const refreshable = !!cookies[COOKIE_REFRESH];
  if (!token) return json({ error: refreshable ? 'expired' : 'signed_out', catalog, payments, open }, 401);
  try {
    const user = await getUser(d, token);
    if (!user) return json({ error: refreshable ? 'expired' : 'signed_out', catalog, payments, open }, 401);
    return json({ email: user.email, owned: await listOwned(d, token), catalog, payments, open });
  } catch {
    return json({ error: 'unavailable', catalog, payments, open }, 503);
  }
}
