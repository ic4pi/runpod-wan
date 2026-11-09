/**
 * Sprouts controller layer — M-VAVE SMK as the hardware template.
 * WebMIDI over Bluetooth (SMK-25/37 advertise as BLE MIDI devices) with a
 * graceful fallback when WebMIDI or the device is unavailable.
 *
 * SMK control template (factory defaults, channel 1):
 *   Pads  36–51 (C2–D#3)  — 16 velocity pads
 *   Knobs CC 20–27        — 8 endless encoders (absolute 0–127)
 *   Faders CC 28–31       — 4 channel faders
 *   Touch pitch strip     — pitch bend
 *   Touch mod strip       — CC 1
 *   Transport keys        — note 52+ region (C3 up)
 */

export type SproutsAction =
  | { type: 'record-toggle' }
  | { type: 'stop' }
  | { type: 'play-mix' }
  | { type: 'pad-layer'; pad: number }       // pads 0-15 → layer ops
  | { type: 'fader'; index: number; value: number } // 0-3 → warmth/brightness/punch/space, 0..1
  | { type: 'knob'; index: number; value: number }  // 0-7 → layer pan/gain, 0..1
  | { type: 'role-next' }                    // cycle ad-lib/backup
  | { type: 'mod'; value: number }           // mod strip → live FX depth
  | { type: 'pitch'; value: number };        // -1..1

export type MidiStatus = 'unsupported' | 'idle' | 'scanning' | 'connected' | 'denied';

type Listener = (a: SproutsAction) => void;

const PAD_NOTE_BASE = 36;       // C2
const PAD_COUNT = 16;
const KNOB_CC_BASE = 20;        // CC20-27
const FADER_CC_BASE = 28;       // CC28-31
const MOD_CC = 1;
const NOTE_TRANSPORT_PLAY = 52; // E3
const NOTE_TRANSPORT_STOP = 53;
const NOTE_RECORD = 54;         // F#3 — the big one
const NOTE_ROLE_NEXT = 55;

class SmkController {
  private access: MIDIAccess | null = null;
  private input: MIDIInput | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(s: MidiStatus, name: string | null) => void>();
  status: MidiStatus = 'idle';
  deviceName: string | null = null;

  get supported(): boolean {
    return typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
  }

  onAction(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (s: MidiStatus, name: string | null) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private setStatus(s: MidiStatus, name: string | null = this.deviceName): void {
    this.status = s;
    this.deviceName = name;
    this.statusListeners.forEach((fn) => fn(s, name));
  }

  private emit(a: SproutsAction): void {
    this.listeners.forEach((fn) => fn(a));
  }

  async connect(): Promise<boolean> {
    if (!this.supported) {
      this.setStatus('unsupported', null);
      return false;
    }
    this.setStatus('scanning');
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch {
      this.setStatus('denied', null);
      return false;
    }
    this.access.onstatechange = () => this.bindInputs();
    this.bindInputs();
    return this.input !== null;
  }

  private bindInputs(): void {
    if (!this.access) return;
    // Prefer an M-VAVE / SMK device; fall back to any input.
    let fallback: MIDIInput | null = null;
    for (const input of this.access.inputs.values()) {
      const name = `${input.name ?? ''} ${input.manufacturer ?? ''}`.toLowerCase();
      if (name.includes('mvave') || name.includes('m-vave') || name.includes('smk') || name.includes('midi')) {
        this.attach(input);
        return;
      }
      fallback = fallback ?? input;
    }
    if (fallback) this.attach(fallback);
    else this.setStatus('idle', null);
  }

  private attach(input: MIDIInput): void {
    if (this.input === input) return;
    if (this.input) this.input.onmidimessage = null;
    this.input = input;
    this.input.onmidimessage = (e: MIDIMessageEvent) => this.handle(e);
    this.setStatus('connected', input.name ?? 'MIDI controller');
  }

  private handle(e: MIDIMessageEvent): void {
    const data = e.data;
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const d1 = data[1];
    const d2 = data.length > 2 ? data[2] : 0;

    if (status === 0x90 && d2 > 0) {
      // note on
      if (d1 >= PAD_NOTE_BASE && d1 < PAD_NOTE_BASE + PAD_COUNT) {
        this.emit({ type: 'pad-layer', pad: d1 - PAD_NOTE_BASE });
      } else if (d1 === NOTE_RECORD) {
        this.emit({ type: 'record-toggle' });
      } else if (d1 === NOTE_TRANSPORT_PLAY) {
        this.emit({ type: 'play-mix' });
      } else if (d1 === NOTE_TRANSPORT_STOP) {
        this.emit({ type: 'stop' });
      } else if (d1 === NOTE_ROLE_NEXT) {
        this.emit({ type: 'role-next' });
      }
    } else if (status === 0xb0) {
      // control change
      if (d1 >= KNOB_CC_BASE && d1 < KNOB_CC_BASE + 8) {
        this.emit({ type: 'knob', index: d1 - KNOB_CC_BASE, value: d2 / 127 });
      } else if (d1 >= FADER_CC_BASE && d1 < FADER_CC_BASE + 4) {
        this.emit({ type: 'fader', index: d1 - FADER_CC_BASE, value: d2 / 127 });
      } else if (d1 === MOD_CC) {
        this.emit({ type: 'mod', value: d2 / 127 });
      }
    } else if (status === 0xe0) {
      // pitch bend: 14-bit, center 8192
      const v = ((d2 << 7) | d1) - 8192;
      this.emit({ type: 'pitch', value: v / 8192 });
    }
  }

  disconnect(): void {
    if (this.input) this.input.onmidimessage = null;
    this.input = null;
    this.access = null;
    this.setStatus('idle', null);
  }
}

export const smk = new SmkController();

/** Test hook — lets E2E inject fake SMK events through the real handler. */
if (typeof window !== 'undefined') {
  (window as unknown as { __smkTest?: { noteOn: (n: number) => void; cc: (cc: number, v: number) => void } }).__smkTest = {
    noteOn: (n: number) => smk['handle']({ data: [0x90, n, 100] } as unknown as MIDIMessageEvent),
    cc: (cc: number, v: number) => smk['handle']({ data: [0xb0, cc, v] } as unknown as MIDIMessageEvent),
  };
}
