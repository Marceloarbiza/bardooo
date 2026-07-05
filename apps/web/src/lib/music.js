import { sfx } from "./sfx";

/* ---- musica de fondo (chiptune 8-bit, loop de 8 compases, toggle propio) ---- */
const NOTE = (() => {
  const N = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  return (n) => {
    const m = /^([A-G]#?)(\d)$/.exec(n);
    return 440 * Math.pow(2, (N[m[1]] + (+m[2] + 1) * 12 - 69) / 12);
  };
})();

export const music = {
  playing: false, timer: null, next: 0, step: 0, master: null,
  STEP: 0.21, // corcheas a ~143 bpm
  ROOTS: ["C", "G", "A", "F", "C", "G", "F", "G"], // I-V-vi-IV, luego I-V-IV-V
  MEL: [
    "E5", "G5", "C6", "G5", "A5", "G5", "E5", null,   // C
    "D5", "G5", "B5", "G5", "A5", "B5", "D6", null,   // G
    "C6", "B5", "A5", "E5", "A5", "B5", "C6", null,   // Am
    "A5", "G5", "F5", "A5", "C6", null, "G5", null,   // F
    "E5", "G5", "C6", "G5", "A5", "G5", "E5", null,   // C
    "D5", "G5", "B5", "G5", "D6", "B5", "G5", null,   // G
    "A5", "C6", "F6", "C6", "A5", "F5", null, "G5",   // F
    "B5", "D6", "G6", null, "D6", "B5", "G5", null,   // G (vuelta)
  ],
  _note(freq, t0, dur, type, vol) {
    const ctx = sfx.ctx;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(music.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },
  start() {
    const ctx = sfx.ctx;
    if (music.playing || !ctx) return;
    music.master = ctx.createGain();
    music.master.gain.value = 1;
    music.master.connect(ctx.destination);
    music.playing = true;
    music.step = 0;
    music.next = ctx.currentTime + 0.06;
    // scheduler con lookahead: agenda lo proximo 300 ms cada 90 ms
    music.timer = setInterval(() => {
      if (!music.playing) return;
      const ahead = ctx.currentTime + 0.3;
      while (music.next < ahead) {
        const i = music.step % music.MEL.length;
        const mel = music.MEL[i];
        if (mel) music._note(NOTE(mel), music.next, 0.16, "square", 0.024); // melodia
        const root = music.ROOTS[Math.floor(i / 8)];
        music._note(NOTE(root + (i % 2 ? "3" : "2")), music.next, 0.18, "triangle", 0.05); // bajo en octavas
        music.next += music.STEP;
        music.step++;
      }
    }, 90);
  },
  stop() {
    music.playing = false;
    clearInterval(music.timer);
    if (music.master && sfx.ctx) {
      const m = music.master;
      m.gain.setTargetAtTime(0.0001, sfx.ctx.currentTime, 0.06); // fade corto, sin corte seco
      setTimeout(() => m.disconnect(), 400);
      music.master = null;
    }
  },
};
