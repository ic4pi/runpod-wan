import { defaultDeps, authConfigured } from '../lib/env';
import { COOKIE_ACCESS, parseCookies } from '../lib/cookies';
import { json, sameOrigin, siteOrigin } from '../lib/http';
import { beatHasAudio, getCatalogBeat } from '../lib/beats';
import { createBeatCheckout } from '../lib/stripe';
import { getBeatLicense, getUser } from '../lib/supabase';

/** POST { beat } -> Stripe Checkout for one non-exclusive beat license. */
export async function POST(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return json({ error: 'forbidden' }, 403);
  const d = defaultDeps();
  if (!authConfigured(d.env)) return json({ error: 'not_configured' }, 503);
  if (!d.env.STRIPE_SECRET_KEY || !d.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'payments_not_configured', message: 'Beat payments are not switched on yet.' }, 503);

  let body: { beat?: unknown };
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const beat = getCatalogBeat(body.beat);
  if (!beat || !beatHasAudio(beat)) return json({ error: 'not_for_sale', message: 'That beat is not available yet.' }, 404);

  const token = parseCookies(request.headers.get('cookie'))[COOKIE_ACCESS];
  if (!token) return json({ error: 'signed_out' }, 401);
  try {
    const user = await getUser(d, token);
    if (!user) return json({ error: 'signed_out' }, 401);
    if (await getBeatLicense(d, token, beat.id)) return json({ error: 'already_owned', message: 'You already have a license for this beat.' }, 409);
    return json({ url: await createBeatCheckout(d, beat, user, siteOrigin(request, d.env)) });
  } catch {
    return json({ error: 'unavailable', message: 'Could not start beat checkout. Try again in a minute.' }, 503);
  }
}
