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
  { id: 'backseat-gospel', title: 'Backseat Gospel', producer: 'Grocery', genre: 'Boom bap', bpm: 88, key: 9, priceCents: 1900, art: 'sage' },
  { id: 'stay-high', title: 'Stay High', producer: 'Grocery', genre: 'Trap', bpm: 129, key: 9, priceCents: 1900, art: 'teal', audioUrl: '/beats/stay-high.mp3' },
  { id: 'trap-canada', title: 'Trap Canada', producer: 'Grocery', genre: 'Trap', bpm: 136, key: 4, priceCents: 1900, art: 'sky', audioUrl: '/beats/trap-canada.mp3' },
  { id: 'underbelly-mystics', title: 'Underbelly Mystics', producer: 'Grocery', genre: 'Boom bap', bpm: 92, key: 3, priceCents: 1900, art: 'yellow', audioUrl: '/beats/underbelly-mystics.mp3' },
  { id: 'rubato-crawl', title: 'Rubato Crawl', producer: 'Grocery', genre: 'Dark trap', bpm: 123, key: 5, priceCents: 1900, art: 'teal', audioUrl: '/beats/rubato-crawl.mp3' },
  { id: 'candy-floss-echoes', title: 'Candy Floss Echoes', producer: 'Grocery', genre: 'Melodic', bpm: 118, key: 6, priceCents: 1900, art: 'sage', audioUrl: '/beats/candy-floss-echoes.mp3' },
  { id: 'vicksburg-rain', title: 'Vicksburg Rain', producer: 'Grocery', genre: 'Lo-fi', bpm: 78, key: 11, priceCents: 1900, art: 'sky' },
  { id: 'corner-store', title: 'Corner Store', producer: 'Grocery', genre: 'Boom bap', bpm: 90, key: 9, priceCents: 1900, art: 'yellow' },
  { id: 'northside-loop', title: 'Northside Loop', producer: 'Grocery', genre: 'Trap', bpm: 146, key: 6, priceCents: 1900, art: 'teal' },
  { id: 'last-call', title: 'Last Call', producer: 'Grocery', genre: 'House rap', bpm: 122, key: 3, priceCents: 1900, art: 'sage' },
];

export const getCatalogBeat = (id: unknown): CatalogBeat | undefined =>
  CATALOG_BEATS.find((beat) => beat.id === id);

/** Only real uploaded recordings are sellable. */
export const beatHasAudio = (beat: CatalogBeat): boolean => typeof beat.audioUrl === 'string' && beat.audioUrl.length > 0;
