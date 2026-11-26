import JSZip from 'jszip';
import type { CatalogBeat } from '../catalog';

export interface BeatLicense {
  id: string;
  beatId: string;
  beatTitle: string;
  producer: string;
  licensee: string;
  licensedAt: string;
  version: string;
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'beat';

function extension(beat: CatalogBeat, blob: Blob): string {
  const path = beat.audioUrl?.split('?')[0] ?? '';
  const fromUrl = path.match(/\.(wav|mp3|m4a|mp4|ogg|flac)$/i)?.[1]?.toLowerCase();
  if (fromUrl) return fromUrl;
  if (blob.type.includes('wav')) return 'wav';
  if (blob.type.includes('mpeg')) return 'mp3';
  if (blob.type.includes('ogg')) return 'ogg';
  if (blob.type.includes('flac')) return 'flac';
  return 'm4a';
}

function licenseText(license: BeatLicense): string {
  return `GROCERY NON-EXCLUSIVE BEAT LICENSE

License: ${license.id}
Beat: ${license.beatTitle}
Licensed to: ${license.licensee}
Granted: ${license.licensedAt}
Terms version: ${license.version}

The producer keeps ownership of the original beat. The licensee keeps ownership of their newly recorded lyrics and vocal performance.

This non-exclusive, worldwide, perpetual license permits the licensee to record and commercially release ONE new song using this beat. The new song may be distributed on streaming services, sold as a download, performed publicly, and used in ordinary song-promotion videos.

The licensee must credit the producer as “Beat by ${license.producer}” wherever credits are reasonably displayed.

The licensee may not sell, sublicense, share, upload, or distribute the beat by itself; claim exclusive ownership of the beat; register the beat alone with rights-fingerprinting systems; or use this license for a second, different song. Rights-fingerprinting of the new song must not prevent other valid licensees from using the beat.

This license applies only after verified payment. Stripe’s receipt is proof of purchase. No exclusive rights or underlying songwriting share in the beat are transferred.
`;
}

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** The buyer gets the actual recording plus its database-backed license. */
export async function downloadBeatRelease(beat: CatalogBeat, license: BeatLicense): Promise<void> {
  if (!beat.audioUrl) throw new Error('The original beat file is not available.');
  const response = await fetch(beat.audioUrl);
  if (!response.ok) throw new Error('The original beat file could not be downloaded.');
  const audio = await response.blob();
  const zip = new JSZip();
  const base = slug(beat.title);
  zip.file(`${base}.${extension(beat, audio)}`, audio);
  zip.file('LICENSE.txt', licenseText(license));
  zip.file('purchase.json', JSON.stringify(license, null, 2));
  zip.file('READ-ME.txt', `Beat: ${beat.title}\nProducer: ${beat.producer}\n\nKeep LICENSE.txt with your records. Record your vocals in Sprouts.\n`);
  save(await zip.generateAsync({ type: 'blob' }), `${base}-licensed-beat.zip`);
}
