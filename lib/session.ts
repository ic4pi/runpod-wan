/**
 * A short-lived, signed note that says "this user owns these modules".
 * It saves a database round trip on every asset request. It is signed with
 * SESSION_SECRET, so it cannot be forged or edited.
 */
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage);
}

export interface EntPayload { uid: string; mods: string[]; exp: number } // exp in ms

export async function signEntitlements(secret: string, p: EntPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(p)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret, ['sign']), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function readEntitlements(secret: string, value: string | undefined, now: number): Promise<EntPayload | null> {
  if (!value) return null;
  const [body, sig, extra] = value.split('.');
  if (!body || !sig || extra !== undefined) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret, ['verify']), fromB64url(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as EntPayload;
    if (typeof p.uid !== 'string' || !Array.isArray(p.mods) || typeof p.exp !== 'number' || p.exp <= now) return null;
    return p;
  } catch {
    return null;
  }
}
