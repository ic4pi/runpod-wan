import type { CatalogBeat } from '../catalog';
import { CAPI_TAG_DATA_URL } from './capiTag';

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

let tagPromise: Promise<AudioBuffer> | null = null;

function loadCapiTag(): Promise<AudioBuffer> {
  tagPromise ??= fetch(CAPI_TAG_DATA_URL)
    .then((response) => {
      if (!response.ok) throw new Error('The producer tag could not be loaded.');
      return response.blob();
    })
    .then(decodeAudio)
    .catch((error) => {
      tagPromise = null;
      throw error;
    });
  return tagPromise;
}

/** A few evenly spaced tags protect the whole unleased recording, not just its intro. */
export function capiWatermarkTimes(duration: number): number[] {
  if (duration <= 0) return [];
  if (duration < 6) return [Math.min(0.25, duration / 3)];
  const times: number[] = [];
  for (let at = 4; at + 0.5 < duration; at += 24) times.push(at);
  return times;
}

/** Render tags into the audio itself so unleased Sprouts/Pastry exports retain them. */
export async function addCapiWatermarks(beat: AudioBuffer): Promise<AudioBuffer> {
  const tag = await loadCapiTag();
  let tagPeak = 0;
  for (let channel = 0; channel < tag.numberOfChannels; channel += 1) {
    for (const sample of tag.getChannelData(channel)) tagPeak = Math.max(tagPeak, Math.abs(sample));
  }
  if (tagPeak === 0) throw new Error('The producer tag is silent.');
  // Neural/TTS assets vary widely in level. Normalize the short spoken tag so
  // it stays clearly audible without changing the underlying beat's balance.
  const tagGain = Math.min(8, 0.42 / tagPeak);
  const times = capiWatermarkTimes(beat.duration);
  const offline = new OfflineAudioContext(
    Math.min(2, beat.numberOfChannels),
    beat.length,
    beat.sampleRate,
  );
  const master = offline.createGain();
  master.gain.value = 0.82;
  master.connect(offline.destination);

  const music = offline.createBufferSource();
  music.buffer = beat;
  music.connect(master);
  music.start();

  for (const at of times) {
    const source = offline.createBufferSource();
    const gain = offline.createGain();
    source.buffer = tag;
    gain.gain.value = tagGain;
    source.connect(gain);
    gain.connect(master);
    source.start(at);
  }
  return offline.startRendering();
}

/** Store previews are always tagged; clean audio requires a database-backed lease. */
export async function loadPreviewAudio(beat: CatalogBeat): Promise<AudioBuffer> {
  return addCapiWatermarks(await loadCatalogAudio(beat));
}
