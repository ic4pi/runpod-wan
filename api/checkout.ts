import { defaultDeps, authConfigured } from '../lib/env';
import { COOKIE_ACCESS, parseCookies } from '../lib/cookies';
import { json, sameOrigin, siteOrigin } from '../lib/http';
import { getModule, isBuyable } from '../lib/modules';
import { createCheckout } from '../lib/stripe';
import { getUser, listOwned } from '../lib/supabase';

/** POST { module } -> { url } to Stripe's hosted checkout page. */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const d = defaultDeps();
  if (!authConfigured(d.env)) return json({ error: 'not_configured' }, 503);
  if (!d.env.STRIPE_SECRET_KEY || !d.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'payments_not_configured', message: 'Payments are not switched on yet.' }, 503);

  let body: { module?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const m = getModule(body.module);
  if (!isBuyable(m)) return json({ error: 'not_for_sale', message: 'That module is not for sale yet.' }, 400);

  const token = parseCookies(request.headers.get('cookie'))[COOKIE_ACCESS];
  if (!token) return json({ error: 'signed_out' }, 401);
  try {
    const user = await getUser(d, token);
    if (!user) return json({ error: 'signed_out' }, 401);
    if ((await listOwned(d, token)).includes(m.id)) return json({ error: 'already_owned', message: 'You already own this module.' }, 409);
    return json({ url: await createCheckout(d, m, user, siteOrigin(request, d.env)) });
  } catch {
    return json({ error: 'unavailable', message: 'Could not start checkout. Try again in a minute.' }, 503);
  }
}
