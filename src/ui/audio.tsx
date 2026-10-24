import { useEffect, useState } from 'react';

/**
 * Optional sound: a slow doo-wop loop (I–vi–IV–V in a lazy 12/8) and short
 * stingers for the big moments. Off by default; Tone.js is only loaded the
 * first time the player turns it on, so the game itself never waits for it.
 */
type ToneNS = typeof import('tone');

let T: ToneNS | null = null;
let loop: { stop: () => void } | null = null;
let master: import('tone').Volume | null = null;
const PREF = 'llv.music';

export function musicPref(): boolean {
  try {
    return localStorage.getItem(PREF) === 'on';
  } catch {
    return false;
  }
}

function savePref(on: boolean) {
  try {
    localStorage.setItem(PREF, on ? 'on' : 'off');
  } catch {
    /* private window: just don't remember */
  }
}

/** The chord loop: C, Am, F, G — one bar each, 12/8 at 66 bpm. */
export const PROGRESSION: { root: string; chord: string[] }[] = [
  { root: 'C2', chord: ['E3', 'G3', 'C4'] },
  { root: 'A1', chord: ['E3', 'A3', 'C4'] },
  { root: 'F1', chord: ['F3', 'A3', 'C4'] },
  { root: 'G1', chord: ['D3', 'G3', 'B3'] },
];

async function load(): Promise<ToneNS> {
  if (!T) T = await import('tone');
  return T;
}

export async function startMusic(): Promise<void> {
  const Tone = await load();
  await Tone.start();
  if (loop) return;
  master = new Tone.Volume(-14).toDestination();
  const verb = new Tone.Reverb({ decay: 3.2, wet: 0.35 }).connect(master);
  const pad = new Tone.PolySynth(Tone.AMSynth, { harmonicity: 1.01, envelope: { attack: 0.4, decay: 0.3, sustain: 0.6, release: 1.4 } }).connect(verb);
  pad.volume.value = -12;
  const keys = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.4, sustain: 0.1, release: 0.6 } }).connect(verb);
  keys.volume.value = -16;
  const bass = new Tone.MonoSynth({ oscillator: { type: 'sine' }, filter: { Q: 1, type: 'lowpass', rolloff: -24 }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 0.4 } }).connect(master);
  bass.volume.value = -8;
  const brush = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.01, decay: 0.18, sustain: 0 } }).connect(master);
  brush.volume.value = -28;
  Tone.getTransport().bpm.value = 66;
  Tone.getTransport().timeSignature = [12, 8];

  let bar = 0;
  const id = Tone.getTransport().scheduleRepeat((time) => {
    const p = PROGRESSION[bar % PROGRESSION.length];
    const eighth = Tone.Time('8n').toSeconds();
    pad.triggerAttackRelease(p.chord, '1m', time, 0.5);
    // Triplet piano: the chord tones up and down, every eighth of the bar.
    const arp = [...p.chord, p.chord[1], ...p.chord, p.chord[2], ...p.chord, p.chord[1]].slice(0, 12);
    arp.forEach((n, i) => keys.triggerAttackRelease(Tone.Frequency(n).transpose(12).toNote(), '16n', time + i * eighth, i % 3 === 0 ? 0.5 : 0.3));
    // Bass: root on 1, fifth on 3, walking up into the next chord.
    const root = Tone.Frequency(p.root);
    bass.triggerAttackRelease(root.toNote(), '4n.', time);
    bass.triggerAttackRelease(root.transpose(7).toNote(), '4n.', time + 6 * eighth);
    bass.triggerAttackRelease(root.transpose(9).toNote(), '8n', time + 9 * eighth);
    bass.triggerAttackRelease(root.transpose(11).toNote(), '8n', time + 10 * eighth);
    // Brushes on the backbeat.
    brush.triggerAttackRelease('8n', time + 3 * eighth);
    brush.triggerAttackRelease('8n', time + 9 * eighth);
    bar++;
  }, '1m');
  Tone.getTransport().start('+0.1');
  loop = {
    stop: () => {
      Tone.getTransport().clear(id);
      Tone.getTransport().stop();
      [pad, keys, bass, brush, verb].forEach((n) => n.dispose());
      master?.dispose();
      master = null;
    },
  };
}

export function stopMusic(): void {
  loop?.stop();
  loop = null;
}

export function musicPlaying(): boolean {
  return !!loop;
}

/** Stinger notes for each cutscene (chord, then how it lands). */
export const STINGERS: Record<string, { notes: string[]; dur: string; type: 'sine' | 'triangle' | 'sawtooth' | 'square' }> = {
  hit_success: { notes: ['C2', 'F#2', 'C3'], dur: '2n', type: 'sawtooth' },
  hit_botched: { notes: ['B1', 'C2', 'F2'], dur: '4n', type: 'square' },
  hit_witness: { notes: ['E4', 'F4', 'A#4'], dur: '2n', type: 'triangle' },
  funeral: { notes: ['A2', 'C3', 'E3', 'A3'], dur: '1m', type: 'sine' },
  wedding: { notes: ['C4', 'E4', 'G4', 'C5'], dur: '2n', type: 'triangle' },
  sitdown: { notes: ['D3', 'G#3'], dur: '1m', type: 'sine' },
  succession: { notes: ['F2', 'C3', 'F3', 'A3'], dur: '1m', type: 'triangle' },
  boss_death: { notes: ['D2', 'F2', 'A2', 'D3'], dur: '1m', type: 'sine' },
  heir_rises: { notes: ['G2', 'D3', 'G3', 'B3'], dur: '1m', type: 'triangle' },
  arrest_interrogation: { notes: ['C3', 'C#3'], dur: '2n', type: 'square' },
  betrayal_confrontation: { notes: ['E2', 'A#2', 'E3'], dur: '2n', type: 'sawtooth' },
  made_man: { notes: ['C5', 'G4', 'E5'], dur: '2n', type: 'sine' },
};

/** A short stinger for a cutscene (only while sound is on). */
export async function stinger(key: string): Promise<void> {
  if (!loop || !T || !master) return;
  const st = STINGERS[key];
  if (!st) return;
  const Tone = T;
  const syn = new Tone.PolySynth(Tone.Synth, { oscillator: { type: st.type }, envelope: { attack: 0.01, decay: 0.6, sustain: 0.3, release: 1.6 } }).connect(master);
  syn.volume.value = -6;
  const now = Tone.now();
  st.notes.forEach((n, i) => syn.triggerAttackRelease(n, st.dur, now + (key === 'wedding' || key === 'made_man' ? i * 0.12 : 0), 0.7));
  setTimeout(() => syn.dispose(), 6000);
}

/** The ♪ button in the header. */
export function MusicToggle() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => stopMusic(), []);
  const toggle = async () => {
    if (busy) return;
    if (on) {
      stopMusic();
      setOn(false);
      savePref(false);
      return;
    }
    setBusy(true);
    try {
      await startMusic();
      setOn(true);
      savePref(true);
    } catch {
      setOn(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={toggle}
      aria-pressed={on}
      title={on ? 'Music on — click to mute' : musicPref() ? 'Music was on last time — click to play' : 'Music off — click for doo-wop'}
      data-testid="music"
      className={`h-8 px-2 rounded border text-sm ${on ? 'bg-gold-500 text-noir-950 border-gold-400' : 'bg-noir-800 text-stone-400 border-noir-600 hover:border-gold-500'}`}
    >
      {busy ? '…' : on ? '♪ On' : '♪ Off'}
    </button>
  );
}
