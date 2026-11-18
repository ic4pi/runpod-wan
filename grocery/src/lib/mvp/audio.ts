import type { CatalogBeat } from '../catalog';

let shared: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!shared) shared = new AudioContext();
  return shared;
}

export async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const ctx = audioContext();
  const bytes = await blob.arrayBuffer();
  return ctx.decodeAudioData(bytes.slice(0));
}

/** Load a real uploaded recording. There is deliberately no generated-audio fallback. */
export async function loadCatalogAudio(beat: CatalogBeat): Promise<AudioBuffer> {
  if (!beat.audioUrl) throw new Error('This beat has no audio file yet.');
  const response = await fetch(beat.audioUrl);
  if (!response.ok) throw new Error('The beat file could not be loaded.');
  return decodeAudio(await response.blob());
}
