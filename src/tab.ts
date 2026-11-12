// A song is a row of columns (time steps); each column holds one fret (or none)
// per string. Strings go high to low (row 0 = high e), as a printed tab reads.
// Bars are just the columns cut every `cells` steps, so changing the meter
// keeps every note.

export type Fret = number | null;

export type Song = {
  title: string;
  bpm: number;
  meter: MeterId;
  tuning: number[]; // MIDI note of each open string, high to low
  missing: boolean[]; // strings the guitar has not got right now
  cols: Fret[][]; // cols[column][string]
};

export const METERS = {
  "4/4": { label: "4/4 · colcheias", beats: 4, cells: 8 },
  "4/4s": { label: "4/4 · semicolcheias", beats: 4, cells: 16 },
  "3/4": { label: "3/4 · colcheias", beats: 3, cells: 6 },
  "6/8": { label: "6/8", beats: 2, cells: 6 },
} as const;
export type MeterId = keyof typeof METERS;

export const TUNINGS: Record<string, number[]> = {
  "Padrão (EADGBE)": [64, 59, 55, 50, 45, 40],
  "Drop D (DADGBE)": [64, 59, 55, 50, 45, 38],
  "Meio tom abaixo": [63, 58, 54, 49, 44, 39],
};

export const MAX_FRET = 15;

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const noteName = (midi: number) => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
export const pitchClass = (midi: number) => NAMES[midi % 12];
export const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export const cellsPerBar = (s: Song) => METERS[s.meter].cells;
export const cellsPerBeat = (s: Song) => METERS[s.meter].cells / METERS[s.meter].beats;
export const barCount = (s: Song) => Math.ceil(s.cols.length / cellsPerBar(s));
export const secondsPerCell = (s: Song) => 60 / s.bpm / cellsPerBeat(s);

const emptyCols = (n: number, strings: number): Fret[][] =>
  Array.from({ length: n }, () => Array<Fret>(strings).fill(null));

export function newSong(): Song {
  const tuning = TUNINGS["Padrão (EADGBE)"];
  return {
    title: "Sem título",
    bpm: 100,
    meter: "4/4",
    tuning,
    missing: tuning.map(() => false),
    cols: emptyCols(METERS["4/4"].cells * 4, tuning.length),
  };
}

// Pads the columns to whole bars (after a meter change, or a file from elsewhere).
export function normalize(s: Song): Song {
  const n = Math.max(1, barCount(s)) * cellsPerBar(s);
  return n === s.cols.length ? s : { ...s, cols: [...s.cols, ...emptyCols(n - s.cols.length, s.tuning.length)] };
}

export function setFret(s: Song, col: number, string: number, fret: Fret): Song {
  const cols = s.cols.slice();
  cols[col] = cols[col].slice();
  cols[col][string] = fret;
  return { ...s, cols };
}

export function insertBar(s: Song, afterBar: number): Song {
  const at = (afterBar + 1) * cellsPerBar(s);
  return { ...s, cols: [...s.cols.slice(0, at), ...emptyCols(cellsPerBar(s), s.tuning.length), ...s.cols.slice(at)] };
}

export function removeBar(s: Song, bar: number): Song {
  if (barCount(s) <= 1) return s;
  const c = cellsPerBar(s);
  return { ...s, cols: [...s.cols.slice(0, bar * c), ...s.cols.slice((bar + 1) * c)] };
}

// Plain-text tab, four bars to a line, to paste anywhere (or to show Claude).
export function toText(s: Song): string {
  const c = cellsPerBar(s);
  const labels = s.tuning.map((m, i) => (i === 0 ? pitchClass(m).toLowerCase() : pitchClass(m)));
  const width = Math.max(...labels.map((l) => l.length));
  const out = [`${s.title} — ${s.bpm} BPM, ${METERS[s.meter].label}`, ""];
  for (let start = 0; start < barCount(s); start += 4) {
    const bars = Array.from({ length: Math.min(4, barCount(s) - start) }, (_, i) => start + i);
    s.tuning.forEach((_, string) => {
      const cells = bars.map((b) =>
        s.cols.slice(b * c, (b + 1) * c).map((col) => {
          const w = Math.max(1, ...col.map((f) => (f === null ? 1 : String(f).length)));
          const f = col[string];
          return (f === null ? "-".repeat(w) : String(f).padEnd(w, "-")) + "-";
        }).join(""),
      );
      out.push(labels[string].padEnd(width) + "|" + cells.join("|") + "|");
    });
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}
