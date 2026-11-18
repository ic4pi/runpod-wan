import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as checkout } from '../api/beat-checkout';
import { GET as license } from '../api/beat-license';
import { beatHasAudio, BEAT_LICENSE_VERSION, CATALOG_BEATS, getCatalogBeat } from '../lib/beats';
import { USER_ID, fakeFetch, res, setEnv, supa } from './helpers';

const post = (body: unknown, headers: Record<string, string> = {}) => new Request('https://site.test/api/beat-checkout', {
  method: 'POST',
  body: JSON.stringify(body),
  headers: { origin: 'https://site.test', 'content-type': 'application/json', ...headers },
});
const get = (beat: string, cookie = 'pa=AT') => license(new Request(`https://site.test/api/beat-license?beat=${encodeURIComponent(beat)}`, {
  headers: cookie ? { cookie } : {},
}));
const licenseRows = (rows: unknown[]) => (u: string) => u.includes('/rest/v1/grocery_beat_licenses?') ? res(rows) : undefined;
const stripeOk = (u: string) => u.includes('api.stripe.com') ? res({ url: 'https://checkout.stripe.com/c/pay/beat' }) : undefined;
const row = {
  id: 'license-1', beat_id: 'backseat-gospel', beat_title: 'Backseat Gospel',
  producer: 'Grocery', license_version: BEAT_LICENSE_VERSION, created_at: '2026-11-13T00:00:00Z',
};
const withAudio = () => { CATALOG_BEATS[0].audioUrl = '/beats/backseat-gospel.mp3'; };

beforeEach(() => {
  setEnv();
  vi.unstubAllGlobals();
  for (const beat of CATALOG_BEATS) delete beat.audioUrl;
});

describe('beat catalog', () => {
  it('has ten distinct real-audio slots and never marks an empty slot as sellable', () => {
    expect(CATALOG_BEATS).toHaveLength(10);
    expect(new Set(CATALOG_BEATS.map((beat) => beat.id)).size).toBe(10);
    for (const beat of CATALOG_BEATS) {
      expect(beat.producer).toBe('Grocery');
      expect(Number.isInteger(beat.priceCents)).toBe(true);
      expect(beat.priceCents).toBeGreaterThan(0);
      expect(beat.bpm).toBeGreaterThanOrEqual(60);
      expect(beat.bpm).toBeLessThanOrEqual(180);
      expect(beat.key).toBeGreaterThanOrEqual(0);
      expect(beat.key).toBeLessThan(12);
      expect(beatHasAudio(beat)).toBe(false);
    }
    withAudio();
    expect(beatHasAudio(CATALOG_BEATS[0])).toBe(true);
    expect(getCatalogBeat('backseat-gospel')?.title).toBe('Backseat Gospel');
    expect(getCatalogBeat('not-a-beat')).toBeUndefined();
    expect(getCatalogBeat(null)).toBeUndefined();
  });
});

describe('beat checkout', () => {
  it('uses the server price and creates a lease tied to the buyer and license version', async () => {
    withAudio();
    const f = fakeFetch(supa.user(), licenseRows([]), stripeOk);
    vi.stubGlobal('fetch', f.fn);
    const r = await checkout(post({ beat: 'backseat-gospel', priceCents: 1 }, { cookie: 'pa=AT' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/beat' });
    const call = f.calls.find((c) => c.url.includes('api.stripe.com'))!;
    const form = new URLSearchParams(String(call.init?.body));
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('1900');
    expect(form.get('metadata[kind]')).toBe('beat_lease');
    expect(form.get('metadata[user_id]')).toBe(USER_ID);
    expect(form.get('metadata[beat_id]')).toBe('backseat-gospel');
    expect(form.get('metadata[license_version]')).toBe(BEAT_LICENSE_VERSION);
    expect(form.get('success_url')).toBe('https://site.test/?paid=backseat-gospel');
    expect(form.get('cancel_url')).toBe('https://site.test/?cancelled=backseat-gospel');
  });

  it('requires a same-origin signed-in buyer and a real available recording', async () => {
    withAudio();
    const f = fakeFetch(supa.user(), licenseRows([]), stripeOk);
    vi.stubGlobal('fetch', f.fn);
    expect((await checkout(post({ beat: 'backseat-gospel' }, { origin: 'https://evil.test', cookie: 'pa=AT' }))).status).toBe(403);
    expect((await checkout(post({ beat: 'backseat-gospel' }))).status).toBe(401);
    expect((await checkout(post({ beat: 'unknown' }, { cookie: 'pa=AT' }))).status).toBe(404);
    delete CATALOG_BEATS[0].audioUrl;
    expect((await checkout(post({ beat: 'backseat-gospel' }, { cookie: 'pa=AT' }))).status).toBe(404);
    expect(f.calls.some((c) => c.url.includes('api.stripe.com'))).toBe(false);
  });

  it('does not sell the same beat twice', async () => {
    withAudio();
    const f = fakeFetch(supa.user(), licenseRows([row]), stripeOk);
    vi.stubGlobal('fetch', f.fn);
    const r = await checkout(post({ beat: 'backseat-gospel' }, { cookie: 'pa=AT' }));
    expect(r.status).toBe(409);
    expect(f.calls.some((c) => c.url.includes('api.stripe.com'))).toBe(false);
  });

  it('fails closed when payments or the license database are unavailable', async () => {
    withAudio();
    setEnv({ STRIPE_SECRET_KEY: undefined });
    expect((await checkout(post({ beat: 'backseat-gospel' }, { cookie: 'pa=AT' }))).status).toBe(503);
    setEnv();
    vi.stubGlobal('fetch', fakeFetch(supa.user(), (u) => u.includes('grocery_beat_licenses') ? res({}, 500) : undefined, stripeOk).fn);
    expect((await checkout(post({ beat: 'backseat-gospel' }, { cookie: 'pa=AT' }))).status).toBe(503);
  });
});

describe('verified beat license', () => {
  it('returns only a database-backed lease for the signed-in buyer', async () => {
    const f = fakeFetch(supa.user(USER_ID, 'buyer@example.com'), licenseRows([row]));
    vi.stubGlobal('fetch', f.fn);
    const r = await get('backseat-gospel');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ licensed: true, license: {
      id: 'license-1', beatId: 'backseat-gospel', beatTitle: 'Backseat Gospel',
      producer: 'Grocery', licensee: 'buyer@example.com',
      licensedAt: '2026-11-13T00:00:00Z', version: BEAT_LICENSE_VERSION,
    } });
    const read = f.calls.find((c) => c.url.includes('grocery_beat_licenses'))!;
    expect((read.init?.headers as Record<string, string>).Authorization).toBe('Bearer AT');
    expect(JSON.stringify(read.init?.headers)).not.toContain('service-key');
  });

  it('returns unlicensed for an empty result and never invents access on a database error', async () => {
    vi.stubGlobal('fetch', fakeFetch(supa.user(), licenseRows([])).fn);
    expect(await (await get('backseat-gospel')).json()).toEqual({ licensed: false });
    vi.stubGlobal('fetch', fakeFetch(supa.user(), (u) => u.includes('grocery_beat_licenses') ? res({}, 500) : undefined).fn);
    expect((await get('backseat-gospel')).status).toBe(503);
  });

  it('rejects signed-out users and unknown beats', async () => {
    expect((await get('backseat-gospel', '')).status).toBe(401);
    expect((await get('unknown')).status).toBe(404);
  });
});
