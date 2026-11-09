import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bluetooth, Gamepad2, Loader2 } from 'lucide-react';
import { smk, type MidiStatus } from '@/lib/audio/midi';

// Both pad banks at a glance — Bank A: transport + L1–L4 · Bank B: L5–L8 + FX
const PAD_LABELS = ['Play', 'Stop', 'Rec', 'Role', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'FX1', 'FX2', 'FX3', 'FX4'];

/**
 * SMK-25 controller panel — Bluetooth MIDI connect + a virtual pad strip.
 * With hardware connected the pads light from real events; without it, the
 * on-screen pads emit the same actions so the template is always usable.
 * Knob Bank A 1–4 drive the Levels (the SMK-25 has no faders — knobs are
 * the faders), A 5–8 pan layers. Transport works once the buttons are set
 * to CC mode in CubeSuite (REC→101, PLAY→102, STOP→103).
 */
export function ControllerPanel({ onPad }: { onPad: (pad: number) => void }) {
  const [status, setStatus] = useState<MidiStatus>(smk.status);
  const [device, setDevice] = useState<string | null>(smk.deviceName);
  const [connecting, setConnecting] = useState(false);
  const [activePad, setActivePad] = useState<number | null>(null);

  useEffect(() => smk.onStatus((s, name) => {
    setStatus(s);
    setDevice(name);
    if (s === 'denied') toast.error('MIDI access denied — allow it in browser settings.');
    if (s === 'unsupported') toast.error('No MIDI in this browser — iPhone browsers can\'t do MIDI; Chrome on Android, Mac or PC can.');
  }), []);

  useEffect(() => smk.onAction((a) => {
    if (a.type === 'pad-layer') flash(a.pad);
    else if (a.type === 'record-toggle') flash(2);
    else if (a.type === 'play-mix') flash(0);
    else if (a.type === 'stop') flash(1);
    else if (a.type === 'role-next') flash(3);
  }), []);

  const flash = (pad: number) => {
    setActivePad(pad);
    window.setTimeout(() => setActivePad((p) => (p === pad ? null : p)), 160);
  };

  const connect = async () => {
    setConnecting(true);
    const ok = await smk.connect();
    setConnecting(false);
    if (ok) toast.success(`Controller live: ${smk.deviceName}`);
    else if (smk.status !== 'unsupported' && smk.status !== 'denied') {
      toast.error('No controller found — power on the SMK and pair it in Bluetooth first.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Controller</p>
        {status === 'connected' ? (
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
            <Bluetooth className="h-3.5 w-3.5" />
            {device}
          </span>
        ) : (
          <button
            onClick={connect}
            disabled={connecting || status === 'unsupported'}
            className="flex min-h-11 items-center gap-2 border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
          >
            {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bluetooth className="h-3.5 w-3.5" />}
            Pair SMK
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-8 gap-1.5">
        {PAD_LABELS.map((label, i) => (
          <button
            key={label}
            onPointerDown={() => {
              flash(i);
              onPad(i);
            }}
            aria-label={`Pad ${label}`}
            className={`flex aspect-square items-center justify-center border font-mono text-[9px] uppercase tracking-wide transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-primary ${
              activePad === i
                ? 'border-primary bg-primary/30 text-primary'
                : 'border-border text-muted-foreground/70 hover:border-foreground/40 hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {status !== 'connected' && (
        <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/70">
          <Gamepad2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          M-VAVE SMK-25 template loaded. Knobs 1–4 are your Levels, 5–8 pan layers; both pad banks shown. Pair over Bluetooth MIDI, or tap the pads — same actions either way.
        </p>
      )}
    </div>
  );
}
