import { describe, expect, it } from 'vitest';
import { decide } from '../lib/gate';
import { readEntitlements, signEntitlements } from '../lib/session';
import { ENV, USER_ID, deps, fakeFetch, supa } from './helpers';

const NOW = 1_700_000_000_000;
const req = (path: string, cookie: string | null = null) => ({ url: `https://site.test${path}`, cookie });
const note = (over: Partial<{ uid: string; mods: string[]; exp: number }> = {}) =>
  signEntitlements(ENV.SESSION_SECRET, { uid: USER_ID, mods: ['bakery'], exp: NOW + 60_000, ...over });

describe('paywall decision', () => {
  it('lets free pages through without any checks', async () => {
    const f = fakeFetch();
    expect(await decide(req('/'), deps(f.fn))).toEqual({ allow: true, setCookies: [] });
    expect(await decide(req('/account/'), deps(f.fn))).toEqual({ allow: true, setCookies: [] });
    expect(f.calls).toHaveLength(0);
  });

  it('locks everything when the server is not configured (fails closed)', async () => {
    for (const missing of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SESSION_SECRET']) {
      const d = await decide(req('/bakery/', 'pa=tok'), deps(fakeFetch().fn, { [missing]: undefined }));
      expect(d).toEqual({ allow: false, redirect: '/account/?error=config' });
    }
  });

  it('sends a visitor with no sign-in to the account page', async () => {
    expect(await decide(req('/bakery/'), deps(fakeFetch().fn))).toEqual({ allow: false, redirect: '/account/?need=bakery' });
    expect(await decide(req('/beet/assets/x.js'), deps(fakeFetch().fn))).toEqual({ allow: false, redirect: '/account/?need=beet' });
  });

  it('accepts a valid signed ownership note with no database calls', async () => {
    const f = fakeFetch();
    const d = await decide(req('/bakery/', `pe=${await note()}`), deps(f.fn, {}, NOW));
    expect(d).toEqual({ allow: true, setCookies: [] });
    expect(f.calls).toHaveLength(0);
  });

  it('ignores a forged, edited or expired note', async () => {
    const good = await note();
    const [body, sig] = good.split('.');
    const forged = `${body.slice(0, -2)}AA.${sig}`;
    const other = await signEntitlements('y'.repeat(40), { uid: USER_ID, mods: ['bakery'], exp: NOW + 60_000 });
    const expired = await note({ exp: NOW - 1 });
    for (const bad of [forged, other, expired, 'garbage', `${good}.extra`]) {
      const d = await decide(req('/bakery/', `pe=${bad}`), deps(fakeFetch().fn, {}, NOW));
      expect(d).toEqual({ allow: false, redirect: '/account/?need=bakery' });
    }
  });

  it('a note for one module does not open another', async () => {
    const f = fakeFetch(supa.user(), supa.owned('bakery'));
    const d = await decide(req('/beet/', `pe=${await note()}; pa=tok`), deps(f.fn, {}, NOW));
    expect(d).toEqual({ allow: false, redirect: '/account/?need=beet' });
  });

  it('allows an owner and issues a fresh signed note', async () => {
    const f = fakeFetch(supa.user(), supa.owned('bakery', 'beet'));
    const d = await decide(req('/bakery/', 'pa=tok'), deps(f.fn, {}, NOW));
    if (!d.allow) throw new Error('expected allow');
    expect(d.setCookies).toHaveLength(1);
    expect(d.setCookies[0]).toMatch(/^pe=.+; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/);
    const value = d.setCookies[0].split(';')[0].slice(3);
    expect(await readEntitlements(ENV.SESSION_SECRET, value, NOW)).toMatchObject({ uid: USER_ID, mods: ['bakery', 'beet'] });
    // the user's own token is what proves ownership
    expect((f.calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('refuses a signed-in user who has not bought the module', async () => {
    const f = fakeFetch(supa.user(), supa.owned('beet'));
    expect(await decide(req('/bakery/', 'pa=tok'), deps(f.fn))).toEqual({ allow: false, redirect: '/account/?need=bakery' });
  });

  it('refuses a user who owns nothing', async () => {
    const f = fakeFetch(supa.user(), supa.owned());
    expect(await decide(req('/sprouts/', 'pa=tok'), deps(f.fn))).toEqual({ allow: false, redirect: '/account/?need=sprouts' });
  });

  it('tries one refresh for an expired sign-in, then stops (no loop)', async () => {
    const f = () => fakeFetch(supa.userRejected());
    expect(await decide(req('/bakery/', 'pa=old; pr=r'), deps(f().fn))).toEqual({ allow: false, redirect: '/api/refresh?next=%2Fbakery%2F' });
    expect(await decide(req('/bakery/?_r=1', 'pa=old; pr=r'), deps(f().fn))).toEqual({ allow: false, redirect: '/account/?need=bakery' });
    expect(await decide(req('/bakery/', 'pr=r'), deps(f().fn))).toEqual({ allow: false, redirect: '/api/refresh?next=%2Fbakery%2F' });
  });

  it('fails closed when Supabase is down or errors', async () => {
    const down = fakeFetch((u) => (u.includes('supabase') ? new Response('x', { status: 500 }) : undefined));
    expect(await decide(req('/bakery/', 'pa=tok'), deps(down.fn))).toEqual({ allow: false, redirect: '/account/?error=unavailable' });
    const boom = { fn: (async () => { throw new Error('network'); }) as unknown as typeof fetch };
    expect(await decide(req('/bakery/', 'pa=tok'), deps(boom.fn))).toEqual({ allow: false, redirect: '/account/?error=unavailable' });
  });

  it('cannot be fooled by look-alike paths', async () => {
    const f = fakeFetch();
    for (const p of ['/bakery', '/BAKERY/', '/bakery/../beet/']) {
      const d = await decide(req(p), deps(f.fn));
      expect(d.allow).toBe(false);
    }
    expect((await decide(req('/bakeryx/'), deps(f.fn))).allow).toBe(true); // not a paid module
  });
});
