/**
 * Grocery's real-audio beat catalog.
 *
 * Add the mastered beat file to grocery/public/beats/, then set its audioUrl.
 * A slot without an audioUrl is visibly "coming soon" and cannot be previewed or sold.
 * No synthesizer or generated-audio fallback belongs in this catalog.
 */
export interface CatalogBeat {
  id: string;
  title: string;
  producer: string;
  genre: string;
  bpm: number;
  key: number;
  priceCents: number;
  art: 'teal' | 'yellow' | 'sage' | 'sky';
  audioUrl?: string;
}

export const BEAT_LICENSE_VERSION = 'grocery-nonexclusive-v1';

export const CATALOG_BEATS: CatalogBeat[] = [
  { id: 'backseat-gospel', title: 'Casimir Drift', producer: 'Grocery', genre: 'Boom bap', bpm: 88, key: 9, priceCents: 1900, art: 'sage' },
  { id: 'no-ceiling', title: 'Zero-Point', producer: 'Grocery', genre: 'Trap', bpm: 142, key: 2, priceCents: 1900, art: 'teal' },
  { id: 'mississippi-nights', title: 'Aether Static', producer: 'Grocery', genre: 'Lo-fi', bpm: 82, key: 4, priceCents: 1900, art: 'sky' },
  { id: 'pressure-talk', title: 'Rabi Cycle', producer: 'Grocery', genre: 'Trap', bpm: 138, key: 7, priceCents: 1900, art: 'yellow' },
  { id: 'chrome-and-dust', title: 'Quantum Foam', producer: 'Grocery', genre: 'Boom bap', bpm: 92, key: 0, priceCents: 1900, art: 'teal' },
  { id: 'late-checkout', title: 'Eigentone', producer: 'Grocery', genre: 'House rap', bpm: 124, key: 5, priceCents: 1900, art: 'sage' },
  { id: 'vicksburg-rain', title: 'Nonlocal', producer: 'Grocery', genre: 'Lo-fi', bpm: 78, key: 11, priceCents: 1900, art: 'sky' },
  { id: 'corner-store', title: 'Planck Length', producer: 'Grocery', genre: 'Boom bap', bpm: 90, key: 9, priceCents: 1900, art: 'yellow' },
  { id: 'northside-loop', title: 'Zitterbewegung', producer: 'Grocery', genre: 'Trap', bpm: 146, key: 6, priceCents: 1900, art: 'teal' },
  { id: 'last-call', title: 'Vacuum State', producer: 'Grocery', genre: 'House rap', bpm: 122, key: 3, priceCents: 1900, art: 'sage' },
];

export const getCatalogBeat = (id: unknown): CatalogBeat | undefined =>
  CATALOG_BEATS.find((beat) => beat.id === id);

/** Only real uploaded recordings are sellable. */
export const beatHasAudio = (beat: CatalogBeat): boolean => typeof beat.audioUrl === 'string' && beat.audioUrl.length > 0;
