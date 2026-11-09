import JSZip from 'jszip';
import { liveCtx, type BTrack } from './engine';

const AUDIO_EXT = /\.(wav|mp3|m4a|aac|ogg|opus|flac|webm|mp4)$/i;
const MIME: Record<string, string> = {
  wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac',
  ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm', mp4: 'audio/mp4',
};

interface SessionTrack { name?: string; startBar?: number; offsetSeconds?: number; pan?: number | null; gain?: number | null; file?: string }
interface Session { suite?: string; bpm?: number; tracks?: SessionTrack[] }

const newId = () => crypto.randomUUID();
const stem = (n: string) => n.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

async function toTrack(blob: Blob, name: string, extra: Partial<BTrack> = {}): Promise<BTrack> {
  const buf = await liveCtx().decodeAudioData(await blob.arrayBuffer());
  return {
    id: newId(), name, blob, duration: buf.duration, offset: 0, volume: 0.8, pan: 0,
    mute: false, solo: false, eq: { low: 0, mid: 0, high: 0 }, comp: 0, ...extra,
  };
}

/** Import loose audio files and/or Produce session bundles (.zip with session.json + stems). */
export async function importFiles(files: File[]): Promise<{ tracks: BTrack[]; skipped: string[] }> {
  const tracks: BTrack[] = [];
  const skipped: string[] = [];

  for (const f of files) {
    try {
      if (/\.zip$/i.test(f.name)) {
        const zip = await JSZip.loadAsync(f);
        const sessionFile = zip.file(/(^|\/)session\.json$/i)[0];
        const session: Session | null = sessionFile ? safeJson(await sessionFile.async('string')) : null;
        const bar = session?.bpm ? (60 / session.bpm) * 4 : 0;
        const used = new Set<string>();

        for (const st of session?.tracks ?? []) {
          const entry = st.file ? zip.file(new RegExp(`(^|/)${escapeRe(st.file)}$`, 'i'))[0] : undefined;
          if (!entry) { skipped.push(`${st.name ?? st.file ?? 'track'} (file missing in zip)`); continue; }
          used.add(entry.name);
          const ext = entry.name.split('.').pop()!.toLowerCase();
          const blob = new Blob([await entry.async('arraybuffer')], { type: MIME[ext] ?? 'audio/wav' });
          tracks.push(await toTrack(blob, st.name ?? stem(entry.name), {
            offset: (st.startBar ?? 0) * bar + (st.offsetSeconds ?? 0),
            pan: st.pan ?? 0,
            volume: Math.min(1.5, st.gain ?? 0.8),
          }));
        }
        // any audio in the zip the session did not list
        for (const e of zip.file(AUDIO_EXT)) {
          if (used.has(e.name)) continue;
          const ext = e.name.split('.').pop()!.toLowerCase();
          tracks.push(await toTrack(new Blob([await e.async('arraybuffer')], { type: MIME[ext] ?? 'audio/wav' }), stem(e.name)));
        }
      } else if (f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)) {
        tracks.push(await toTrack(f, stem(f.name)));
      } else {
        skipped.push(`${f.name} (not audio)`);
      }
    } catch {
      skipped.push(`${f.name} (could not be read)`);
    }
  }
  return { tracks, skipped };
}

function safeJson(s: string): Session | null {
  try { const o = JSON.parse(s) as Session; return o && Array.isArray(o.tracks) ? o : null; } catch { return null; }
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
