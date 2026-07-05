/* ---- sonido (Web Audio puro: nodos frescos por disparo, sin estado compartido) ---- */
export const sfx = {
  ctx: null,
  async ensure() {
    if (!sfx.ctx) sfx.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (sfx.ctx.state === "suspended") await sfx.ctx.resume();
  },
  _beep(freq, at, dur, type = "square", vol = 0.06) {
    const ctx = sfx.ctx; if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },
  /* moneda: doble blip ascendente (B5 -> E6), la micro-recompensa clasica */
  tick() {
    sfx._beep(988, 0, 0.09, "square", 0.05);
    sfx._beep(1319, 0.07, 0.13, "square", 0.055);
  },
  /* sonidos de La Ficha */
  flap() { sfx._beep(520, 0, 0.06, "square", 0.03); },
  pass() { sfx._beep(1175, 0, 0.07, "square", 0.035); sfx._beep(1568, 0.05, 0.08, "square", 0.03); },
  crash() { sfx._beep(220, 0, 0.18, "sawtooth", 0.05); sfx._beep(140, 0.09, 0.28, "sawtooth", 0.05); },
  /* murmullo de la sala: blip corto y suave, tono al azar para no cansar */
  crowd() {
    const f = 700 + Math.random() * 550;
    sfx._beep(f, 0, 0.07, "square", 0.018);
  },
  /* jackpot: lluvia de monedas que sube + acorde brillante al final */
  win() {
    const run = [659, 784, 988, 1047, 1319, 1568, 1976]; // E5..B6
    run.forEach((f, i) => sfx._beep(f, i * 0.055, 0.12, "triangle", 0.06));
    const t = run.length * 0.055 + 0.02;
    [523, 659, 784, 1047].forEach((f) => sfx._beep(f, t, 0.55, "sawtooth", 0.03)); // acorde C mayor
  },
};
