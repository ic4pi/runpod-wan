/**
 * The paid modules. Prices are set by what each one contributes to Grocery's
 * promise: turn rough recordings into music people want to listen to.
 *   Pastry  finishes the song (mix and master)       -> biggest contribution
 *   Beet    makes the backing track from scratch     -> next
 *   Sprouts polishes the vocal before it is mixed    -> smallest of the three
 * Diced is not built yet, so it cannot be bought.
 */
export type ModuleId = 'pastry' | 'beet' | 'sprouts' | 'diced';

export interface ModuleInfo {
  id: ModuleId;
  name: string;
  tagline: string;
  why: string;
  priceCents: number | null; // null = not for sale yet
  status: 'live' | 'soon';
}

export const MODULES: ModuleInfo[] = [
  {
    id: 'pastry', name: 'Pastry', tagline: 'Mix and master',
    why: 'Turns a rough recording into a finished, release-ready master. The biggest step toward music people want to hear.',
    priceCents: 599, status: 'live',
  },
  {
    id: 'beet', name: 'Beet', tagline: 'Make the beat',
    why: 'Builds the backing track from scratch with drums, bass and synths, so you do not need outside beats.',
    priceCents: 499, status: 'live',
  },
  {
    id: 'sprouts', name: 'Sprouts', tagline: 'Polish the vocal',
    why: 'Vocal effects, layered takes and templates that lift the recording before it is mixed.',
    priceCents: 399, status: 'live',
  },
  {
    id: 'diced', name: 'Diced', tagline: 'Sampler and loops',
    why: 'Chop samples and build loops. Coming soon.',
    priceCents: null, status: 'soon',
  },
];

export const PAID_PATHS: ModuleId[] = ['pastry', 'beet', 'sprouts'];

export const getModule = (id: unknown): ModuleInfo | undefined => MODULES.find((m) => m.id === id);
export const isBuyable = (m: ModuleInfo | undefined): m is ModuleInfo & { priceCents: number } =>
  !!m && m.status === 'live' && m.priceCents !== null;

/** '/pastry/assets/x.js' -> 'pastry'. Anything that is not a paid module returns null. */
export function moduleForPath(pathname: string): ModuleId | null {
  const first = pathname.split('/')[1]?.toLowerCase();
  return (PAID_PATHS as string[]).includes(first) ? (first as ModuleId) : null;
}
