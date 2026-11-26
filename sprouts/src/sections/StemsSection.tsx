import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AudioWaveform, Download, Loader2, Play, Share2, Square, Trash2, Upload, X } from 'lucide-react';
import { decodeBlob, mixStems, type StemInput } from '@/lib/audio/render';
import { downloadBlob, shareOrDownload } from '@/lib/audio/export';
import { audioBufferToWav, formatBytes } from '@/lib/audio/wav';
import { useSession } from '@/lib/session';
import { getTemplate, guessRole } from '@/lib/templates';
import { LevelsPanel } from '@/components/LevelsPanel';

interface StemRow {
  id: string;
  file: File;
  buffer: AudioBuffer;
  role: StemInput['role'];
}

const MAX_FILE_BYTES = 60 * 1024 * 1024;   // 60 MB per stem
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200 MB per session

const ROLES: { id: StemInput['role']; label: string }[] = [
  { id: 'voice', label: 'Vocal' },
  { id: 'beat', label: 'Beat' },
  { id: 'bass', label: 'Bass' },
];

export function StemsSection() {
  const { templateId, levels, playingKey, playBlob, stopPlayback } = useSession();
  const template = getTemplate(templateId);
  const [stems, setStems] = useState<StemRow[]>([]);
  const stemsRef = useRef<StemRow[]>([]);
  const [mixing, setMixing] = useState(false);
  const [master, setMaster] = useState<Blob | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const audioFiles = Array.from(files).filter((f) => f.type.startsWith('audio/') || /\.(wav|mp3|m4a|aac|ogg|opus|flac|webm)$/i.test(f.name));
    if (audioFiles.length === 0) {
      toast.error('No audio files in that drop — WAV, MP3, M4A all work.');
      return;
    }
    // Resource guard: reject oversized drops before decoding anything.
    const tooBig = audioFiles.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      toast.error(`"${tooBig.name}" is over 60 MB — bounce it shorter or lighter first.`);
      return;
    }
    const stagedBytes = stemsRef.current.reduce((n, s) => n + s.file.size, 0);
    const incoming = audioFiles.reduce((n, f) => n + f.size, 0);
    if (stagedBytes + incoming > MAX_TOTAL_BYTES) {
      toast.error('That would pass 200 MB staged — mix or clear what\'s here first.');
      return;
    }
    let added = 0;
    for (const file of audioFiles.slice(0, 8)) {
      try {
        const buffer = await decodeBlob(file);
        if (buffer.duration > 600) {
          toast.error(`"${file.name}" is over 10 minutes — too long for a stem.`);
          continue;
        }
        setStems((prev) => {
          const next = [...prev, { id: crypto.randomUUID(), file, buffer, role: guessRole(file.name) }];
          stemsRef.current = next;
          return next;
        });
        added++;
      } catch {
        toast.error(`"${file.name}" could not be decoded.`);
      }
    }
    if (added > 0) {
      setMaster(null);
      toast.success(`${added} stem${added > 1 ? 's' : ''} staged.`);
    }
  }, []);

  const handleMix = useCallback(async () => {
    if (stems.length === 0) return;
    setMixing(true);
    setMaster(null);
    try {
      const rendered = await mixStems(
        stems.map((s) => ({ name: s.file.name, buffer: s.buffer, role: s.role })),
        template,
        levels,
      );
      setMaster(audioBufferToWav(rendered));
      toast.success('Mixdown complete. Press play.');
    } catch {
      toast.error('Mixdown failed — try fewer or shorter stems.');
    } finally {
      setMixing(false);
    }
  }, [stems, template, levels]);

  // Changing a level invalidates the last master
  const handleLevelsChange = useCallback(() => setMaster(null), []);

  const handleShare = useCallback(async () => {
    if (!master) return;
    await shareOrDownload(master, `levels-${template.id}-master.wav`, 'Levels master');
  }, [master, template]);

  const isPlaying = playingKey === 'stems-master';
  const hasVocal = stems.some((s) => s.role === 'voice');
  const hasMusic = stems.some((s) => s.role === 'beat' || s.role === 'bass');
  const sidechainLive = hasVocal && hasMusic;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Stem mixdown</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Drop your exported stems — vocals, beat, bass. Levels levels, EQs and glues them through the{' '}
          <span className="text-foreground">{template.name}</span> template, then masters to a streaming-ready WAV.
          Export stems from other production apps, mix in Sprouts.
        </p>
      </div>

      <LevelsPanel onChange={handleLevelsChange} />

      {/* Drop zone */}
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={`flex min-h-32 flex-col items-center justify-center gap-3 border border-dashed px-6 py-10 text-center transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/40'
        }`}
      >
        <Upload className={`h-5 w-5 ${dragOver ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className="text-sm text-muted-foreground">
          Tap to choose files <span className="hidden sm:inline">or drag them in</span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">
          WAV · MP3 · M4A · OGG · FLAC — up to 8 stems
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.opus,.flac,.webm"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Stem list */}
      {stems.length > 0 && (
        <div className="border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              {stems.length} stem{stems.length > 1 ? 's' : ''} staged
            </span>
            <button
              onClick={() => { setStems([]); stemsRef.current = []; setMaster(null); stopPlayback(); }}
              className="flex min-h-11 items-center gap-1.5 px-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
          {sidechainLive && (
            <p className="border-b border-border px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.15em] text-primary/80">
              Sidechain live — beat ducks under your vocal. Punch fader steers the depth.
            </p>
          )}
          <ul className="divide-y divide-border">
            {stems.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <AudioWaveform className="h-4 w-4 shrink-0 text-primary/70" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{s.file.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {formatBytes(s.file.size)} · {s.buffer.duration.toFixed(1)}s
                  </p>
                </div>
                <div className="flex border border-border">
                  {ROLES.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        setStems((prev) => {
                          const next = prev.map((p) => (p.id === s.id ? { ...p, role: r.id } : p));
                          stemsRef.current = next;
                          return next;
                        });
                        setMaster(null);
                      }}
                      className={`min-h-11 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-primary ${
                        s.role === r.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setStems((prev) => {
                      const next = prev.filter((p) => p.id !== s.id);
                      stemsRef.current = next;
                      return next;
                    });
                    setMaster(null);
                  }}
                  aria-label={`Remove ${s.file.name}`}
                  className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mix button */}
      {stems.length > 0 && !master && (
        <button
          onClick={handleMix}
          disabled={mixing}
          className="flex min-h-14 w-full items-center justify-center gap-3 bg-foreground font-mono text-sm uppercase tracking-[0.2em] text-background transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:opacity-80 disabled:opacity-50"
        >
          {mixing ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {mixing ? 'Mixing…' : `Mix ${stems.length} stem${stems.length > 1 ? 's' : ''}`}
        </button>
      )}

      {/* Master out */}
      {master && (
        <div className="border border-primary/50 bg-primary/5">
          <div className="border-b border-primary/30 px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-primary">Master out</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-4">
            <button
              onClick={() => (isPlaying ? stopPlayback() : void playBlob('stems-master', master))}
              aria-label={isPlaying ? 'Stop master' : 'Play master'}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95"
            >
              {isPlaying ? <Square className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{template.name} master</p>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                Leveled · {sidechainLive ? 'sidechained · ' : ''}glued · limited to {template.master.ceilingDb} dB
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-primary/30 border-t border-primary/30">
            <button
              onClick={handleShare}
              className="flex min-h-11 items-center justify-center gap-2 px-4 py-3 font-mono text-xs uppercase tracking-[0.12em] text-foreground transition-colors duration-150 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>
            <button
              onClick={() => {
                downloadBlob(master, `levels-${template.id}-master.wav`);
              }}
              className="flex min-h-11 items-center justify-center gap-2 px-4 py-3 font-mono text-xs uppercase tracking-[0.12em] text-foreground transition-colors duration-150 hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Download className="h-4 w-4" />
              WAV
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {stems.length === 0 && (
        <div className="flex flex-col items-center gap-3 border border-dashed border-border px-6 py-10 text-center">
          <AudioWaveform className="h-5 w-5 text-muted-foreground" />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Roles are auto-detected from filenames — vocal, beat, bass. Tap any role chip to correct it before mixing.
          </p>
        </div>
      )}
    </div>
  );
}
