/** Shared export helpers — single home for download/share logic. */

const SAFE_AUDIO_MIME = /^(audio\/(wav|wave|x-wav|mpeg|mp3|mp4|m4a|aac|ogg|opus|flac|webm|x-m4a))$/i;

/** Guard against mislabeled blobs before export. */
export function isSafeAudioMime(type: string): boolean {
  return SAFE_AUDIO_MIME.test(type);
}

export function extensionForMime(type: string): string {
  if (/wav|wave/i.test(type)) return 'wav';
  if (/mp4|m4a|x-m4a/i.test(type)) return 'm4a';
  if (/mpeg|mp3/i.test(type)) return 'mp3';
  if (/ogg/i.test(type)) return 'ogg';
  if (/flac/i.test(type)) return 'flac';
  return 'webm';
}

/** Download a blob with an auto-expiring object URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Native share sheet when the platform supports files; download otherwise. */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<void> {
  const safeType = isSafeAudioMime(blob.type) ? blob.type : 'audio/wav';
  const file = new File([blob], filename, { type: safeType });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return;
    } catch {
      /* user cancelled or platform refused — fall through to download */
    }
  }
  downloadBlob(blob, filename);
}
