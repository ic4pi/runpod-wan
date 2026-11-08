import { useCallback } from 'react';
import { toast } from 'sonner';
import { AudioLines, Download, Play, Share2, Square, Trash2 } from 'lucide-react';
import { formatDuration } from '@/lib/audio/wav';
import { useSession } from '@/lib/session';
import { getTemplate } from '@/lib/templates';
import type { StoredTake } from '@/lib/audio/db';

export function TakesSection() {
  const { takes, removeTake, playingKey, playBlob, stopPlayback } = useSession();

  const handleShare = useCallback(async (take: StoredTake) => {
    const blob = take.mixBlob ?? take.blob;
    const tpl = getTemplate(take.mixBlob ? take.mixTemplateId ?? take.templateId : take.templateId);
    const file = new File([blob], `levels-${tpl.id}${take.mixBlob ? '-mixed' : '-dry'}.wav`, { type: blob.type || 'audio/wav' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title: take.name }); return; } catch { /* cancelled */ }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, []);

  const handleDownload = useCallback((take: StoredTake) => {
    const blob = take.mixBlob ?? take.blob;
    const tpl = getTemplate(take.templateId);
    const ext = blob.type.includes('wav') ? 'wav' : blob.type.includes('mp4') ? 'm4a' : 'webm';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `levels-${tpl.id}${take.mixBlob ? '-mixed' : '-dry'}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Kept takes</p>
        <p className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground/60">{takes.length} on this device</p>
      </div>

      {takes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border border-dashed border-border px-6 py-12 text-center">
          <AudioLines className="h-5 w-5 text-muted-foreground" />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Nothing kept yet. Record in the Booth, hit Keep, and your takes live here — on your device, not our servers.          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {takes.map((take) => {
            const tpl = getTemplate(take.mixTemplateId ?? take.templateId);
            const key = `take-${take.id}`;
            const isPlaying = playingKey === key;
            const playable = take.mixBlob ?? take.blob;
            return (
              <li key={take.id} className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => (isPlaying ? stopPlayback() : void playBlob(key, playable))}
                  aria-label={isPlaying ? `Stop ${take.name}` : `Play ${take.name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-foreground/25 text-foreground transition-colors duration-150 hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {isPlaying ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{take.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {tpl.name} · {formatDuration(take.duration)} · {take.mixBlob ? 'mixed' : 'dry'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <button
                    onClick={() => void handleShare(take)}
                    aria-label={`Share ${take.name}`}
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDownload(take)}
                    aria-label={`Download ${take.name}`}
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (isPlaying) stopPlayback();
                      void removeTake(take.id).then(() => toast.success('Take deleted.'));
                    }}
                    aria-label={`Delete ${take.name}`}
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground/70">
        Takes are stored only in this browser's on-device storage. Clearing site data removes them — download anything you love.
      </p>
    </div>
  );
}
