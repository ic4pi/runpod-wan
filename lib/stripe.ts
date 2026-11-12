import type { Deps } from './env';
import type { ModuleInfo } from './modules';

/** Stripe Checkout session for one module. Plain REST, no SDK. */
export async function createCheckout(d: Deps, m: ModuleInfo & { priceCents: number }, user: { id: string; email: string }, origin: string): Promise<string> {
  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(m.priceCents),
    'line_items[0][price_data][product_data][name]': `Grocery ${m.name}`,
    'line_items[0][price_data][product_data][description]': m.tagline,
    success_url: `${origin}/account/?paid=${m.id}`,
    cancel_url: `${origin}/account/?cancelled=${m.id}`,
    client_reference_id: user.id,
    'metadata[user_id]': user.id,
    'metadata[module]': m.id,
  });
  if (user.email) form.set('customer_email', user.email);
  const r = await d.fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${d.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!r.ok) throw new Error(`stripe ${r.status}`);
  const s = (await r.json()) as { url?: string };
  if (!s.url) throw new Error('stripe returned no url');
  return s.url;
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Verifies a Stripe webhook: HMAC-SHA256 over "timestamp.body", within a 5 minute window. */
export async function verifyStripeSignature(body: string, header: string | null, secret: string, nowMs: number, toleranceSec = 300): Promise<boolean> {
  if (!header || !secret) return false;
  let t = '';
  const sigs: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k?.trim() === 't') t = (v ?? '').trim();
    if (k?.trim() === 'v1' && v) sigs.push(v.trim());
  }
  const ts = Number(t);
  if (!t || !Number.isFinite(ts) || !sigs.length) return false;
  if (Math.abs(nowMs / 1000 - ts) > toleranceSec) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${body}`)));
  return sigs.some((s) => s.length === expected.length && s.split('').reduce((acc, c, i) => acc | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0);
}
