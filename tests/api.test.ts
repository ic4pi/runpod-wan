import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as auth } from '../api/auth';
import { POST as checkout } from '../api/checkout';
import { GET as me } from '../api/me';
import { GET as refreshGet, POST as refreshPost } from '../api/refresh';
import { safeNext, validCredentials } from '../lib/http';
import { MODULES } from '../lib/modules';
import { USER_ID, fakeFetch, res, setEnv, supa } from './helpers';

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://site.test${path}`, { method: 'POST', body: JSON.stringify(body), headers: { origin: 'https://site.test', 'content-type': 'application/json', ...headers } });
const cookiesOf = (r: Response) => r.headers.getSetCookie();
const session = { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, user: { id: USER_ID } };

beforeEach(() => { setEnv(); vi.unstubAllGlobals(); });

describe('catalog and prices', () => {
  it('prices follow contribution: Bakery > Beet > Sprouts, all inside the README range', () => {
    const p = Object.fromEntries(MODULES.map((m) => [m.id, m.priceCents]));
    expect(p.bakery!).toBeGreaterThan(p.beet!);
    expect(p.beet!).toBeGreaterThan(p.sprouts!);
    for (const id of ['bakery', 'beet', 'sprouts']) { expect(p[id]!).toBeGreaterThanOrEqual(399); expect(p[id]!).toBeLessThanOrEqual(599); }
    expect(p).toMatchObject({ bakery: 599, beet: 499, sprouts: 399 });
  });
  it('Diced is listed but cannot be bought', () => {
    const d = MODULES.find((m) => m.id === 'diced')!;
    expect(d.status).toBe('soon'); expect(d.priceCents).toBeNull();
  });
});

describe('input checks', () => {
  it('validates email and password', () => {
    expect(validCredentials(' A@B.co ', 'password1')).toEqual({ email: 'a@b.co', password: 'password1' });
    for (const [e, p] of [['nope', 'password1'], ['a@b.co', 'short'], ['a@b.co', 'x'.repeat(73)], [1, 'password1'], ['a@b.co', null], ['a b@c.co', 'password1']]) expect(validCredentials(e, p)).toBeNull();
  });
  it('only redirects to paths on this site', () => {
    expect(safeNext('/bakery/')).toBe('/bakery/');
    for (const bad of [null, '', 'https://evil.com', '//evil.com', '/\\evil.com', 'bakery', '/a\nb']) expect(safeNext(bad)).toBe('/account/');
  });
});

describe('sign in and out', () => {
  it('signs in and sets protected cookies', async () => {
    vi.stubGlobal('fetch', fakeFetch((u) => (u.includes('grant_type=password') ? res(session) : undefined)).fn);
    const r = await auth(post('/api/auth', { action: 'login', email: 'a@b.co', password: 'password1' }));
    expect(r.status).toBe(200);
    const c = cookiesOf(r);
    expect(c.find((x) => x.startsWith('pa=AT'))).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(c.find((x) => x.startsWith('pr=RT'))).toContain('Max-Age=2592000');
    expect(await r.json()).toEqual({ ok: true }); // tokens never appear in the body
  });
  it('says the same thing for a wrong password and rejects bad input', async () => {
    vi.stubGlobal('fetch', fakeFetch((u) => (u.includes('grant_type=password') ? res({}, 400) : undefined)).fn);
    expect((await auth(post('/api/auth', { action: 'login', email: 'a@b.co', password: 'password1' }))).status).toBe(401);
    expect((await auth(post('/api/auth', { action: 'login', email: 'bad', password: 'password1' }))).status).toBe(400);
    expect((await auth(post('/api/auth', { action: 'nope' }))).status).toBe(400);
  });
  it('blocks calls from other sites', async () => {
    const f = fakeFetch(); vi.stubGlobal('fetch', f.fn);
    const r = await auth(post('/api/auth', { action: 'login', email: 'a@b.co', password: 'password1' }, { origin: 'https://evil.test' }));
    expect(r.status).toBe(403); expect(f.calls).toHaveLength(0);
  });
  it('sign-up that needs email confirmation sets no cookies', async () => {
    vi.stubGlobal('fetch', fakeFetch((u) => (u.endsWith('/auth/v1/signup') ? res({ id: USER_ID }) : undefined)).fn);
    const r = await auth(post('/api/auth', { action: 'signup', email: 'a@b.co', password: 'password1' }));
    expect(await r.json()).toEqual({ ok: true, confirm: true }); expect(cookiesOf(r)).toHaveLength(0);
  });
  it('logs out by clearing every cookie', async () => {
    vi.stubGlobal('fetch', fakeFetch().fn);
    const r = await auth(post('/api/auth', { action: 'logout' }, { cookie: 'pa=AT' }));
    expect(cookiesOf(r).map((c) => c.split('=')[0]).sort()).toEqual(['pa', 'pe', 'pr']);
    expect(cookiesOf(r).every((c) => c.includes('Max-Age=0'))).toBe(true);
  });
  it('reports unavailable if Supabase is down', async () => {
    vi.stubGlobal('fetch', fakeFetch(() => new Response('x', { status: 500 })).fn);
    expect((await auth(post('/api/auth', { action: 'login', email: 'a@b.co', password: 'password1' }))).status).toBe(503);
  });
});

describe('who am I', () => {
  const get = (cookie?: string) => me(new Request('https://site.test/api/me', { headers: cookie ? { cookie } : {} }));
  it('is signed out without a cookie, and still lists the catalog', async () => {
    const r = await get(); expect(r.status).toBe(401);
    const b = await r.json(); expect(b.error).toBe('signed_out'); expect(b.catalog).toHaveLength(4);
  });
  it('returns the email and only what the user owns', async () => {
    vi.stubGlobal('fetch', fakeFetch(supa.user(USER_ID, 'me@x.co'), supa.owned('beet')).fn);
    const b = await (await get('pa=AT')).json();
    expect(b).toMatchObject({ email: 'me@x.co', owned: ['beet'], payments: true });
    expect(JSON.stringify(b)).not.toMatch(/service-key|sk_test/);
  });
  it('says expired when the token is stale but a refresh cookie exists', async () => {
    vi.stubGlobal('fetch', fakeFetch(supa.userRejected()).fn);
    expect((await (await get('pa=old; pr=RT')).json()).error).toBe('expired');
  });
});

describe('refresh', () => {
  const refreshOk = (u: string) => (u.includes('grant_type=refresh_token') ? res(session) : undefined);
  it('renews and returns to the page with a one-time marker', async () => {
    vi.stubGlobal('fetch', fakeFetch(refreshOk).fn);
    const r = await refreshGet(new Request('https://site.test/api/refresh?next=%2Fbakery%2F', { headers: { cookie: 'pr=RT' } }));
    expect(r.status).toBe(302); expect(r.headers.get('location')).toBe('/bakery/?_r=1'); expect(cookiesOf(r).some((c) => c.startsWith('pa=AT'))).toBe(true);
  });
  it('will not redirect off-site', async () => {
    vi.stubGlobal('fetch', fakeFetch(refreshOk).fn);
    const r = await refreshGet(new Request('https://site.test/api/refresh?next=https%3A%2F%2Fevil.com', { headers: { cookie: 'pr=RT' } }));
    expect(r.headers.get('location')).toBe('/account/?_r=1');
  });
  it('sends you to sign in when the refresh fails', async () => {
    vi.stubGlobal('fetch', fakeFetch(() => res({}, 400)).fn);
    const r = await refreshGet(new Request('https://site.test/api/refresh?next=%2Fbakery%2F', { headers: { cookie: 'pr=RT' } }));
    expect(r.headers.get('location')).toBe('/account/'); expect(cookiesOf(r).every((c) => c.includes('Max-Age=0'))).toBe(true);
  });
  it('POST needs a same-site caller', async () => {
    vi.stubGlobal('fetch', fakeFetch(refreshOk).fn);
    expect((await refreshPost(post('/api/refresh', {}, { origin: 'https://evil.test', cookie: 'pr=RT' }))).status).toBe(403);
    expect((await refreshPost(post('/api/refresh', {}, { cookie: 'pr=RT' }))).status).toBe(200);
  });
});

describe('checkout', () => {
  const buy = (module: unknown, cookie = 'pa=AT') => checkout(post('/api/checkout', { module }, { cookie }));
  const stripeOk = (u: string) => (u.includes('api.stripe.com') ? res({ url: 'https://checkout.stripe.com/c/pay/abc' }) : undefined);

  it('creates a Stripe checkout for the right amount, tied to the signed-in user', async () => {
    const f = fakeFetch(supa.user(), supa.owned(), stripeOk); vi.stubGlobal('fetch', f.fn);
    const r = await buy('bakery');
    expect(await r.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/abc' });
    const stripeCall = f.calls.find((c) => c.url.includes('api.stripe.com'))!;
    const form = new URLSearchParams(String(stripeCall.init?.body));
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('599');
    expect(form.get('metadata[user_id]')).toBe(USER_ID); expect(form.get('metadata[module]')).toBe('bakery');
    expect(form.get('success_url')).toBe('https://site.test/account/?paid=bakery');
    expect((stripeCall.init?.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_123');
  });
  it('takes the price from the server, never from the browser', async () => {
    const f = fakeFetch(supa.user(), supa.owned(), stripeOk); vi.stubGlobal('fetch', f.fn);
    await checkout(post('/api/checkout', { module: 'beet', priceCents: 1, amount: 1 }, { cookie: 'pa=AT' }));
    expect(new URLSearchParams(String(f.calls.find((c) => c.url.includes('stripe'))!.init?.body)).get('line_items[0][price_data][unit_amount]')).toBe('499');
  });
  it.each([['diced'], ['nope'], [undefined], [42]])('will not sell %s', async (m) => {
    vi.stubGlobal('fetch', fakeFetch(supa.user(), supa.owned(), stripeOk).fn);
    expect((await buy(m)).status).toBe(400);
  });
  it('needs a signed-in user', async () => {
    vi.stubGlobal('fetch', fakeFetch(supa.userRejected()).fn);
    expect((await buy('bakery', '')).status).toBe(401);
    expect((await buy('bakery', 'pa=old')).status).toBe(401);
  });
  it('does not charge twice for the same module', async () => {
    const f = fakeFetch(supa.user(), supa.owned('bakery'), stripeOk); vi.stubGlobal('fetch', f.fn);
    expect((await buy('bakery')).status).toBe(409);
    expect(f.calls.some((c) => c.url.includes('stripe'))).toBe(false);
  });
  it('says payments are off until Stripe is configured', async () => {
    setEnv({ STRIPE_SECRET_KEY: undefined });
    vi.stubGlobal('fetch', fakeFetch(supa.user(), supa.owned()).fn);
    const r = await buy('bakery'); expect(r.status).toBe(503); expect((await r.json()).error).toBe('payments_not_configured');
  });
  it('blocks other sites', async () => {
    expect((await checkout(post('/api/checkout', { module: 'bakery' }, { origin: 'https://evil.test', cookie: 'pa=AT' }))).status).toBe(403);
  });
  it('reports a Stripe outage', async () => {
    vi.stubGlobal('fetch', fakeFetch(supa.user(), supa.owned(), (u) => (u.includes('stripe') ? new Response('x', { status: 500 }) : undefined)).fn);
    expect((await buy('bakery')).status).toBe(503);
  });
});
