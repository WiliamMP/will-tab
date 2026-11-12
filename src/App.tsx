import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { play, pluck } from "./audio";
import { Fretboard } from "./Fretboard";
import {
  MAX_FRET, METERS, TUNINGS, barCount, cellsPerBar, cellsPerBeat, insertBar, newSong, normalize,
  pitchClass, removeBar, setFret, toText, type MeterId, type Song,
} from "./tab";

const STORE = "will-tab.song"; // the song in progress, kept between runs

function loadStored(): Song {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? "");
    if (Array.isArray(s?.cols)) return normalize(s);
  } catch {}
  return newSong();
}

export default function App() {
  const [song, setSong] = useState<Song>(loadStored);
  const [cur, setCur] = useState({ col: 0, string: 0 });
  const [playCol, setPlayCol] = useState<number | null>(null);
  const [looping, setLooping] = useState(false);
  const [loopBars, setLoopBars] = useState<[number, number]>([1, 4]);
  const [metronome, setMetronome] = useState(false);
  const [path, setPath] = useState<string | null>(localStorage.getItem(STORE + ".path"));
  const [toast, setToast] = useState("");
  const undo = useRef<Song[]>([]);
  const stopRef = useRef<(() => void) | null>(null);
  const typed = useRef({ at: 0, col: -1, string: -1, digit: 0 });
  // the player reads these live
  const live = useRef({ song, looping, loopBars, metronome });
  live.current = { song, looping, loopBars, metronome };

  const bars = barCount(song);
  const cells = cellsPerBar(song);
  const beat = cellsPerBeat(song);

  useEffect(() => localStorage.setItem(STORE, JSON.stringify(song)), [song]);
  useEffect(() => {
    if (path) localStorage.setItem(STORE + ".path", path);
    else localStorage.removeItem(STORE + ".path");
  }, [path]);
  useEffect(() => {
    setCur((c) => ({ col: Math.min(c.col, song.cols.length - 1), string: c.string }));
    setLoopBars(([a, b]) => [Math.min(a, bars), Math.min(Math.max(b, a), bars)]);
  }, [song.cols.length, bars]);

  const say = (text: string) => {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? "" : t)), 1800);
  };

  const change = (next: Song) => {
    undo.current = [...undo.current.slice(-99), song];
    setSong(next);
  };

  const put = (col: number, string: number, fret: number | null) => {
    if (song.missing[string]) return say("essa corda está marcada como faltando");
    change(setFret(song, col, string, fret));
    if (fret !== null) pluck(song.tuning[string] + fret, string);
  };

  const loopRange = (): [number, number] | null => {
    const { looping, loopBars, song } = live.current;
    if (!looping) return null;
    const c = cellsPerBar(song);
    return [(loopBars[0] - 1) * c, Math.min(loopBars[1] * c, song.cols.length)];
  };

  const togglePlay = () => {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
      return;
    }
    const range = loopRange();
    const barStart = Math.floor(cur.col / cells) * cells;
    const from = range && (barStart < range[0] || barStart >= range[1]) ? range[0] : barStart;
    stopRef.current = play({
      song: () => live.current.song,
      from,
      loop: loopRange,
      metronome: () => live.current.metronome,
      onCol: (c) => {
        setPlayCol(c);
        if (c === null) stopRef.current = null;
      },
    });
  };

  const fileSave = async (as = false) => {
    try {
      await saveTo(as ? null : path);
    } catch (e) {
      say(`não salvou: ${e}`);
    }
  };

  const saveTo = async (p: string | null) => {
    if (!p) {
      p = await save({ defaultPath: `${song.title}.wtab`, filters: [{ name: "Tablatura", extensions: ["wtab"] }] });
      if (!p) return;
    }
    await invoke("write_text", { path: p, text: JSON.stringify(song, null, 1) });
    setPath(p);
    say("salvo");
  };

  const fileOpen = async () => {
    try {
      const p = await open({ filters: [{ name: "Tablatura", extensions: ["wtab"] }] });
      if (typeof p !== "string") return;
      const s = normalize(JSON.parse(await invoke<string>("read_text", { path: p })));
      change(s);
      setPath(p);
      setCur({ col: 0, string: 0 });
    } catch (e) {
      say(`não abriu: ${e}`);
    }
  };

  const copyText = async () => {
    await navigator.clipboard.writeText(toText(song));
    say("tablatura copiada como texto");
  };

  // keyboard: arrows move, digits write the fret, Backspace clears, Space plays
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "SELECT") {
        if (e.key === "Escape" || e.key === "Enter") t.blur();
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      const last = song.cols.length - 1;
      const strings = song.tuning.length;
      if (ctrl && e.key.toLowerCase() === "z") {
        const prev = undo.current.pop();
        if (prev) setSong(prev);
      } else if (ctrl && e.key.toLowerCase() === "s") fileSave(e.shiftKey);
      else if (ctrl && e.key.toLowerCase() === "o") fileOpen();
      else if (e.key === " ") togglePlay();
      else if (e.key === "ArrowRight") setCur((c) => ({ ...c, col: Math.min(last, ctrl ? (Math.floor(c.col / cells) + 1) * cells : c.col + 1) }));
      else if (e.key === "ArrowLeft") setCur((c) => ({ ...c, col: Math.max(0, ctrl ? (Math.ceil(c.col / cells) - 1) * cells : c.col - 1) }));
      else if (e.key === "ArrowUp") setCur((c) => ({ ...c, string: Math.max(0, c.string - 1) }));
      else if (e.key === "ArrowDown") setCur((c) => ({ ...c, string: Math.min(strings - 1, c.string + 1) }));
      else if (e.key === "Backspace" || e.key === "Delete") put(cur.col, cur.string, null);
      else if (/^[0-9]$/.test(e.key)) {
        const d = Number(e.key);
        const k = typed.current;
        const now = performance.now();
        const two = k.col === cur.col && k.string === cur.string && now - k.at < 800 && k.digit * 10 + d <= MAX_FRET;
        put(cur.col, cur.string, two ? k.digit * 10 + d : d);
        typed.current = { at: two ? 0 : now, col: cur.col, string: cur.string, digit: d };
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => () => stopRef.current?.(), []);

  const curBar = Math.floor(cur.col / cells);
  const barsPerRow = cells > 8 ? 2 : 4;
  const rows = Array.from({ length: Math.ceil(bars / barsPerRow) }, (_, r) =>
    Array.from({ length: Math.min(barsPerRow, bars - r * barsPerRow) }, (_, i) => r * barsPerRow + i),
  );
  const tuningName = Object.keys(TUNINGS).find((k) => TUNINGS[k].join() === song.tuning.join()) ?? "";

  return (
    <div className="app">
      <header>
        <input className="title" value={song.title} onChange={(e) => setSong({ ...song, title: e.target.value })} />
        <button className={playCol !== null ? "primary on" : "primary"} onClick={togglePlay} title="Espaço">
          {playCol !== null ? "■ Parar" : "▶ Tocar"}
        </button>
        <label>
          BPM
          <input type="number" min={30} max={260} value={song.bpm}
            onChange={(e) => setSong({ ...song, bpm: Math.min(260, Math.max(30, Number(e.target.value) || 100)) })} />
        </label>
        <select value={song.meter} onChange={(e) => change(normalize({ ...song, meter: e.target.value as MeterId }))}>
          {Object.entries(METERS).map(([id, m]) => (
            <option key={id} value={id}>{m.label}</option>
          ))}
        </select>
        <select value={tuningName} onChange={(e) => change({ ...song, tuning: TUNINGS[e.target.value] })}>
          {!tuningName && <option value="">afinação própria</option>}
          {Object.keys(TUNINGS).map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={metronome} onChange={(e) => setMetronome(e.target.checked)} /> metrônomo
        </label>
        <label className="check">
          <input type="checkbox" checked={looping} onChange={(e) => setLooping(e.target.checked)} /> loop do compasso
          <input type="number" min={1} max={bars} value={loopBars[0]}
            onChange={(e) => setLoopBars([Math.min(bars, Math.max(1, Number(e.target.value))), Math.max(loopBars[1], Number(e.target.value))])} />
          ao
          <input type="number" min={1} max={bars} value={loopBars[1]}
            onChange={(e) => setLoopBars([loopBars[0], Math.min(bars, Math.max(loopBars[0], Number(e.target.value)))])} />
        </label>
        <span className="grow" />
        <button onClick={() => { change(newSong()); setPath(null); setCur({ col: 0, string: 0 }); }}>Novo</button>
        <button onClick={fileOpen} title="Ctrl+O">Abrir</button>
        <button onClick={() => fileSave()} title="Ctrl+S (Ctrl+Shift+S: salvar como)">Salvar</button>
        <button onClick={copyText}>Copiar texto</button>
      </header>

      <main className="sheet">
        {rows.map((row, r) => (
          <div className="system" key={r}>
            <div className="labels">
              {song.tuning.map((m, s) => (
                <div key={s} className={song.missing[s] ? "missing" : ""}>{s === 0 ? pitchClass(m).toLowerCase() : pitchClass(m)}</div>
              ))}
            </div>
            {row.map((b) => (
              <div className={b === curBar ? "bar current" : "bar"} key={b}>
                <div className="barnum">{b + 1}</div>
                <div className="cells" style={{ gridTemplateColumns: `repeat(${cells}, 1fr)` }}>
                  {song.tuning.map((_, s) =>
                    Array.from({ length: cells }, (_, i) => {
                      const col = b * cells + i;
                      const f = song.cols[col][s];
                      const cls = ["cell", i % beat === 0 && i > 0 ? "beat" : "", song.missing[s] ? "missing" : "",
                        col === playCol ? "playing" : "", col === cur.col ? "curcol" : "",
                        col === cur.col && s === cur.string ? "cursor" : ""].join(" ");
                      return (
                        <div key={`${s}-${i}`} className={cls} style={{ gridRow: s + 1, gridColumn: i + 1 }}
                          onClick={() => setCur({ col, string: s })}>
                          {f !== null && <span>{f}</span>}
                        </div>
                      );
                    }),
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className="barbuttons">
          <button onClick={() => change(insertBar(song, curBar))}>+ compasso depois do {curBar + 1}</button>
          <button onClick={() => change(removeBar(song, curBar))} disabled={bars <= 1}>− tirar compasso {curBar + 1}</button>
        </div>
      </main>

      <Fretboard
        song={song}
        column={song.cols[Math.min(cur.col, song.cols.length - 1)]}
        playing={playCol !== null ? song.cols[playCol] : null}
        cursorString={cur.string}
        onPick={(s, f) => {
          setCur({ ...cur, string: s });
          put(cur.col, s, song.cols[cur.col][s] === f ? null : f);
        }}
        onToggleString={(s) => change({ ...song, missing: song.missing.map((m, i) => (i === s ? !m : m)) })}
      />

      <footer>
        <span>setas: andar · Ctrl+setas: pular compasso · números: casa · Backspace: apagar · Espaço: tocar · Ctrl+Z: desfazer</span>
        <span className="grow" />
        <span>{path ?? "não salvo"}</span>
        {toast && <span className="toast">{toast}</span>}
      </footer>
    </div>
  );
}
