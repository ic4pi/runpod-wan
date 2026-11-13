import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCatalogAudio } from '../src/lib/mvp/audio';
import { CATALOG_BEATS } from '../src/lib/catalog';

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('AudioContext', class {
    decodeAudioData = vi.fn(async () => ({ duration: 12 }));
  });
});

describe('real-audio catalog loading', () => {
  it('refuses an empty slot without making a network request or generating sound', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(loadCatalogAudio(CATALOG_BEATS[0])).rejects.toThrow('no audio file');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a missing real file instead of falling back to synthesized audio', async () => {
    const beat = { ...CATALOG_BEATS[0], audioUrl: '/beats/missing.wav' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));
    await expect(loadCatalogAudio(beat)).rejects.toThrow('could not be loaded');
  });

  it('decodes the actual recording returned by the catalog URL', async () => {
    const beat = { ...CATALOG_BEATS[0], audioUrl: '/beats/backseat-gospel.wav' };
    const fetcher = vi.fn(async () => new Response(new Blob(['real audio']), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const buffer = await loadCatalogAudio(beat);
    expect(fetcher).toHaveBeenCalledWith('/beats/backseat-gospel.wav');
    expect(buffer.duration).toBe(12);
  });
});
