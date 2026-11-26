import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { AudioLines, Download, Loader2, Play, Share2, Square, Trash2 } from 'lucide-react';
import { downloadBlob, extensionForMime, shareOrDownload } from '@/lib/audio/export';
import { audioBufferToWav, formatDuration } from '@/lib/audio/wav';
import { decodeBlob, mixLayers, mixStems } from '@/lib/audio/render';
import { useSession } from '@/lib/session';
import { getTemplate, NEUTRAL_LEVELS } from '@/lib/templates';
import type { StoredStack, StoredTake } from '@/lib/audio/db';

export function TakesSection() {
  const { takes, removeTake, stacks, removeStack, playingKey, playBlob, stopPlayback } = useSession();
  const [renderingStackId, setRenderingStackId] = useState<string | null>(null);

  /** Render a stored stack through its template's chain — full song when a beat
   *  was saved with it, vocal stack otherwise. Returns null on failure. */
  const renderStack = useCallback(async (stack: StoredStack): Promise<Blob | null> => {
    try {
      const active = stack.layers.filter((l) => !l.muted);
      if (active.length === 0) return null;
      const tpl = getTemplate(stack.templateId);
      const vocalStack = await mixLayers(
        await Promise.all(active.map(async (l) => ({
          buffer: await decodeBlob(l.blob),
          role: l.role,
          pan: l.pan,
          gain: l.gain,
        }))),
        tpl,
        NEUTRAL_LEVELS,
      );
      if (stack.beatBlob) {
        const beat = await decodeBlob(stack.beatBlob);
        const rendered = await mixStems(
          [
            { name: 'beat', buffer: beat, role: 'beat' },
            { name: 'vocals', buffer: vocalStack, role: 'voice' },
          ],
          tpl,
          NEUTRAL_LEVELS,
        );
        return audioBufferToWav(rendered);
      }
      return audioBufferToWav(vocalStack);
    } catch (err) {
      console.error('[levels] vault stack render failed', err);
      return null;
    }
  }, []);

  const playStack = useCallback(async (stack: StoredStack) => {
    const key = `stack-${stack.id}`;
    if (playingKey === key) {
      stopPlayback();
      return;
    }
    setRenderingStackId(stack.id);
    const blob = await renderStack(stack);
    setRenderingStackId(null);
    if (blob) {
      await playBlob(key, blob);
    } else {
      toast.error('Could not render this stack on this device.');
    }
  }, [playingKey, playBlob, stopPlayback, renderStack]);

  const exportStack = useCallback(async (stack: StoredStack, share: boolean) => {
    setRenderingStackId(stack.id);
    const blob = await renderStack(stack);
    setRenderingStackId(null);
    if (!blob) {
      toast.error('Could not render this stack on this device.');
      return;
    }
    const name = `levels-${getTemplate(stack.templateId).id}-stack.wav`;
    if (share) await shareOrDownload(blob, name, stack.name);
    else downloadBlob(blob, name);
  }, [renderStack]);

  const handleShare = useCallback(async (take: StoredTake) => {
    const blob = take.mixBlob ?? take.blob;
    // getTemplate already falls back safely on unknown/tampered stored IDs
    const tpl = getTemplate(take.mixBlob ? take.mixTemplateId ?? take.templateId : take.templateId);
    await shareOrDownload(blob, `levels-${tpl.id}${take.mixBlob ? '-mixed' : '-dry'}.wav`, take.name);
  }, []);

  const handleDownload = useCallback((take: StoredTake) => {
    const blob = take.mixBlob ?? take.blob;
    const tpl = getTemplate(take.templateId);
    downloadBlob(blob, `levels-${tpl.id}${take.mixBlob ? '-mixed' : '-dry'}.${extensionForMime(blob.type)}`);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Kept on this device</p>
        <p className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground/60">{takes.length + stacks.length} items</p>
      </div>

      {stacks.length > 0 && (
        <ul className="divide-y divide-border border border-border">
          {stacks.map((stack) => {
            const key = `stack-${stack.id}`;
            const isPlaying = playingKey === key;
            const isRendering = renderingStackId === stack.id;
            return (
              <li key={stack.id} className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={() => void playStack(stack)}
                  disabled={isRendering}
                  aria-label={isPlaying ? `Stop ${stack.name}` : `Play ${stack.name}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/50 text-primary transition-colors duration-150 hover:border-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                >
                  {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : isPlaying ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{stack.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {stack.layers.length} layers · {formatDuration(Math.max(...stack.layers.map((l) => l.duration), 0))} · {stack.beatBlob ? 'song' : 'stack'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <button
                    onClick={() => void exportStack(stack, true)}
                    disabled={isRendering}
                    aria-label={`Share ${stack.name}`}
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => void exportStack(stack, false)}
                    disabled={isRendering}
                    aria-label={`Download ${stack.name}`}
                    className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (isPlaying) stopPlayback();
                      void removeStack(stack.id).then(() => toast.success('Stack deleted.'));
                    }}
                    aria-label={`Delete ${stack.name}`}
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

      {takes.length === 0 && stacks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border border-dashed border-border px-6 py-12 text-center">
          <AudioLines className="h-5 w-5 text-muted-foreground" />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Nothing kept yet. Record in the Booth, hit Keep, and your takes and stacks live here — on your device, not our servers.
          </p>
        </div>
      ) : takes.length > 0 ? (
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
      ) : null}

      <p className="text-xs leading-relaxed text-muted-foreground/70">
        Takes and stacks are stored only in this browser's on-device storage. Clearing site data removes them — download anything you love.
      </p>
    </div>
  );
}
