import { vi } from 'vitest';
import type { Deps } from '../lib/env';

export const ENV = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  SESSION_SECRET: 'x'.repeat(40),
  STRIPE_SECRET_KEY: 'sk_test_123',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
};

export const USER_ID = '11111111-2222-3333-4444-555555555555';

type Route = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;

/** A fake fetch that answers by URL and records every call. */
export function fakeFetch(...routes: Route[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    for (const r of routes) { const out = await r(url, init); if (out) return out; }
    return new Response('not found', { status: 404 });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

export const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const supa = {
  user: (id = USER_ID, email = 'a@b.co'): Route => (u) => (u.endsWith('/auth/v1/user') ? res({ id, email }) : undefined),
  userRejected: (): Route => (u) => (u.endsWith('/auth/v1/user') ? res({ message: 'bad jwt' }, 401) : undefined),
  owned: (...mods: string[]): Route => (u) => (u.includes('/rest/v1/produce_entitlements?select=module') ? res(mods.map((module) => ({ module }))) : undefined),
};

export function deps(f: typeof fetch, over: Partial<Deps['env']> = {}, now = 1_700_000_000_000): Deps {
  return { env: { ...ENV, ...over }, fetch: f, now: () => now };
}

export function setEnv(over: Record<string, string | undefined> = {}) {
  for (const k of Object.keys(ENV)) delete (process.env as Record<string, string | undefined>)[k];
  for (const [k, v] of Object.entries({ ...ENV, ...over })) if (v !== undefined) process.env[k] = v;
}
