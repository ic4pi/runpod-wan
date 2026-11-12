/**
 * Grocery bundle export — the Sprouts → Grocery handoff.
 * One ZIP: every stem as a strict-spec WAV (44.1kHz / 16-bit / stereo) plus
 * session.json in the Grocery metadata shape, so Beet, Processed/Preserved,
 * or the Grocery hub can rebuild the session with exact bar alignment.
 */
import JSZip from 'jszip';
import { audioBufferToWav } from './wav';
import { decodeBlob, mixLayers } from './render';
import { buildGrocerySession, grocerySessionJson, type GrocerySession } from './grocery';
import type { GenreTemplate, Levels } from '../templates';

export interface GroceryLayerExport {
  role: string;
  blob: Blob;
  duration: number;
  pan: number | null;
  gain: number | null;
  fx?: string;
}

async function toSpecWav(buf: AudioBuffer): Promise<Blob> {
  // mixLayers renders at 44.1k stereo; for raw buffers of another rate we do
  // a passthrough offline render at 44.1k stereo to guarantee the spec.
  if (buf.sampleRate === 44100 && buf.numberOfChannels === 2) {
    return audioBufferToWav(buf);
  }
  const offline = new OfflineAudioContext(2, Math.ceil(buf.duration * 44100), 44100);
  const src = offline.createBufferSource();
  src.buffer = buf;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return audioBufferToWav(rendered);
}

/** Build the full Grocery bundle and return it as a downloadable Blob. */
export async function exportGroceryBundle(opts: {
  sessionName: string;
  bpm: number;
  template: GenreTemplate;
  levels: Levels;
  layers: GroceryLayerExport[];
  beat?: { buffer: AudioBuffer; name: string } | null;
}): Promise<{ blob: Blob; session: GrocerySession }> {
  const { sessionName, bpm, template, levels, layers, beat } = opts;
  const zip = new JSZip();

  // 1. Session metadata (alignment map for every Grocery app)
  const session = buildGrocerySession({
    sessionName,
    bpm,
    templateId: template.id,
    layers: layers.map((l) => ({ role: l.role, duration: l.duration, pan: l.pan, gain: l.gain })),
    beatDuration: beat?.buffer.duration,
  });

  // 2. Stems — mixed through the template, strict 44.1/16/stereo
  const roleCounts: Record<string, number> = {};
  for (const l of layers) {
    const idx = (roleCounts[l.role] = (roleCounts[l.role] ?? 0) + 1);
    const fname = `${l.role}${idx > 1 ? `-${idx}` : ''}.wav`;
    const rendered = await mixLayers(
      [{ buffer: await decodeBlob(l.blob), role: l.role as 'lead', pan: l.pan, gain: l.gain, fx: l.fx }],
      template,
      levels,
    );
    zip.file(`stems/${fname}`, await toSpecWav(rendered));
  }

  if (beat) {
    zip.file('stems/beat.wav', await toSpecWav(beat.buffer));
  }

  zip.file('session.json', grocerySessionJson(session));
  zip.file('README.txt',
`SPROUTS SESSION — Grocery suite
Session: ${sessionName}
BPM: ${bpm} · Bars: ${session.barCount}
Template: ${template.name}

Stems are 44.1 kHz / 16-bit / stereo WAV.
Import session.json + stems/ into Grocery, Beet, or Processed/Preserved
to rebuild this session with bar-exact alignment.`);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return { blob, session };
}
