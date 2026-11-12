import { defaultDeps } from '../lib/env';
import { json } from '../lib/http';
import { getModule, isBuyable } from '../lib/modules';
import { verifyStripeSignature } from '../lib/stripe';
import { grantEntitlement, recordEvent } from '../lib/supabase';

/**
 * Stripe calls this after a payment. It is the ONLY thing that grants a purchase,
 * and only after the signature proves the call really came from Stripe.
 */
export async function POST(request: Request): Promise<Response> {
  const d = defaultDeps();
  if (!d.env.STRIPE_WEBHOOK_SECRET || !d.env.SUPABASE_URL || !d.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'not_configured' }, 503);

  const raw = await request.text(); // the signature covers the exact raw text
  if (!(await verifyStripeSignature(raw, request.headers.get('stripe-signature'), d.env.STRIPE_WEBHOOK_SECRET, d.now()))) {
    return json({ error: 'bad_signature' }, 400);
  }

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(raw); } catch { return json({ error: 'bad_request' }, 400); }
  if (!event.id) return json({ error: 'bad_request' }, 400);

  if (event.type === 'checkout.session.completed') {
    const s = event.data?.object ?? {};
    const meta = (s.metadata ?? {}) as Record<string, string>;
    const m = getModule(meta.module);
    const paid = s.payment_status === 'paid';
    const userId = typeof meta.user_id === 'string' ? meta.user_id : '';
    const amount = typeof s.amount_total === 'number' ? s.amount_total : -1;
    // Grant only a fully paid, correctly priced purchase of a real module for a real user id.
    if (paid && isBuyable(m) && /^[0-9a-f-]{36}$/i.test(userId) && amount >= m.priceCents && typeof s.id === 'string') {
      try {
        await grantEntitlement(d, { user_id: userId, module: m.id, stripe_session_id: s.id, amount_cents: amount });
      } catch {
        return json({ error: 'grant_failed' }, 500); // Stripe will retry
      }
    }
  }
  try { await recordEvent(d, event.id); } catch { /* the grant above is idempotent, so a retry is harmless */ }
  return json({ received: true });
}
