import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../api/stripe-webhook';
import { verifyStripeSignature } from '../lib/stripe';
import { ENV, USER_ID, fakeFetch, res, setEnv } from './helpers';

const enc = new TextEncoder();
async function sign(body: string, secret: string, t: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${body}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${sig}`;
}
const nowSec = () => Math.floor(Date.now() / 1000);

describe('Stripe signature check', () => {
  const body = '{"a":1}';
  it('accepts a correct signature', async () => {
    const t = nowSec();
    expect(await verifyStripeSignature(body, await sign(body, 's', t), 's', Date.now())).toBe(true);
  });
  it('rejects wrong secret, edited body, old or future timestamps, and junk', async () => {
    const t = nowSec();
    expect(await verifyStripeSignature(body, await sign(body, 'other', t), 's', Date.now())).toBe(false);
    expect(await verifyStripeSignature('{"a":2}', await sign(body, 's', t), 's', Date.now())).toBe(false);
    expect(await verifyStripeSignature(body, await sign(body, 's', t - 3600), 's', Date.now())).toBe(false);
    expect(await verifyStripeSignature(body, await sign(body, 's', t + 3600), 's', Date.now())).toBe(false);
    for (const h of [null, '', 'garbage', 't=abc,v1=00', 't=1', `t=${t}`, `t=${t},v1=`]) expect(await verifyStripeSignature(body, h, 's', Date.now())).toBe(false);
    expect(await verifyStripeSignature(body, await sign(body, 's', t), '', Date.now())).toBe(false);
  });
  it('accepts when any one of several v1 signatures matches', async () => {
    const t = nowSec();
    const good = (await sign(body, 's', t)).split(',')[1];
    expect(await verifyStripeSignature(body, `t=${t},v1=deadbeef,${good}`, 's', Date.now())).toBe(true);
  });
});

function event(over: Record<string, unknown> = {}, meta: Record<string, string> = {}) {
  return {
    id: 'evt_1', type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', payment_status: 'paid', amount_total: 599, metadata: { user_id: USER_ID, module: 'pastry', ...meta }, ...over } },
  };
}
async function call(ev: unknown, f: ReturnType<typeof fakeFetch>, headerOverride?: string) {
  vi.stubGlobal('fetch', f.fn);
  const body = JSON.stringify(ev);
  const sig = headerOverride ?? (await sign(body, ENV.STRIPE_WEBHOOK_SECRET, nowSec()));
  return POST(new Request('https://site.test/api/stripe-webhook', { method: 'POST', body, headers: { 'stripe-signature': sig } }));
}
const ok = () => fakeFetch((u) => (u.includes('/rest/v1/') ? new Response(null, { status: 201 }) : undefined));
const grants = (f: ReturnType<typeof fakeFetch>) => f.calls.filter((c) => c.url.includes('produce_entitlements'));

describe('Stripe webhook', () => {
  beforeEach(() => { setEnv(); vi.unstubAllGlobals(); });

  it('rejects a call that is not signed by Stripe, and grants nothing', async () => {
    const f = ok();
    expect((await call(event(), f, 't=1,v1=00')).status).toBe(400);
    expect(f.calls).toHaveLength(0);
  });

  it('grants a paid, correctly priced purchase', async () => {
    const f = ok();
    const r = await call(event(), f);
    expect(r.status).toBe(200);
    expect(grants(f)).toHaveLength(1);
    const g = grants(f)[0];
    expect(g.init?.method).toBe('POST');
    expect(JSON.parse(String(g.init?.body))).toEqual({ user_id: USER_ID, module: 'pastry', stripe_session_id: 'cs_1', amount_cents: 599, source: 'stripe' });
    expect((g.init?.headers as Record<string, string>).Authorization).toBe('Bearer service-key');
  });

  it('handles each module at its own price', async () => {
    for (const [module, amount] of [['beet', 499], ['sprouts', 399]] as const) {
      const f = ok();
      await call(event({ amount_total: amount }, { module }), f);
      expect(JSON.parse(String(grants(f)[0].init?.body)).module).toBe(module);
    }
  });

  it.each([
    ['not paid', event({ payment_status: 'unpaid' })],
    ['underpaid', event({ amount_total: 100 })],
    ['unknown module', event({}, { module: 'nope' })],
    ['module not for sale', event({}, { module: 'diced' })],
    ['bad user id', event({}, { user_id: "x'; drop table" })],
    ['no user id', event({}, { user_id: '' })],
    ['other event type', { ...event(), type: 'charge.refunded' }],
  ])('grants nothing when %s', async (_n, ev) => {
    const f = ok();
    expect((await call(ev, f)).status).toBe(200);
    expect(grants(f)).toHaveLength(0);
  });

  it('asks Stripe to retry when the database write fails', async () => {
    const f = fakeFetch((u) => (u.includes('produce_entitlements') ? new Response('x', { status: 500 }) : undefined));
    expect((await call(event(), f)).status).toBe(500);
  });

  it('is safe to receive twice', async () => {
    const f = ok();
    expect((await call(event(), f)).status).toBe(200);
    expect((await call(event(), f)).status).toBe(200);
    expect(grants(f).every((g) => String(g.init?.headers && (g.init.headers as Record<string, string>).Prefer).includes('ignore-duplicates'))).toBe(true);
  });

  it('reports not configured instead of guessing', async () => {
    setEnv({ STRIPE_WEBHOOK_SECRET: undefined });
    expect((await call(event(), ok())).status).toBe(503);
    void res;
  });

  describe('beat leases', () => {
    const beatEvent = (over: Record<string, unknown> = {}, meta: Record<string, string> = {}) => event(
      { amount_total: 1900, ...over },
      { kind: 'beat_lease', beat_id: 'backseat-gospel', license_version: 'grocery-nonexclusive-v1', ...meta },
    );
    const beatGrants = (f: ReturnType<typeof fakeFetch>) => f.calls.filter((c) => c.url.includes('grocery_beat_licenses'));

    it('grants a signed, paid lease into the separate beat-license table', async () => {
      const f = ok();
      expect((await call(beatEvent(), f)).status).toBe(200);
      expect(beatGrants(f)).toHaveLength(1);
      expect(grants(f)).toHaveLength(0);
      const grant = beatGrants(f)[0];
      expect(JSON.parse(String(grant.init?.body))).toEqual({
        user_id: USER_ID,
        beat_id: 'backseat-gospel',
        beat_title: 'Backseat Gospel',
        producer: 'Grocery',
        stripe_session_id: 'cs_1',
        amount_cents: 1900,
        license_version: 'grocery-nonexclusive-v1',
      });
      expect((grant.init?.headers as Record<string, string>).Authorization).toBe('Bearer service-key');
      expect((grant.init?.headers as Record<string, string>).Prefer).toContain('ignore-duplicates');
    });

    it.each([
      ['unpaid', beatEvent({ payment_status: 'unpaid' })],
      ['underpaid', beatEvent({ amount_total: 100 })],
      ['unknown beat', beatEvent({}, { beat_id: 'unknown' })],
      ['bad user', beatEvent({}, { user_id: 'not-a-user' })],
      ['missing session', beatEvent({ id: undefined })],
    ])('grants no lease when %s', async (_name, ev) => {
      const f = ok();
      expect((await call(ev, f)).status).toBe(200);
      expect(beatGrants(f)).toHaveLength(0);
      expect(grants(f)).toHaveLength(0);
    });

    it('does not let a beat event grant a module, or a module event grant a lease', async () => {
      const beatFetch = ok();
      await call(beatEvent({}, { module: 'pastry' }), beatFetch);
      expect(grants(beatFetch)).toHaveLength(0);
      const moduleFetch = ok();
      await call(event({ amount_total: 1900 }, { beat_id: 'backseat-gospel' }), moduleFetch);
      expect(beatGrants(moduleFetch)).toHaveLength(0);
    });

    it('asks Stripe to retry when a lease grant fails', async () => {
      const f = fakeFetch((u) => u.includes('grocery_beat_licenses') ? new Response('x', { status: 500 }) : undefined);
      expect((await call(beatEvent(), f)).status).toBe(500);
    });
  });
});
