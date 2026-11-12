import { describe, expect, it } from "vitest";
import { barCount, freq, insertBar, newSong, noteName, normalize, removeBar, setFret, toText } from "./tab";

describe("tab", () => {
  it("names and tunes notes", () => {
    expect(freq(69)).toBe(440);
    expect(noteName(40)).toBe("E2");
    expect(noteName(64 + 3)).toBe("G4");
  });

  it("edits without touching the old song", () => {
    const a = newSong();
    const b = setFret(a, 2, 0, 5);
    expect(a.cols[2][0]).toBeNull();
    expect(b.cols[2][0]).toBe(5);
  });

  it("adds and removes whole bars, never the last one", () => {
    const s = setFret(newSong(), 8, 1, 3); // bar 2, first cell
    const more = insertBar(s, 0); // a new bar 2, the note moves to bar 3
    expect(barCount(more)).toBe(5);
    expect(more.cols[16][1]).toBe(3);
    expect(removeBar(more, 1).cols[8][1]).toBe(3);
    let one = { ...s, cols: s.cols.slice(0, 8) };
    expect(removeBar(one, 0)).toBe(one);
    one = normalize({ ...one, meter: "4/4s" });
    expect(one.cols.length).toBe(16);
  });

  it("writes a plain-text tab", () => {
    let s = { ...newSong(), title: "T", cols: newSong().cols.slice(0, 8) };
    s = setFret(setFret(setFret(s, 0, 5, 0), 2, 3, 12), 2, 2, 2);
    // columns: "0-" "--" then the two-digit one "12-" (the others widen to match), five "--"
    const d = (n: number) => "-".repeat(n);
    expect(toText(s)).toBe(
      [
        "T — 100 BPM, 4/4 · colcheias",
        "",
        `e|${d(17)}|`,
        `B|${d(17)}|`,
        `G|${d(4)}2${d(12)}|`,
        `D|${d(4)}12${d(11)}|`,
        `A|${d(17)}|`,
        `E|0${d(16)}|`,
        "",
      ].join("\n"),
    );
  });
});
