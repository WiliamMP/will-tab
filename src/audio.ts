// Guitar sound with no samples: Karplus-Strong plucked strings (a burst of
// noise circling a delay line one period long, softened a little each pass),
// a gentle low-pass for a warmer body and a short room reverb. One note rings
// per string; a new one on the same string damps the old, as a real string does.

import { cellsPerBar, cellsPerBeat, freq, secondsPerCell, type Song } from "./tab";

let ctx: AudioContext | null = null;
let out: GainNode;
const buffers = new Map<number, AudioBuffer>();
const ringing = new Map<number, { src: AudioBufferSourceNode; gain: GainNode }>();

function audio(): AudioContext {
  if (ctx) return ctx;
  ctx = new AudioContext();
  out = ctx.createGain();
  out.gain.value = 0.8;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 5200;
  const room = ctx.createConvolver();
  room.buffer = roomImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.25;
  out.connect(tone);
  tone.connect(ctx.destination);
  tone.connect(room).connect(wet).connect(ctx.destination);
  return ctx;
}

function roomImpulse(c: AudioContext): AudioBuffer {
  const n = Math.floor(c.sampleRate * 1.6);
  const b = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.25));
  }
  return b;
}

function pluckBuffer(c: AudioContext, midi: number): AudioBuffer {
  const cached = buffers.get(midi);
  if (cached) return cached;
  const sr = c.sampleRate;
  const f = freq(midi);
  const ring = Math.min(3.5, Math.max(1.2, 3.5 - (midi - 40) * 0.06)); // seconds to fade out, shorter up high
  const n = Math.floor(sr * ring);
  const b = c.createBuffer(1, n, sr);
  const y = b.getChannelData(0);
  const period = sr / f - 0.5; // the averaging adds half a sample
  const loss = Math.pow(0.001, 1 / (f * ring)); // -60 dB after `ring` seconds
  const at = (t: number) => {
    const i = Math.floor(t);
    const k = t - i;
    return y[i] * (1 - k) + y[i + 1] * k;
  };
  const burst = Math.ceil(period) + 2;
  let last = 0;
  for (let i = 0; i < burst; i++) last = y[i] = 0.5 * last + 0.5 * (Math.random() * 2 - 1); // a soft pick
  for (let i = burst; i < n; i++) y[i] = loss * 0.5 * (at(i - period) + at(i - period - 1));
  for (let i = 0; i < 64; i++) y[i] *= i / 64; // no click at the start
  buffers.set(midi, b);
  return b;
}

export function pluck(midi: number, string: number, when = 0, volume = 0.5) {
  const c = audio();
  const t = Math.max(when, c.currentTime);
  damp(string, t);
  const src = c.createBufferSource();
  src.buffer = pluckBuffer(c, midi);
  const gain = c.createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(out);
  src.start(t);
  ringing.set(string, { src, gain });
}

function damp(string: number, when: number) {
  const note = ringing.get(string);
  if (!note) return;
  note.gain.gain.setTargetAtTime(0, when, 0.015);
  note.src.stop(when + 0.12);
  ringing.delete(string);
}

function click(when: number, accent: boolean) {
  const c = audio();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.frequency.value = accent ? 1760 : 1320;
  g.gain.setValueAtTime(accent ? 0.25 : 0.15, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
  osc.connect(g).connect(c.destination);
  osc.start(when);
  osc.stop(when + 0.05);
}

// Plays the song from `from`, a step at a time, reading it live (edits, tempo and
// loop changes apply while it plays). The loop range is [first, past-last) columns.
// Returns a function that stops it.
export function play(o: {
  song: () => Song;
  from: number;
  loop: () => [number, number] | null;
  metronome: () => boolean;
  onCol: (col: number | null) => void;
}): () => void {
  const c = audio();
  let col = o.from;
  let next = c.currentTime + 0.06;
  let stopped = false;
  const shown: { col: number; time: number }[] = [];
  const end = () => {
    stopped = true;
    clearInterval(timer);
    cancelAnimationFrame(frame);
    for (const s of [...ringing.keys()]) damp(s, c.currentTime);
    o.onCol(null);
  };
  const schedule = () => {
    while (!stopped && next < c.currentTime + 0.12) {
      const s = o.song();
      const range = o.loop();
      if (col >= (range ? range[1] : s.cols.length)) {
        if (!range) {
          setTimeout(end, Math.max(0, (next - c.currentTime) * 1000));
          stopped = true;
          return;
        }
        col = range[0];
      }
      s.cols[col].forEach((f, string) => {
        if (f !== null && !s.missing[string]) pluck(s.tuning[string] + f, string, next);
      });
      if (o.metronome() && col % cellsPerBeat(s) === 0) click(next, col % cellsPerBar(s) === 0);
      shown.push({ col, time: next });
      next += secondsPerCell(s);
      col++;
    }
  };
  const draw = () => {
    while (shown.length && shown[0].time <= c.currentTime) o.onCol(shown.shift()!.col);
    frame = requestAnimationFrame(draw);
  };
  let frame = requestAnimationFrame(draw);
  const timer = setInterval(schedule, 25);
  schedule();
  return end;
}
