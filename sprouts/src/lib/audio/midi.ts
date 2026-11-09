/**
 * Sprouts controller layer — M-VAVE SMK-25 as the hardware template.
 * WebMIDI over Bluetooth (the SMK-25 advertises as a BLE MIDI device) with a
 * graceful fallback when WebMIDI or the device is unavailable.
 *
 * SMK-25 reality (this unit has NO faders — 8 knobs + 8 pads, each with an
 * A/B bank, a transport row, and the Scale-Chord key section):
 *
 *   Pads   notes 36–43 (Bank A) · 44–51 (Bank B) — factory defaults
 *          A: Play Stop Rec Role L1–L4 · B: L5–L8 FX1–4
 *          (the on-screen strip shows both banks at once)
 *   Knobs  CC 20–27 (Bank A) — factory default
 *          1–4 = Warmth/Brightness/Punch/Space — the Levels ARE the faders
 *          5–8 = pan layers 1–4
 *   Knobs  CC 28–35 (Bank B) — assign in the CubeSuite editor
 *          1–4 = group volumes: lead / doubles / backups / ad-libs
 *          5–8 = pan layers 5–8
 *   Touch strips — pitch bend + CC 1 (mod) — reserved for live FX depth
 *
 *   TRANSPORT — read this: out of the box the SMK-25 transport row sends
 *   MMC SysEx, which browsers refuse to deliver (sysex is blocked). So the
 *   supported path is: in CubeSuite set the buttons to CC mode
 *   (REC→CC101, PLAY→CC102, STOP→CC103) or Note mode (E3/F3/F#3/G3 = notes
 *   52–55), then save it as a "SPROUTS" preset. We also listen for the
 *   single-byte system real-time messages 0xFA/0xFB (play) and 0xFC (stop)
 *   — some firmware modes emit those for free, no setup needed.
 */

export type SproutsAction =
  | { type: 'record-toggle' }
  | { type: 'stop' }
  | { type: 'play-mix' }
  | { type: 'pad-layer'; pad: number }        // pads 0-15 → layer ops (both banks)
  | { type: 'fader'; index: number; value: number }  // 0-3 → warmth/brightness/punch/space, 0..1
  | { type: 'knob'; index: number; value: number }   // 0-7 → layer pan, 0..1
  | { type: 'volume'; group: number; value: number } // 0-3 → lead/doubles/backups/ad-libs, 0..1
  | { type: 'role-next' }                     // cycle ad-lib/backup
  | { type: 'mod'; value: number }            // mod strip → live FX depth
  | { type: 'pitch'; value: number };         // -1..1

export type MidiStatus = 'unsupported' | 'idle' | 'scanning' | 'connected' | 'denied';

type Listener = (a: SproutsAction) => void;

const PAD_NOTE_BASE = 36;        // C2 — Bank A 36–43, Bank B 44–51 (factory)
const PAD_COUNT = 16;            // window covers both banks
const KNOB_CC_BASE = 20;         // Bank A: CC 20–27
const KNOB_BANK_B_CC_BASE = 28;  // Bank B: CC 28–35 (assign in CubeSuite)
const MOD_CC = 1;

// Transport — CC mode (set in CubeSuite; >100 to dodge knob/pad collisions)
const CC_RECORD = 101;
const CC_PLAY = 102;
const CC_STOP = 103;

// Transport — Note mode (alternative CubeSuite setting)
const NOTE_TRANSPORT_PLAY = 52;  // E3
const NOTE_TRANSPORT_STOP = 53;
const NOTE_RECORD = 54;          // F#3 — the big one
const NOTE_ROLE_NEXT = 55;

// System real-time (single byte, never filtered by sysex:false)
const RT_CONTINUE = 0xfb;
const RT_START = 0xfa;
const RT_STOP = 0xfc;

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
    if (!data || data.length === 0) return;

    // Single-byte system real-time first (MMC start/stop ride these on some
    // firmware — they pass the sysex filter, so transport can work stock).
    if (data[0] === RT_START || data[0] === RT_CONTINUE) {
      this.emit({ type: 'play-mix' });
      return;
    }
    if (data[0] === RT_STOP) {
      this.emit({ type: 'stop' });
      return;
    }
    if (data.length < 2) return;

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
      if (d1 === CC_RECORD) {
        this.emit({ type: 'record-toggle' });
      } else if (d1 === CC_PLAY) {
        this.emit({ type: 'play-mix' });
      } else if (d1 === CC_STOP) {
        this.emit({ type: 'stop' });
      } else if (d1 >= KNOB_CC_BASE && d1 < KNOB_CC_BASE + 8) {
        // Bank A — knobs 1–4 are the Levels (this unit has no faders);
        // knobs 5–8 pan layers 1–4.
        const i = d1 - KNOB_CC_BASE;
        if (i < 4) this.emit({ type: 'fader', index: i, value: d2 / 127 });
        else this.emit({ type: 'knob', index: i - 4, value: d2 / 127 });
      } else if (d1 >= KNOB_BANK_B_CC_BASE && d1 < KNOB_BANK_B_CC_BASE + 8) {
        // Bank B — knobs 1–4 ride role volumes; knobs 5–8 pan layers 5–8.
        const i = d1 - KNOB_BANK_B_CC_BASE;
        if (i < 4) this.emit({ type: 'volume', group: i, value: d2 / 127 });
        else this.emit({ type: 'knob', index: i, value: d2 / 127 });
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
