import JSZip from 'jszip';
import { decodeBlob, type StemInput } from './audio/render';
import { guessRole } from './templates';

export type Role = StemInput['role'];
export interface Stem { id: string; name: string; size: number; buffer: AudioBuffer; role: Role; offset: number; lead: number }

/** Seconds of near-silence before the first real sound (below about -48 dB). */
export function leadingSilence(buf: AudioBuffer, threshold = 0.004): number {
  let first = buf.length;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < first; i++) if (Math.abs(d[i]) > threshold) { first = i; break; }
  }
  return first >= buf.length ? 0 : first / buf.sampleRate;
}

const AUDIO_EXT = /\.(wav|mp3|m4a|aac|ogg|opus|flac|webm|mp4)$/i;
const MIME: Record<string, string> = {
  wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac',
  ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm', mp4: 'audio/mp4',
};
const newId = () => crypto.randomUUID();
const base = (n: string) => n.replace(/^.*[\\/]/, '');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Produce session roles (lead, double, backup, adlib, beat) -> Bakery buses. */
function roleFromSession(role: string | undefined, name: string): Role {
  if (role === 'beat') return 'beat';
  if (role === 'bass') return 'bass';
  if (role && /lead|double|backup|adlib|vocal|voice/.test(role)) return 'voice';
  return guessRole(name);
}

async function toStem(blob: Blob, name: string, size: number, role: Role, offset = 0): Promise<Stem> {
  const buffer = await decodeBlob(blob);
  return { id: newId(), name, size, buffer, role, offset, lead: leadingSilence(buffer) };
}

/** Import loose audio files and/or Produce session bundles (.zip with session.json + stems). */
export async function importFiles(files: File[]): Promise<{ stems: Stem[]; skipped: string[] }> {
  const stems: Stem[] = [];
  const skipped: string[] = [];

  for (const f of files) {
    try {
      if (/\.zip$/i.test(f.name)) {
        const zip = await JSZip.loadAsync(f);
        const sf = zip.file(/(^|\/)session\.json$/i)[0];
        let listed: { name?: string; role?: string; file?: string; startBar?: number; offsetSeconds?: number }[] = [];
        let barSeconds = 0;
        if (sf) {
          try { const o = JSON.parse(await sf.async('string')); if (Array.isArray(o.tracks)) { listed = o.tracks; if (typeof o.bpm === 'number' && o.bpm > 0) barSeconds = (60 / o.bpm) * 4; } } catch { /* ignore bad session.json */ }
        }
        const used = new Set<string>();
        for (const t of listed) {
          const e = t.file ? zip.file(new RegExp(`(^|/)${escapeRe(t.file)}$`, 'i'))[0] : undefined;
          if (!e) { skipped.push(`${t.name ?? t.file ?? 'track'} (missing in zip)`); continue; }
          used.add(e.name);
          const ext = e.name.split('.').pop()!.toLowerCase();
          const data = await e.async('arraybuffer');
          stems.push(await toStem(new Blob([data], { type: MIME[ext] ?? 'audio/wav' }), base(e.name), data.byteLength, roleFromSession(t.role, e.name), (t.startBar ?? 0) * barSeconds + (t.offsetSeconds ?? 0)));
        }
        for (const e of zip.file(AUDIO_EXT)) {
          if (used.has(e.name)) continue;
          const ext = e.name.split('.').pop()!.toLowerCase();
          const data = await e.async('arraybuffer');
          stems.push(await toStem(new Blob([data], { type: MIME[ext] ?? 'audio/wav' }), base(e.name), data.byteLength, guessRole(e.name)));
        }
      } else if (f.type.startsWith('audio/') || AUDIO_EXT.test(f.name)) {
        stems.push(await toStem(f, f.name, f.size, guessRole(f.name)));
      } else {
        skipped.push(`${f.name} (not audio)`);
      }
    } catch {
      skipped.push(`${f.name} (could not be read)`);
    }
  }
  return { stems, skipped };
}
