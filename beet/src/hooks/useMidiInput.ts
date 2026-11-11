import { useEffect, useRef, useState } from 'react';

export type MidiStatus = 'unsupported' | 'none' | 'connected';

/** Listens to hardware MIDI keyboards and pads (Web MIDI). Calls onNote for each note-on. */
export function useMidiInput(onNote: (pitch: number, velocity: number) => void): MidiStatus {
  const ref = useRef(onNote);
  ref.current = onNote;
  const [status, setStatus] = useState<MidiStatus>(() => (typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator ? 'none' : 'unsupported'));

  useEffect(() => {
    if (!('requestMIDIAccess' in navigator)) return;
    let access: MIDIAccess | null = null;
    let alive = true;
    const bind = () => {
      if (!access || !alive) return;
      let count = 0;
      access.inputs.forEach((input) => {
        count++;
        input.onmidimessage = (e) => {
          const d = e.data;
          if (d && (d[0] & 0xf0) === 0x90 && d[2] > 0) ref.current(d[1], d[2]);
        };
      });
      setStatus(count ? 'connected' : 'none');
    };
    navigator.requestMIDIAccess().then((a) => { access = a; a.onstatechange = bind; bind(); }).catch(() => { if (alive) setStatus('none'); });
    return () => { alive = false; if (access) { access.onstatechange = null; access.inputs.forEach((i) => { i.onmidimessage = null; }); } };
  }, []);

  return status;
}
