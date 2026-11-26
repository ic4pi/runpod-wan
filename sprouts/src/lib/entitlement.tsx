import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Free vs Pro for Sprouts.
 * Free: upload one beat, record one clean lead vocal over it with the default
 * template, save the song. Pro (the paid Sprouts module): every template,
 * doubles, ad-libs and backups, vocal effects, Levels, more tracks and the
 * Pastry handoff.
 * Anything unclear (signed out, offline, not configured) is Free.
 * Note: this runs in the browser, so it controls the app, it is not a lock
 * against someone editing the page. Payments and Pastry stay protected on the server.
 */
interface Ent { pro: boolean; known: boolean }
const Ctx = createContext<Ent>({ pro: false, known: false });

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const [ent, setEnt] = useState<Ent>({ pro: false, known: false });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
        const body = r.ok ? await r.json() as { owned?: unknown } : null;
        const owned = Array.isArray(body?.owned) ? (body!.owned as unknown[]) : [];
        if (alive) setEnt({ pro: owned.includes('sprouts'), known: true });
      } catch {
        if (alive) setEnt({ pro: false, known: true });
      }
    })();
    return () => { alive = false; };
  }, []);
  return <Ctx.Provider value={ent}>{children}</Ctx.Provider>;
}

export const useEntitlement = () => useContext(Ctx);

/** Small "this is part of Pro" note with a link to the account page. */
export function ProNote({ children }: { children: ReactNode }) {
  return (
    <p className="border border-primary/40 bg-primary/5 px-4 py-3 text-sm leading-relaxed text-foreground">
      {children}{' '}
      <a href="/account/?need=sprouts" className="text-primary underline underline-offset-4">Get Sprouts Pro</a>
    </p>
  );
}
