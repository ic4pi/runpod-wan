import type { Deps } from './env';

/** Thin Supabase REST wrappers. All take injected deps so they can be tested. */

export interface SupaUser { id: string; email: string }
export interface SupaSession { access_token: string; refresh_token: string; expires_in: number; user?: { id: string; email?: string } }

const json = (h: Record<string, string>) => ({ 'Content-Type': 'application/json', ...h });

/** Returns the user if the token is valid, null if Supabase rejects it. Throws on outages. */
export async function getUser(d: Deps, token: string): Promise<SupaUser | null> {
  const r = await d.fetch(`${d.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: d.env.SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` },
  });
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new Error(`supabase user ${r.status}`);
  const u = (await r.json()) as { id?: string; email?: string };
  return u.id ? { id: u.id, email: u.email ?? '' } : null;
}

/** Row-level security means this only ever returns the signed-in user's own purchases. */
export async function listOwned(d: Deps, token: string): Promise<string[]> {
  const r = await d.fetch(`${d.env.SUPABASE_URL}/rest/v1/produce_entitlements?select=module`, {
    headers: { apikey: d.env.SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`supabase entitlements ${r.status}`);
  const rows = (await r.json()) as { module?: string }[];
  return rows.map((x) => x.module).filter((m): m is string => typeof m === 'string');
}

export interface BeatLicenseRow {
  id: string;
  beat_id: string;
  beat_title: string;
  producer: string;
  license_version: string;
  created_at: string;
}

/** RLS limits this read to the signed-in buyer. */
export async function getBeatLicense(d: Deps, token: string, beatId: string): Promise<BeatLicenseRow | null> {
  const r = await d.fetch(`${d.env.SUPABASE_URL}/rest/v1/grocery_beat_licenses?select=id,beat_id,beat_title,producer,license_version,created_at&beat_id=eq.${encodeURIComponent(beatId)}&limit=1`, {
    headers: { apikey: d.env.SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`supabase beat license ${r.status}`);
  const rows = (await r.json()) as BeatLicenseRow[];
  return rows[0] ?? null;
}

export async function passwordLogin(d: Deps, email: string, password: string): Promise<SupaSession | null> {
  const r = await d.fetch(`${d.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: json({ apikey: d.env.SUPABASE_ANON_KEY! }), body: JSON.stringify({ email, password }),
  });
  if (r.status === 400 || r.status === 401 || r.status === 422) return null;
  if (!r.ok) throw new Error(`supabase login ${r.status}`);
  return (await r.json()) as SupaSession;
}

/** Returns a session if sign-up logs the user straight in, or 'confirm' when an email must be confirmed first. */
export async function signUp(d: Deps, email: string, password: string): Promise<SupaSession | 'confirm' | 'rejected'> {
  const r = await d.fetch(`${d.env.SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST', headers: json({ apikey: d.env.SUPABASE_ANON_KEY! }), body: JSON.stringify({ email, password }),
  });
  if (r.status === 400 || r.status === 422) return 'rejected';
  if (!r.ok) throw new Error(`supabase signup ${r.status}`);
  const body = (await r.json()) as Partial<SupaSession>;
  return body.access_token && body.refresh_token ? (body as SupaSession) : 'confirm';
}

export async function refreshSession(d: Deps, refreshToken: string): Promise<SupaSession | null> {
  const r = await d.fetch(`${d.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: json({ apikey: d.env.SUPABASE_ANON_KEY! }), body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (r.status === 400 || r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new Error(`supabase refresh ${r.status}`);
  return (await r.json()) as SupaSession;
}

export async function signOut(d: Deps, token: string): Promise<void> {
  try {
    await d.fetch(`${d.env.SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: d.env.SUPABASE_ANON_KEY!, Authorization: `Bearer ${token}` } });
  } catch { /* best effort: cookies are cleared either way */ }
}

const service = (d: Deps) => ({ apikey: d.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${d.env.SUPABASE_SERVICE_ROLE_KEY}` });

/** Server-only. Safe to call twice for the same purchase. */
export async function grantEntitlement(d: Deps, row: { user_id: string; module: string; stripe_session_id: string; amount_cents: number }): Promise<void> {
  const r = await d.fetch(`${d.env.SUPABASE_URL}/rest/v1/produce_entitlements?on_conflict=user_id,module`, {
    method: 'POST',
    headers: json({ ...service(d), Prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify({ ...row, source: 'stripe' }),
  });
  if (!r.ok) throw new Error(`grant failed ${r.status}`);
}

/** Server-only. One verified lease per buyer and beat; safe on webhook retry. */
export async function grantBeatLicense(d: Deps, row: { user_id: string; beat_id: string; beat_title: string; producer: string; stripe_session_id: string; amount_cents: number; license_version: string }): Promise<void> {
  const r = await d.fetch(`${d.env.SUPABASE_URL}/rest/v1/grocery_beat_licenses?on_conflict=user_id,beat_id`, {
    method: 'POST',
    headers: json({ ...service(d), Prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`beat license grant failed ${r.status}`);
}

/** Server-only. Records that a Stripe event was handled. */
export async function recordEvent(d: Deps, eventId: string): Promise<void> {
  const r = await d.fetch(`${d.env.SUPABASE_URL}/rest/v1/produce_stripe_events?on_conflict=id`, {
    method: 'POST',
    headers: json({ ...service(d), Prefer: 'resolution=ignore-duplicates,return=minimal' }),
    body: JSON.stringify({ id: eventId }),
  });
  if (!r.ok) throw new Error(`event log failed ${r.status}`);
}
