import { useEffect, useRef, useState } from 'react';

/**
 * SMK-25 knob + transport layer for the whole Grocery ecosystem (works with
 * any MIDI controller that sends the same messages). Matches the Sprouts map:
 *
 *   Bank A knobs  CC 20–27 → knob index 0–7, value 0..1
 *   Bank B knobs  CC 28–35 → knob index 8–15, value 0..1
 *   Transport     CC 101 record-toggle · CC 102 play · CC 103 stop
 *                 (or notes 52 play · 53 stop · 54 record)
 *   MMC real-time 0xFA/0xFB play · 0xFC stop — work stock, no CubeSuite setup
 *
 * Note-on/off for playing instruments is handled separately (useMidiInput /
 * per-app note paths); this hook is for hands-on knobs and transport only.
 */
export type SmkAction =
  | { type: 'knob'; index: number; value: number } // 0-7 = bank A (CC 20-27), 8-15 = bank B (CC 28-35)
  | { type: 'play' }
  | { type: 'stop' }
  | { type: 'record-toggle' };

export type SmkStatus = 'unsupported' | 'none' | 'connected';

export function useSmk(onAction: (a: SmkAction) => void): SmkStatus {
  const ref = useRef(onAction);
  ref.current = onAction;
  const [status, setStatus] = useState<SmkStatus>(() =>
    typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator ? 'none' : 'unsupported');

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) return;
    let access: MIDIAccess | null = null;
    let alive = true;

    const handle = (e: MIDIMessageEvent) => {
      const d = e.data;
      if (!d || !d.length) return;
      // Single-byte system real-time rides through the sysex filter untouched.
      if (d[0] === 0xfa || d[0] === 0xfb) { ref.current({ type: 'play' }); return; }
      if (d[0] === 0xfc) { ref.current({ type: 'stop' }); return; }
      if (d.length < 3) return;
      const status = d[0] & 0xf0;
      if (status === 0xb0) {
        const cc = d[1];
        const v = d[2] / 127;
        if (cc === 101) ref.current({ type: 'record-toggle' });
        else if (cc === 102) ref.current({ type: 'play' });
        else if (cc === 103) ref.current({ type: 'stop' });
        else if (cc >= 20 && cc < 36) ref.current({ type: 'knob', index: cc - 20, value: v });
      } else if (status === 0x90 && d[2] > 0) {
        if (d[1] === 52) ref.current({ type: 'play' });
        else if (d[1] === 53) ref.current({ type: 'stop' });
        else if (d[1] === 54) ref.current({ type: 'record-toggle' });
      }
    };

    // Chain instead of overwrite — apps also bind these inputs for note-on
    // (free play, useMidiInput), and every handler must keep firing.
    const wrapped = new WeakSet<MIDIInput>();
    const bind = () => {
      if (!access || !alive) return;
      let count = 0;
      access.inputs.forEach((input) => {
        count++;
        if (wrapped.has(input)) return;
        const prev = input.onmidimessage;
        input.onmidimessage = (e) => { handle(e); prev?.call(input, e); };
        wrapped.add(input);
      });
      setStatus(count ? 'connected' : 'none');
    };

    navigator.requestMIDIAccess().then((a) => { access = a; a.onstatechange = bind; bind(); }).catch(() => { if (alive) setStatus('none'); });
    return () => {
      alive = false;
      if (access) { access.onstatechange = null; access.inputs.forEach((i) => { i.onmidimessage = null; }); }
    };
  }, []);

  return status;
}
