// The guitar neck: click where the finger goes (string and fret) and the note
// lands in the column under the cursor. Dots show the fingers of that column;
// while playing, the column being heard. Clicking a string's name marks it as
// missing (greyed, skipped when playing).

import { useState } from "react";
import { MAX_FRET, noteName, pitchClass, type Fret, type Song } from "./tab";

const W = 1000;
const NUT = 70;
const TOP = 22;
const GAP = 27;
const INLAYS = [3, 5, 7, 9, 15];

// real fret spacing: each fret is 2^(1/12) closer than the last
const SCALE = (W - 12 - NUT) / (1 - 2 ** (-MAX_FRET / 12));
const fretX = (f: number) => NUT + SCALE * (1 - 2 ** (-f / 12));
const dotX = (f: number) => (f === 0 ? NUT - 22 : (fretX(f - 1) + fretX(f)) / 2);

export function Fretboard(props: {
  song: Song;
  column: Fret[];
  playing: Fret[] | null;
  cursorString: number;
  onPick: (string: number, fret: number) => void;
  onToggleString: (string: number) => void;
}) {
  const { song, column, playing } = props;
  const [hover, setHover] = useState<{ s: number; f: number } | null>(null);
  const strings = song.tuning.length;
  const H = TOP * 2 + GAP * (strings - 1);
  const y = (s: number) => TOP + s * GAP;

  const spot = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const yy = ((e.clientY - r.top) / r.height) * H;
    if (x < 30) return null;
    const s = Math.min(strings - 1, Math.max(0, Math.round((yy - TOP) / GAP)));
    let f = 0;
    while (f < MAX_FRET && x > fretX(f)) f++;
    return { s, f: x < NUT ? 0 : f };
  };

  const shown = playing ?? column;
  return (
    <div className="fretboard">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={(e) => setHover(spot(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const p = spot(e);
          if (p && !song.missing[p.s]) props.onPick(p.s, p.f);
        }}
      >
        <rect x={NUT} y={TOP - 12} width={W - NUT - 12} height={H - TOP * 2 + 24} rx={4} className="wood" />
        {INLAYS.map((f) => (
          <circle key={f} cx={dotX(f)} cy={H / 2} r={6} className="inlay" />
        ))}
        <circle cx={dotX(12)} cy={y(1) + GAP / 2} r={6} className="inlay" />
        <circle cx={dotX(12)} cy={y(strings - 2) - GAP / 2} r={6} className="inlay" />
        {Array.from({ length: MAX_FRET + 1 }, (_, f) => (
          <g key={f}>
            <line x1={fretX(f)} x2={fretX(f)} y1={TOP - 12} y2={H - TOP + 12} className={f === 0 ? "nut" : "fret"} />
            {f > 0 && (
              <text x={dotX(f)} y={H - 2} className="fretnum">
                {f}
              </text>
            )}
          </g>
        ))}
        {song.tuning.map((open, s) => (
          <g key={s} className={song.missing[s] ? "missing" : s === props.cursorString ? "current" : ""}>
            <line x1={NUT - 40} x2={W - 12} y1={y(s)} y2={y(s)} className="string" strokeWidth={1 + s * 0.45} />
            <text
              x={14}
              y={y(s) + 5}
              className="strname"
              onClick={(e) => {
                e.stopPropagation();
                props.onToggleString(s);
              }}
            >
              <title>{song.missing[s] ? "Corda faltando: clique para devolver" : "Clique se esta corda estiver faltando"}</title>
              {pitchClass(open)}
            </text>
          </g>
        ))}
        {shown.map((f, s) =>
          f === null || f > MAX_FRET ? null : (
            <g key={s} className={playing ? "finger playing" : "finger"}>
              <circle cx={dotX(f)} cy={y(s)} r={10} />
              <text x={dotX(f)} y={y(s) + 4}>
                {f}
              </text>
            </g>
          ),
        )}
        {hover && !song.missing[hover.s] && <circle cx={dotX(hover.f)} cy={y(hover.s)} r={10} className="ghost" />}
      </svg>
      <div className="hint">
        {hover
          ? song.missing[hover.s]
            ? "corda faltando"
            : `corda ${pitchClass(song.tuning[hover.s])}, ${hover.f === 0 ? "solta" : `casa ${hover.f}`} = ${noteName(song.tuning[hover.s] + hover.f)}`
          : "clique na casa onde fica o dedo · clique de novo para tirar · clique no nome da corda se ela estiver faltando"}
      </div>
    </div>
  );
}
