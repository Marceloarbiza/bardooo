import { useState, useEffect, useMemo, useRef } from "react";
import {
  Wallet, Plus, Clock, Users, Trophy, Check, X, Zap, ChevronLeft,
  Home, Ticket, ArrowRight, Sparkles, ShieldCheck, Share2, TrendingUp,
  Hourglass, CircleDot, Flame, Volume2, VolumeX, Music, Lock, Link2,
} from "lucide-react";
/* ---- sonido (Web Audio puro: nodos frescos por disparo, sin estado compartido) ---- */
const sfx = {
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

/* ---- musica de fondo (chiptune 8-bit, loop de 8 compases, toggle propio) ---- */
const NOTE = (() => {
  const N = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
  return (n) => {
    const m = /^([A-G]#?)(\d)$/.exec(n);
    return 440 * Math.pow(2, (N[m[1]] + (+m[2] + 1) * 12 - 69) / 12);
  };
})();

const music = {
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

/* ===========================================================================
   BARDOOO v2 — la arena del duelo. Prototipo funcional, blockchain SIMULADA.
   Toda la logica de producto es real (crear, apostar, resolver, cobrar); la
   "cadena" vive en estado de React, aislada en placeBet/createBet/resolve/
   claim para reemplazarse por wagmi/ethers sin tocar el diseno.
   La matematica de pago es espejo del contrato: comision sobre el total
   topeada al pozo perdedor, reparto proporcional. PLATFORM_BPS se leera de
   la factory en la app real (ver docs/INTEGRATION.md).
=========================================================================== */

const C = {
  bg: "#0C0616", bg2: "#150B29", bg3: "#1E1038", line: "#2C1A52",
  text: "#F6F1FF", dim: "#A18BD0", faint: "#635089",
  si: "#00F0C0", siDeep: "#04382E", siGlow: "rgba(0,240,192,.35)",
  no: "#FF2E7C", noDeep: "#4A0E2A", noGlow: "rgba(255,46,124,.32)",
  gold: "#FFC53D", goldDeep: "#4A3506",
};

const PLATFORM_BPS = 300;      // en la app real: factory.platformFeeBps()
const FLASH_REBATE_BPS = 200;  // en relampagos BARDOOO cobra solo 1%: cede 2pp al creador (total al apostador: igual)
const MAX_CREATOR_BPS = 1000;  // techo 10%
const CLOSE_OFFSET_MIN = 5;    // las apuestas cierran 5 min antes del evento

/* ------------------------------ helpers ------------------------------ */
const money = (n) => "$" + Number(n).toLocaleString("es-UY", { maximumFractionDigits: 2 });
const amt = (cur, n) => cur === "pts" ? Math.round(Number(n)).toLocaleString("es-UY") + " pts" : money(n);
const mins = (m) => m * 60000;
const pad2 = (n) => String(n).padStart(2, "0");
const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const fmtDateTime = (ms) =>
  !ms || isNaN(ms) ? "—"
    : new Date(ms).toLocaleString("es-UY", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/* ---- espejo exacto del contrato ---- */
function commission(total, winningPool, feeBps) {
  const gross = (total * feeBps) / 10000;
  const losing = total - winningPool;
  return gross > losing ? losing : gross;
}
function payoutFor(pools, option, stakeOnOption, feeBps) {
  const total = pools[0] + pools[1];
  const wp = pools[option];
  if (wp <= 0) return 0;
  const net = total - commission(total, wp, feeBps);
  return (stakeOnOption * net) / wp;
}
/* multiplicador implicito del pozo: cuanto paga hoy $1 puesto en esa opcion */
function multFor(pools, option, feeBps) {
  const total = pools[0] + pools[1];
  const wp = pools[option];
  if (wp <= 0 || total <= 0) return null;
  const net = total - commission(total, wp, feeBps);
  return net / wp;
}
const fmtMult = (m) => (m == null ? "—" : "×" + (m >= 10 ? Math.round(m) : m.toFixed(2).replace(/0$/, "")));

/* ---- odometro: los montos ruedan hasta su valor nuevo ---- */
function useAnimatedNumber(target, dur = 650) {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return val;
}
function Money({ v }) {
  const a = useAnimatedNumber(v);
  return <>{money(a)}</>;
}
function Num({ v }) {
  const a = useAnimatedNumber(v);
  return <>{Math.round(a).toLocaleString("es-UY")}</>;
}
function Amt({ cur, v }) {
  const a = useAnimatedNumber(v);
  return <>{amt(cur, a)}</>;
}


/* ------------------------------ seed ------------------------------ */
const now0 = Date.now();
function seedBets() {
  return [
    {
      id: 1, creator: { name: "El Turco Box", handle: "@turcobox", hue: C.no },
      question: "La Mona da el primer golpe en el round 1",
      currency: "usdc", pools: [180, 95], bettors: 14, stakeMode: "free", minStake: 5,
      maxStake: 0, maxBettors: 0, creatorBps: 700,
      closeTime: now0 + mins(3.5), resolveTime: now0 + mins(40),
      status: "open", winningOption: null, myStake: [0, 0], claimed: false,
    },
    {
      id: 2, creator: { name: "Futboleras UY", handle: "@futboleras", hue: C.si },
      question: "Peñarol recibe 3 o más amarillas en el partido",
      currency: "usdc", pools: [60, 240], bettors: 22, stakeMode: "fixed", fixedAmount: 20,
      minStake: 20, maxStake: 0, maxBettors: 0, creatorBps: 500,
      closeTime: now0 + mins(12), resolveTime: now0 + mins(120),
      status: "open", winningOption: null, myStake: [0, 0], claimed: false,
    },
    {
      id: 3, creator: { name: "GolfPro TV", handle: "@golfprotv", hue: C.gold },
      question: "El primer hoyo se mete en 3 golpes o menos",
      currency: "usdc", pools: [40, 38], bettors: 6, stakeMode: "capped", minStake: 5,
      maxStake: 50, maxBettors: 30, creatorBps: 1000,
      closeTime: now0 + mins(7), resolveTime: now0 + mins(60),
      status: "open", winningOption: null, myStake: [0, 0], claimed: false,
    },
    {
      id: 4, creator: { name: "vos", handle: "@vos", hue: C.si, mine: true },
      question: "Gana el local el primer cuarto del básquet",
      currency: "usdc", pools: [120, 210], bettors: 11, stakeMode: "free", minStake: 5,
      maxStake: 0, maxBettors: 0, creatorBps: 800,
      closeTime: now0 - mins(2), resolveTime: now0 - mins(1),
      status: "locked", winningOption: null, myStake: [0, 0], claimed: false,
    },
    {
      id: 5, creator: { name: "Stream Picante", handle: "@picante", hue: C.no },
      question: "Hay gol en el primer tiempo",
      currency: "usdc", pools: [150, 300], bettors: 19, stakeMode: "free", minStake: 5,
      maxStake: 0, maxBettors: 0, creatorBps: 600,
      closeTime: now0 - mins(30), resolveTime: now0 - mins(5),
      status: "resolved", winningOption: 1, myStake: [0, 40], claimed: false,
    },
    {
      id: 7, creator: { name: "vos", handle: "@vos", hue: C.si, mine: true },
      question: "Asado del sábado: ¿Rodri llega tarde otra vez?",
      currency: "pts", isPrivate: true, code: "ASADO", pools: [30, 45], bettors: 5, stakeMode: "free", minStake: 5,
      maxStake: 0, maxBettors: 0, creatorBps: 500,
      closeTime: now0 + mins(25), resolveTime: now0 + mins(180),
      status: "open", winningOption: null, myStake: [0, 0], claimed: false,
    },
    {
      id: 6, creator: { name: "Clips Rioplata", handle: "@clipsrio", hue: "#8A6CFF" },
      question: "El clip del picado llega a 10k vistas hoy",
      currency: "pts", pools: [140, 210], bettors: 17, stakeMode: "free", minStake: 5,
      maxStake: 0, maxBettors: 0, creatorBps: 500,
      closeTime: now0 + mins(9), resolveTime: now0 + mins(90),
      status: "open", winningOption: null, myStake: [0, 0], claimed: false,
    },
  ];
}
const seedTicker = [
  { u: "@leo", amt: 50, side: 1, cur: "usdc" }, { u: "@caro.p", amt: 20, side: 0, cur: "usdc" },
  { u: "@nachovlc", amt: 100, side: 1, cur: "usdc" }, { u: "@flor__", amt: 35, side: 0, cur: "pts" },
  { u: "@tomas.g", amt: 15, side: 1, cur: "usdc" }, { u: "@romi", amt: 60, side: 0, cur: "pts" },
];

/* ================================ APP ================================ */
export default function App() {
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState(0);
  const [walletOn, setWalletOn] = useState(false);   // la wallet es la graduacion, no la entrada
  const [profile, setProfile] = useState({ name: "vos", handle: "@vos" });
  const WALLET_ADDR = "0x7bC4f2a9E11d84c3B6f09A5d21c7E38F4a9D9E2a"; // demo: en la app real la crea Privy
  const [showWallet, setShowWallet] = useState(false);
  const [points, setPoints] = useState(60); // puntos BARDOOO: se ganan con La Ficha e invitando, se apuestan en duelos de puntos
  const [bets, setBets] = useState(seedBets);
  const [view, setView] = useState("feed");
  const [activeId, setActiveId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState(null);
  const [earned, setEarned] = useState(0);
  const [burst, setBurst] = useState(false);
  const [ticker, setTicker] = useState(seedTicker);
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [tries, setTries] = useState(3);
  const [showQuick, setShowQuick] = useState(false); // modal relampago
  const [showLink, setShowLink] = useState(false);   // abrir apuesta por link // vuelos diarios de La Ficha (en el prototipo: por sesion)

  const onPrize = (prize) => {
    setTries((t) => t - 1);
    if (prize > 0) {
      setPoints((x) => x + prize);
      if (prize >= 10) { setBurst(true); setTimeout(() => setBurst(false), 1700); play("win"); }
      else play("tick");
      fire(prize >= 10 ? `¡PERFECTO! Ganaste ${prize} pts` : `Ganaste ${prize} pts para apostar`, prize >= 10 ? "win" : "ok");
    } else {
      fire("Ni un caño esta vez. ¡Otra!", "err");
    }
  };

  const invite = () => {
    const txt = "Te invito a BARDOOO, la arena de apuestas entre amigos ⚡ bardooo.app/i/vos";
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(txt).then(() => {
        setPoints((x) => x + 25); play("tick");
        fire("Link copiado · +25 pts (en la app real se acreditan cuando tu amigo entra)");
      });
    } else fire("No se pudo copiar", "err");
  };

  const toggleMusic = async () => {
    if (!musicOn) {
      try { await sfx.ensure(); music.start(); setMusicOn(true); } catch (e) {}
    } else {
      music.stop(); setMusicOn(false);
    }
  };
  useEffect(() => () => music.stop(), []); // corta la musica al desmontar

  const play = (k) => {
    if (!soundOn) return;
    try {
      if (sfx.ctx && sfx.ctx.state === "suspended") sfx.ctx.resume();
      sfx[k]();
    } catch (e) {}
  };
  const toggleSound = async () => {
    if (!soundOn) { try { await sfx.ensure(); sfx.tick(); } catch (e) {} }
    setSoundOn((v) => !v);
  };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setBets((bs) => bs.map((b) => {
      let x = b;
      if (x.status === "open" && now >= x.closeTime) x = { ...x, status: "locked" };
      // relampago: si el creador no resolvio en 2 h desde el lanzamiento, se anula y se devuelve
      if (x.relampago && (x.status === "open" || x.status === "locked") && now > (x.deadline || x.launch + 2 * 3600000))
        x = { ...x, status: "cancelled" };
      return x;
    }));
  }, [now]);

  const fire = (msg, kind = "ok") => {
    setToast({ msg, kind, id: Math.random() });
    setTimeout(() => setToast(null), 2600);
  };
  const pushTick = (e) => setTicker((t) => [e, ...t].slice(0, 12));

  /* ---- multitud simulada: en la app real, esto son los eventos BetPlaced ---- */
  const betsRef = useRef(bets);
  useEffect(() => { betsRef.current = bets; }, [bets]);
  const soundOnRef = useRef(soundOn);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);
  useEffect(() => {
    if (!connected) return;
    let alive = true, to;
    const crowd = ["@leo", "@caro.p", "@nachovlc", "@flor__", "@tomas.g", "@romi", "@seba.k", "@juli", "@mateo_ok", "@vale.re"];
    const loop = () => {
      to = setTimeout(() => {
        if (!alive) return;
        const open = betsRef.current.filter((b) => b.status === "open" && !b.isPrivate);
        if (open.length > 0) {
          const b = open[Math.floor(Math.random() * open.length)];
          // leve sesgo hacia el lado que va ganando: la manada sigue a la manada
          const side = Math.random() < (b.pools[1] + 10) / (b.pools[0] + b.pools[1] + 20) ? 1 : 0;
          const amt = b.stakeMode === "fixed" ? b.fixedAmount : [5, 10, 15, 20, 25, 50][Math.floor(Math.random() * 6)];
          const u = crowd[Math.floor(Math.random() * crowd.length)];
          pushTick({ u, amt, side });
          if (soundOnRef.current) {
            try {
              if (sfx.ctx && sfx.ctx.state === "suspended") sfx.ctx.resume();
              sfx.crowd();
            } catch (e) {}
          }
          setBets((bs) => bs.map((x) => {
            if (x.id !== b.id) return x;
            const pools = side === 1 ? [x.pools[0], x.pools[1] + amt] : [x.pools[0] + amt, x.pools[1]];
            const bettors = x.bettors + 1;
            const full = x.maxBettors !== 0 && bettors >= x.maxBettors;
            return { ...x, pools, bettors, lastHit: { side, t: Date.now() }, status: full ? "locked" : x.status };
          }));
        }
        loop();
      }, 2500 + Math.random() * 5000);
    };
    loop();
    return () => { alive = false; clearTimeout(to); };
  }, [connected]);

  /* ---------- acciones "on-chain" (mock, misma API que la real) ---------- */
  const placeBet = (id, option, amount) => {
    const b = bets.find((x) => x.id === id);
    if (!b) return;
    const other = option === 1 ? 0 : 1;
    if (b.myStake[other] > 0)
      return fire(`Ya estás del lado del ${other === 1 ? "SÍ" : "NO"} en esta apuesta`, "err");
    if (b.currency === "usdc" && !walletOn) { setShowWallet(true); return fire("Este duelo se juega con USDC: activá tu wallet", "err"); }
    const bal = b.currency === "pts" ? points : balance;
    if (amount > bal) return fire(b.currency === "pts" ? "No te alcanzan los puntos" : "Saldo insuficiente", "err");
    if (b.stakeMode === "fixed" && amount !== b.fixedAmount)
      return fire(`En esta apuesta el monto es ${amt(b.currency, b.fixedAmount)}`, "err");
    if (amount < b.minStake) return fire(`Mínimo ${amt(b.currency, b.minStake)}`, "err");
    if (b.stakeMode === "capped" && b.myStake[option] + amount > b.maxStake)
      return fire(`Tope por persona: ${money(b.maxStake)}`, "err");

    if (b.currency === "pts") setPoints((x) => x - amount); else setBalance((x) => x - amount);
    setBets((bs) => bs.map((x) => {
      if (x.id !== id) return x;
      const pools = [...x.pools];
      pools[option] += amount;
      const myStake = [...x.myStake];
      const isNew = x.myStake[0] + x.myStake[1] === 0;
      myStake[option] += amount;
      return { ...x, pools, myStake, bettors: x.bettors + (isNew ? 1 : 0), lastHit: { side: option, t: Date.now() } };
    }));
    pushTick({ u: "@vos", amt: amount, side: option, cur: b.currency });
    play("tick");
    fire(`Metiste ${amt(b.currency, amount)} al ${option === 1 ? "SÍ" : "NO"}`);
  };

  const createBet = (form) => {
    const nextId = Math.max(...bets.map((b) => b.id)) + 1;
    const mk = (id, currency) => ({
      id, currency,
      creator: { name: profile.name, handle: profile.handle, mine: true },
      question: form.question,
      pools: [0, 0], bettors: 0,
      stakeMode: form.stakeMode, fixedAmount: form.fixedAmount,
      minStake: form.minStake, maxStake: form.maxStake,
      maxBettors: form.maxBettors, creatorBps: form.creatorBps,
      relampago: !!form.relampago, launch: form.launch || Date.now(), deadline: form.deadline,
      isPrivate: !!form.isPrivate, code: form.code || "",
      closeTime: form.closeTime, resolveTime: form.resolveTime,
      status: "open", winningOption: null, myStake: [0, 0], claimed: false,
    });
    // Con wallet: el duelo sale en USDC y ADEMAS en puntos (dos pozos gemelos, nunca mezclados).
    // Sin wallet: solo puntos. En la app real, resolver uno resuelve el espejo (backend).
    const news = walletOn
      ? [mk(nextId, "usdc"), mk(nextId + 1, "pts")]
      : [mk(nextId, "pts")];
    setBets((bs) => [...news, ...bs]);
    fire(form.isPrivate
      ? "Privada creada · compartí el link para que entren"
      : walletOn ? "Lanzada en USDC y en puntos" : "Apuesta lanzada");
    setActiveId(nextId);
    setView("detail");
  };

  const resolve = (id, option) => {
    const b = bets.find((x) => x.id === id);
    if (!b) return;
    const total = b.pools[0] + b.pools[1];
    const wp = b.pools[option];
    if (b.pools[0] === 0 || b.pools[1] === 0) {
      setBets((bs) => bs.map((x) => (x.id === id ? { ...x, status: "cancelled" } : x)));
      return fire("Sin contraparte: apuesta anulada, se devuelve todo", "err");
    }
    const comm = commission(total, wp, PLATFORM_BPS + b.creatorBps); // total identico para el apostador
    const totalBps = PLATFORM_BPS + b.creatorBps;
    const platformShare = b.relampago ? PLATFORM_BPS - FLASH_REBATE_BPS : PLATFORM_BPS; // bonus relampago
    const creatorCut = comm - (comm * platformShare) / totalBps;
    if (b.currency === "pts") setPoints((x) => x + creatorCut);
    else { setBalance((x) => x + creatorCut); setEarned((x) => x + creatorCut); }
    setBets((bs) => bs.map((x) => (x.id === id ? { ...x, status: "resolved", winningOption: option } : x)));
    play("win");
    fire(`Resultado cargado · tu comisión: ${amt(b.currency, creatorCut)}`, "win");
  };

  const claim = (id) => {
    const b = bets.find((x) => x.id === id);
    if (!b || b.status !== "resolved" || b.claimed) return;
    const pay = payoutFor(b.pools, b.winningOption, b.myStake[b.winningOption], PLATFORM_BPS + b.creatorBps);
    if (pay <= 0) return fire("No tenés premio en esta apuesta", "err");
    if (b.currency === "pts") setPoints((x) => x + pay); else setBalance((x) => x + pay);
    setBets((bs) => bs.map((x) => (x.id === id ? { ...x, claimed: true } : x)));
    setBurst(true); setTimeout(() => setBurst(false), 1700);
    play("win");
    fire(`Cobraste ${amt(b.currency, pay)}`, "win");
  };

  const activateWallet = () => {
    setWalletOn(true);
    setShowWallet(false);
    setBalance(500); // demo: en la app real, wallet embebida (Privy/Web3Auth) + deposito
    play("win");
    fire("Wallet activada · 500 USDC (demo)");
  };

  const refundMy = (id) => {
    const b = bets.find((x) => x.id === id);
    if (!b || b.status !== "cancelled" || b.claimed) return;
    const total = b.myStake[0] + b.myStake[1];
    if (total <= 0) return;
    if (b.currency === "pts") setPoints((x) => x + total); else setBalance((x) => x + total);
    setBets((bs) => bs.map((x) => (x.id === id ? { ...x, claimed: true } : x)));
    fire(`Recuperaste ${amt(b.currency, total)}`);
  };

  const active = bets.find((b) => b.id === activeId) || null;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", justifyContent: "center" }}>
      <Style />
      <div style={{
        width: "100%", maxWidth: 440, minHeight: "100vh", position: "relative",
        overflow: "hidden", fontFamily: "'Space Grotesk', system-ui, sans-serif",
        color: C.text, boxShadow: "0 0 90px rgba(0,0,0,.6)",
      }}>
        <Bg />
        {!connected ? (
          <Connect onConnect={async (withWallet) => {
            setConnected(true);
            if (withWallet) { setWalletOn(true); setBalance(500); }
            try {
              await sfx.ensure();      // el click de conectar es el gesto que habilita el audio
              if (musicOn) music.start();
              if (soundOn) sfx.tick(); // blip de bienvenida
            } catch (e) {}
            fire(withWallet ? "Wallet conectada · 500 USDC (demo)" : "¡Adentro! Tenés 60 pts para empezar");
          }} now={now} />
        ) : (
          <>
            <Header balance={balance} points={points} walletOn={walletOn} onWallet={() => setShowWallet(true)} soundOn={soundOn} onSound={toggleSound} musicOn={musicOn} onMusic={toggleMusic} />
            <Ticker items={ticker} />
            <div style={{ padding: "0 16px 130px", position: "relative" }}>
              {view === "feed" && (
                <Feed bets={bets} now={now} tries={tries} onGame={() => setView("game")} onLink={() => setShowLink(true)}
                  onOpen={(id) => { setActiveId(id); setView("detail"); }} />
              )}
              {view === "game" && (
                <Game onBack={() => setView("feed")} tries={tries} onPrize={onPrize} play={play} />
              )}
              {view === "detail" && active && (
                <Detail b={active} now={now} fire={fire}
                  onBack={() => setView("feed")}
                  onBet={placeBet} onResolve={resolve} onClaim={claim} onRefund={refundMy} />
              )}
              {view === "create" && <Create onCreate={createBet} onBack={() => setView("feed")} walletOn={walletOn} />}
              {view === "mine" && (
                <Mine bets={bets} now={now} earned={earned} onInvite={invite}
                  profile={profile} setProfile={setProfile}
                  walletOn={walletOn} walletAddr={WALLET_ADDR} fire={fire}
                  onOpen={(id) => { setActiveId(id); setView("detail"); }} />
              )}
            </div>
            <BottomNav view={view} setView={(v) => { setView(v); if (v !== "detail") setActiveId(null); }} onQuick={() => setShowQuick(true)} />
            {showLink && (
              <LinkModal bets={bets} onClose={() => setShowLink(false)}
                onOpen={(id) => { setShowLink(false); setActiveId(id); setView("detail"); }}
                fire={fire} />
            )}
            {showWallet && (
              <div onClick={() => setShowWallet(false)} style={{
                position: "fixed", inset: 0, zIndex: 40, display: "flex", alignItems: "flex-end", justifyContent: "center",
                background: "rgba(6,3,12,.66)", backdropFilter: "blur(4px)",
              }}>
                <div onClick={(e) => e.stopPropagation()} className="sheet" style={{
                  width: "100%", maxWidth: 440, background: C.bg2, borderRadius: "26px 26px 0 0",
                  border: `1px solid ${C.line}`, borderBottom: "none", padding: "20px 18px 26px", boxSizing: "border-box",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 20 }}>Activá tu saldo USDC</span>
                    <button onClick={() => setShowWallet(false)} className="press" style={{ ...ghost, padding: 6 }}><X size={20} /></button>
                  </div>
                  <p style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 16px" }}>
                    Tu wallet se crea sola desde tu cuenta, sin frases raras ni apps extra. Cargás con tarjeta o cripto y jugás los duelos de plata real. El gas lo paga BARDOOO.
                  </p>
                  <button onClick={activateWallet} className="press" style={{
                    width: "100%", border: "none", borderRadius: 16, padding: "16px", cursor: "pointer",
                    fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.bg,
                    background: `linear-gradient(90deg, ${C.gold}, #ffdd8f)`, boxShadow: `0 10px 30px ${C.gold}44`,
                  }}>Activar wallet (demo: +500 USDC)</button>
                  <p style={{ color: C.faint, fontSize: 11, margin: "12px 0 0", textAlign: "center", lineHeight: 1.5 }}>
                    En la app real: wallet embebida (Privy / Web3Auth) creada desde tu login + depósito con tarjeta.
                  </p>
                </div>
              </div>
            )}
            {showQuick && (
              <QuickModal walletOn={walletOn}
                onClose={() => setShowQuick(false)}
                onCreate={(f) => { setShowQuick(false); createBet(f); }}
                goFull={() => { setShowQuick(false); setView("create"); }} />
            )}
          </>
        )}
        {burst && <Burst />}
        {toast && <Toast t={toast} />}
      </div>
    </div>
  );
}

/* =============================== FONDO =============================== */
function Bg() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: -140, left: -120, width: 380, height: 380, borderRadius: "50%", background: `radial-gradient(circle, ${C.si}14, transparent 65%)` }} />
      <div style={{ position: "absolute", top: 120, right: -160, width: 420, height: 420, borderRadius: "50%", background: `radial-gradient(circle, ${C.no}12, transparent 65%)` }} />
      <div style={{ position: "absolute", bottom: -180, left: "20%", width: 460, height: 460, borderRadius: "50%", background: `radial-gradient(circle, #5B2EA810, transparent 65%)` }} />
    </div>
  );
}

/* =========================== BARRA DE DUELO =========================== */
/* La firma de BARDOOO: costura diagonal, marcador VS en el punto de choque,
   brillo que barre. big=true la agranda para el detalle.                 */
function DuelBar({ pools, big }) {
  const total = pools[0] + pools[1];
  const pSi = total > 0 ? (pools[1] / total) * 100 : 50;
  const pNo = 100 - pSi;
  const h = big ? 58 : 34;
  const seam = Math.min(92, Math.max(8, pSi));
  return (
    <div style={{ position: "relative" }}>
      <div style={{
        display: "flex", height: h, borderRadius: h / 2.6, overflow: "hidden",
        background: C.bg3, border: `1px solid ${C.line}`, position: "relative",
      }}>
        <div style={{
          width: `${pSi}%`, minWidth: 0,
          background: `linear-gradient(90deg, ${C.siDeep}, ${C.si})`,
          clipPath: "polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)",
          display: "flex", alignItems: "center", paddingLeft: 14,
          transition: "width .6s cubic-bezier(.2,.8,.2,1)",
          boxShadow: `inset 0 0 24px ${C.siGlow}`,
        }}>
          <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: big ? 19 : 13, color: "#032018" }}>
            {Math.round(pSi)}%
          </span>
        </div>
        <div style={{
          flex: 1, marginLeft: -12,
          background: `linear-gradient(90deg, ${C.no}, ${C.noDeep})`,
          clipPath: "polygon(12px 0, 100% 0, 100% 100%, 0 100%)",
          display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 14,
          transition: "width .6s cubic-bezier(.2,.8,.2,1)",
          boxShadow: `inset 0 0 24px ${C.noGlow}`,
        }}>
          <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: big ? 19 : 13, color: "#2E0417" }}>
            {Math.round(pNo)}%
          </span>
        </div>
        <div className="shine" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
      </div>
      <div style={{
        position: "absolute", top: "50%", left: `${seam}%`,
        transform: "translate(-50%,-50%) rotate(-8deg)",
        transition: "left .6s cubic-bezier(.2,.8,.2,1)",
        background: C.bg, border: `1px solid ${C.line}`,
        borderRadius: 8, padding: big ? "4px 9px" : "2px 7px",
        fontFamily: "Syne", fontWeight: 800, fontSize: big ? 13 : 10,
        letterSpacing: 1, color: C.text,
        boxShadow: `0 0 14px rgba(0,0,0,.6), 0 0 20px ${C.siGlow}`,
      }}>VS</div>
    </div>
  );
}

function PrivBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
      border: `1px solid ${C.gold}55`, background: `${C.gold}12`, color: C.gold,
      borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, letterSpacing: 1,
    }}>
      <Lock size={10} /> PRIVADA
    </span>
  );
}

function PtsBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
      border: `1px solid ${C.si}55`, background: `${C.si}12`, color: C.si,
      borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, letterSpacing: 1,
    }}>
      <Zap size={10} fill={C.si} /> PUNTOS
    </span>
  );
}

function MultTag({ side, m }) {
  const col = side === 1 ? C.si : C.no;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      border: `1px solid ${col}44`, background: `${col}12`,
      borderRadius: 999, padding: "3px 9px", fontSize: 11.5, fontWeight: 700, color: col,
    }}>
      {side === 1 ? "SÍ" : "NO"} {m == null
        ? <b style={{ fontFamily: "Syne", fontWeight: 800 }}>¡sé el 1ro!</b>
        : <>paga <b style={{ fontFamily: "Syne", fontWeight: 800 }}>{fmtMult(m)}</b></>}
    </span>
  );
}

/* =============================== HEADER =============================== */
/* Marca BARDOOO: el anillo partido — un circulo dividido en teal/magenta, el duelo
   hecho simbolo. Mismo signo en el isotipo, la O del wordmark y el chip de puntos.
   El rayo queda SOLO para el boton de relampago. */
function Mark({ size = 26 }) {
  return (
    <span style={{ display: "inline-block", flexShrink: 0, filter: `drop-shadow(0 0 9px ${C.siGlow}) drop-shadow(0 0 9px ${C.noGlow})` }}>
      <ORing size={size} hole={C.bg} />
    </span>
  );
}

function ORing({ size = 14, hole = C.bg }) {
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size, verticalAlign: "-6%" }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.bg, overflow: "hidden" }}>
        <span style={{ position: "absolute", inset: 0, background: C.si, clipPath: "polygon(0 0, 72% 0, 20% 100%, 0 100%)" }} />
        <span style={{ position: "absolute", inset: 0, background: C.no, clipPath: "polygon(80% 0, 100% 0, 100% 100%, 28% 100%)" }} />
      </span>
      <span style={{ position: "absolute", inset: "27%", borderRadius: "50%", background: hole }} />
    </span>
  );
}

/* Identicon BARDOOO: cada usuario tiene su propio BICHO PIXELADO — sprite 8-bit
   generado deterministicamente de su semilla (wallet o handle) sobre una grilla
   espejada: el hash decide silueta, ojos, boca, antenas/orejas/cuernos y colores.
   Misma semilla = mismo bicho, siempre. */
function hashStr(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function Identicon({ seed, size = 38 }) {
  const h = hashStr(seed || "bardooo");
  const rng = mulberry32(h);
  const W = 12, HH = 12, CELL = 4, OX = 8, OY = 8;
  const h1 = Math.floor(rng() * 360);
  const h2 = (h1 + 100 + Math.floor(rng() * 120)) % 360;
  const body = `hsl(${h1} 82% 58%)`;
  const shade = `hsl(${h1} 78% 40%)`;
  const acc = `hsl(${h2} 92% 60%)`;
  const top = Math.floor(rng() * 4);    // 0 antena · 1 orejas · 2 cuernos · 3 pelado
  const mouthT = Math.floor(rng() * 3); // 0 sonrisa · 1 abierta · 2 seria
  const eyeR = 4 + Math.floor(rng() * 2);
  const eyeC = 3 + Math.floor(rng() * 2);

  const cells = new Map();
  const put = (r, c, col) => { if (r >= 0 && r < HH && c >= 0 && c < W) cells.set(r + "," + c, col); };
  const putM = (r, c, col) => { put(r, c, col); put(r, W - 1 - c, col); };

  // cuerpo: mitad izquierda al azar, espejada (la simetria lo vuelve "bicho")
  for (let r = 1; r < HH; r++) {
    const rowF = r >= 2 && r <= 9 ? 1 : 0.45;
    for (let c = 0; c <= 5; c++) {
      if (rng() < (0.3 + 0.5 * (c / 5)) * rowF) {
        putM(r, c, hashStr(seed + r + ":" + c) % 6 === 0 ? shade : body);
      }
    }
  }
  // zona de la cara siempre maciza (que ojos y boca tengan donde vivir)
  for (let r = eyeR - 1; r <= Math.min(HH - 1, eyeR + 4); r++)
    for (let c = 2; c <= 5; c++) putM(r, c, body);

  // rasgos de arriba
  if (top === 0) { putM(1, 5, body); putM(0, 5, acc); }
  if (top === 1) { putM(1, 1, body); putM(1, 2, body); putM(0, 1, body); }
  if (top === 2) { putM(1, 2, acc); putM(0, 1, acc); }

  // ojos
  putM(eyeR, eyeC, "#FFFFFF");

  // boca
  const mr = eyeR + 3;
  if (mouthT === 0) { putM(mr, 4, "#1A1030"); put(mr + 1, 5, "#1A1030"); put(mr + 1, 6, "#1A1030"); }
  if (mouthT === 1) { put(mr, 5, "#1A1030"); put(mr, 6, "#1A1030"); put(mr + 1, 5, "#1A1030"); put(mr + 1, 6, "#1A1030"); }
  if (mouthT === 2) { for (let c = 4; c <= 7; c++) put(mr, c, "#1A1030"); }

  const rects = [];
  cells.forEach((col, key) => {
    const [r, c] = key.split(",").map(Number);
    rects.push(<rect key={key} x={OX + c * CELL} y={OY + r * CELL} width={CELL} height={CELL} fill={col} />);
  });
  const pupil = (c, k) => (
    <rect key={k} x={OX + c * CELL + 1} y={OY + eyeR * CELL + 1} width="2" height="2" fill="#1A1030" />
  );
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" shapeRendering="crispEdges" style={{ flexShrink: 0, display: "block" }}>
      <circle cx="32" cy="32" r="31" fill={C.bg3} stroke={C.line} strokeWidth="1.5" shapeRendering="auto" />
      {rects}
      {pupil(eyeC, "p1")}
      {pupil(W - 1 - eyeC, "p2")}
    </svg>
  );
}

function Logo({ size = 20 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <Mark size={size + 7} />
      <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: size, letterSpacing: 0.5 }}>BARDOOO</span>
    </div>
  );
}

function Header({ balance, points, walletOn, onWallet, soundOn, onSound, musicOn, onMusic }) {
  const audioBtn = (on, col) => ({
    width: 34, height: 32, border: "none", background: "transparent", cursor: "pointer",
    display: "grid", placeItems: "center", color: on ? col : C.faint,
  });
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 20, background: `${C.bg}e8`, backdropFilter: "blur(14px)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "13px 14px 10px", borderBottom: `1px solid ${C.line}`, gap: 10,
    }}>
      <Logo size={18} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {/* audio: una sola capsula, dos iconos */}
        <div style={{
          display: "flex", alignItems: "center", background: C.bg2,
          border: `1px solid ${C.line}`, borderRadius: 999, overflow: "hidden", flexShrink: 0,
        }}>
          <button onClick={onMusic} className={"press" + (musicOn ? " sway" : "")}
            title={musicOn ? "Parar música" : "Música"} style={audioBtn(musicOn, C.gold)}>
            <Music size={14} />
          </button>
          <div style={{ width: 1, height: 16, background: C.line }} />
          <button onClick={onSound} title={soundOn ? "Silenciar" : "Activar sonido"}
            className="press" style={audioBtn(soundOn, C.si)}>
            {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
        </div>

        {/* saldo: una sola capsula, puntos + plata */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, background: C.bg2,
          border: `1px solid ${C.line}`, borderRadius: 999,
          padding: walletOn ? "7px 12px 7px 11px" : "4px 4px 4px 11px",
          whiteSpace: "nowrap", flexShrink: 0,
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <ORing size={13} hole={C.bg2} />
            <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 13.5, color: C.si }}>
              <Num v={points} />
            </span>
          </span>
          <div style={{ width: 1, height: 15, background: C.line }} />
          {walletOn ? (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <CircleDot size={12} color={C.gold} />
              <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 13.5, color: C.gold }}>
                <Money v={balance} />
              </span>
            </span>
          ) : (
            <button onClick={onWallet} className="press" style={{
              border: "none", background: `${C.gold}1c`, color: C.gold, borderRadius: 999,
              padding: "6px 11px", fontWeight: 800, fontSize: 11.5, cursor: "pointer",
              fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5,
            }}>
              <Wallet size={12} /> Activar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ========================= TICKER DE ACTIVIDAD ========================= */
function Ticker({ items }) {
  const row = items.map((e, i) => (
    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginRight: 26, fontSize: 12, color: C.dim }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: e.side === 1 ? C.si : C.no }} />
      <b style={{ color: C.text, fontWeight: 600 }}>{e.u}</b> metió {amt(e.cur, e.amt)} al
      <b style={{ color: e.side === 1 ? C.si : C.no, fontWeight: 800 }}>{e.side === 1 ? "SÍ" : "NO"}</b>
    </span>
  ));
  return (
    <div style={{ overflow: "hidden", borderBottom: `1px solid ${C.line}`, background: `${C.bg2}88`, padding: "7px 0", position: "relative", zIndex: 10 }}>
      <div className="marquee" style={{ display: "inline-flex", whiteSpace: "nowrap", paddingLeft: 16 }}>
        {row}{row}
      </div>
    </div>
  );
}

/* =============================== CONNECT =============================== */
function Connect({ onConnect, now }) {
  const wob = (now / 1000) % 40;
  const demo = [95 + wob, 140 - wob];
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", padding: 24, position: "relative" }}>
      <div style={{ position: "relative", marginTop: 36 }}><Logo size={28} /></div>

      <div style={{ position: "relative", marginTop: "auto", marginBottom: 26 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: C.faint, marginBottom: 12 }}>
          LA ARENA DE APUESTAS ENTRE AMIGOS
        </div>
        <h1 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 52, lineHeight: 0.98, margin: "0 0 16px", letterSpacing: -1 }}>
          Elegí<br />tu <span style={{ color: C.si }}>la</span><span style={{ color: C.no }}>do</span>.
        </h1>
        <p style={{ color: C.dim, fontSize: 16, margin: "0 0 26px", maxWidth: 320, lineHeight: 1.5 }}>
          Cualquiera crea la apuesta. La gente pone el pozo. El lado que pierde le paga al que gana. Sin casa, sin cuotas raras.
        </p>

        <div style={{ background: `${C.bg2}cc`, border: `1px solid ${C.line}`, borderRadius: 20, padding: 16, marginBottom: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, color: C.dim }}>¿La Mona da el primer golpe?</span>
            <Live />
          </div>
          <DuelBar pools={demo} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <MultTag side={1} m={multFor(demo, 1, 1000)} />
            <MultTag side={0} m={multFor(demo, 0, 1000)} />
          </div>
        </div>

        <button onClick={() => onConnect(false)} className="press" style={{
          width: "100%", border: "none", borderRadius: 18, padding: "18px",
          fontFamily: "Syne", fontWeight: 800, fontSize: 17, color: C.bg, cursor: "pointer",
          background: "#FFFFFF",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        }}>
          <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 17 }}>G</span> Continuar con Google
        </button>
        <button onClick={() => onConnect(false)} className="press" style={{
          width: "100%", borderRadius: 18, padding: "16px", marginTop: 10, cursor: "pointer",
          fontFamily: "Syne", fontWeight: 800, fontSize: 15, color: C.text,
          background: "transparent", border: `1.5px solid ${C.line}`,
        }}>Entrar con email</button>
        <button onClick={() => onConnect(true)} className="press" style={{
          ...ghost, width: "100%", justifyContent: "center", marginTop: 12, fontSize: 13,
        }}>
          <Wallet size={15} /> Ya tengo wallet
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, color: C.faint, fontSize: 12 }}>
          <ShieldCheck size={14} /> Jugás gratis con puntos · la wallet, cuando vos quieras
        </div>
      </div>
    </div>
  );
}

function Live() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, color: C.no }}>
      <span className="blink" style={{ width: 6, height: 6, borderRadius: 99, background: C.no, boxShadow: `0 0 8px ${C.no}` }} />
      EN VIVO
    </span>
  );
}

/* =============================== FEED =============================== */
function Feed({ bets, now, onOpen, tries, onGame, onLink }) {
  const open = bets.filter((b) => !b.isPrivate && (b.status === "open" || b.status === "locked"));
  return (
    <div style={{ paddingTop: 16 }}>
      <div onClick={tries > 0 ? onGame : undefined} className={tries > 0 ? "press rise" : "rise"} style={{
        display: "flex", alignItems: "center", gap: 12, cursor: tries > 0 ? "pointer" : "default",
        background: `linear-gradient(90deg, ${C.gold}1e, ${C.bg2})`,
        border: `1px solid ${C.gold}${tries > 0 ? "66" : "33"}`,
        borderRadius: 18, padding: "13px 15px", marginBottom: 16, opacity: tries > 0 ? 1 : 0.6,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 13, display: "grid", placeItems: "center",
          background: C.bg3, border: `1px solid ${C.gold}55`, boxShadow: `0 0 18px ${C.gold}33`, flexShrink: 0,
        }}>
          <Mark size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 15 }}>La Ficha · bonus diario</div>
          <div style={{ color: C.dim, fontSize: 12 }}>
            {tries > 0 ? `Volá entre pilares: 1 pt por caño, hasta 15 · ${tries} ${tries === 1 ? "vuelo" : "vuelos"}` : "Sin vuelos por hoy. Mañana hay más"}
          </div>
        </div>
        {tries > 0 && <ArrowRight size={16} color={C.gold} />}
      </div>

      <button onClick={onLink} className="press" style={{
        ...ghost, width: "100%", justifyContent: "center", gap: 6, marginBottom: 14, fontSize: 12.5,
        border: `1px dashed ${C.line}`, borderRadius: 12, padding: "9px 0",
      }}>
        <Link2 size={14} /> ¿Te pasaron una apuesta? Abrila con el link
      </button>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: C.faint }}>LA ARENA</div>
          <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 24 }}>Duelos abiertos</div>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.dim, fontSize: 12.5 }}>
          <Flame size={14} color={C.no} /> {open.length} calientes
        </span>
      </div>
      {open.map((b, i) => <BetCard key={b.id} b={b} now={now} onOpen={onOpen} delay={i * 70} />)}
    </div>
  );
}

function BetCard({ b, now, onOpen, delay = 0 }) {
  const left = b.closeTime - now;
  const closed = b.status !== "open" || left <= 0;
  const fee = PLATFORM_BPS + b.creatorBps;
  const hitCol = b.lastHit && now - b.lastHit.t < 1500 ? (b.lastHit.side === 1 ? C.si : C.no) : null;
  return (
    <div onClick={() => onOpen(b.id)} className={"press rise" + (hitCol ? " hit" : "")} style={{
      "--hit": hitCol ? hitCol + "55" : "transparent",
      background: `linear-gradient(160deg, ${C.bg2}, ${C.bg2}dd)`,
      border: `1px solid ${hitCol ? hitCol + "88" : C.line}`, borderRadius: 22,
      padding: 16, marginBottom: 14, cursor: "pointer",
      animationDelay: `${delay}ms`, transition: "border-color .4s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
        <Avatar c={b.creator} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{b.creator.name}</div>
          <div style={{ color: C.faint, fontSize: 11.5 }}>{b.creator.handle}</div>
        </div>
        {b.isPrivate && <PrivBadge />}
        {b.currency === "pts" && <PtsBadge />}
        <Timer closed={closed} left={left} />
      </div>

      <div style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 18.5, lineHeight: 1.22, marginBottom: 13 }}>
        {b.question}
      </div>

      <DuelBar pools={b.pools} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {b.pools[0] + b.pools[1] === 0 ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            border: `1px solid ${C.gold}44`, background: `${C.gold}10`,
            borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 700, color: C.gold,
          }}>
            <Sparkles size={11} /> Recién lanzada — abrí el pozo
          </span>
        ) : (<>
        <MultTag side={1} m={multFor(b.pools, 1, fee)} />
        <MultTag side={0} m={multFor(b.pools, 0, fee)} />
        </>)}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, color: C.dim, fontSize: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Users size={12} /> {b.bettors}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, color: C.gold, fontWeight: 700 }}>
            <CircleDot size={12} /> <Amt cur={b.currency} v={b.pools[0] + b.pools[1]} />
          </span>
        </span>
      </div>
    </div>
  );
}

/* =============================== DETAIL =============================== */
function Detail({ b, now, onBack, onBet, onResolve, onClaim, onRefund, fire }) {
  const lockedSide = b.myStake[1] > 0 ? 1 : b.myStake[0] > 0 ? 0 : null;
  const [option, setOption] = useState(lockedSide ?? 1);
  const [amount, setAmount] = useState(b.stakeMode === "fixed" ? b.fixedAmount : b.minStake);
  useEffect(() => { setOption(lockedSide ?? 1); }, [b.id]);

  const left = b.closeTime - now;
  const closed = b.status !== "open" || left <= 0;
  const canResolve = b.creator.mine && b.status === "locked";
  const fee = PLATFORM_BPS + b.creatorBps;
  const total = b.pools[0] + b.pools[1];
  const pSi = total > 0 ? Math.round((b.pools[1] / total) * 100) : 50;
  const heroHit = b.lastHit && now - b.lastHit.t < 1500 ? (b.lastHit.side === 1 ? C.si : C.no) : null;

  const est = useMemo(() => {
    const pools = [...b.pools];
    if (!closed) pools[option] += Number(amount) || 0;
    return payoutFor(pools, option, (b.myStake[option] + (closed ? 0 : Number(amount) || 0)), fee);
  }, [b, option, amount, closed, fee]);

  const myPay = b.status === "resolved"
    ? payoutFor(b.pools, b.winningOption, b.myStake[b.winningOption], fee) : 0;

  const share = () => {
    const txt = `🔥 ${b.question} — ¿SÍ o NO? Entrá a BARDOOO y jugá: bardooo.app/bet/${b.id}${b.code ? ` · código: ${b.code}` : ""}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(() => fire("Link copiado · si alguien entra con tu link, sumás 25 pts"));
    else fire("No se pudo copiar", "err");
  };

  return (
    <div style={{ paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onBack} className="press" style={ghost}><ChevronLeft size={18} /> Volver</button>
        <button onClick={share} className="press" style={{ ...ghost, gap: 6 }}><Share2 size={15} /> Compartir</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 12px" }}>
        <Avatar c={b.creator} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{b.creator.name}</div>
          <div style={{ color: C.faint, fontSize: 11.5 }}>{b.creator.handle}</div>
        </div>
        {b.isPrivate && <PrivBadge />}
        {b.currency === "pts" && <PtsBadge />}
        <Timer closed={closed} left={left} />
      </div>

      <h2 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 27, lineHeight: 1.12, margin: "0 0 16px", letterSpacing: -0.5 }}>
        {b.question}
      </h2>

      {/* hero del duelo */}
      <div className={heroHit ? "hit" : ""} style={{
        "--hit": heroHit ? heroHit + "55" : "transparent",
        background: `${C.bg2}cc`, border: `1px solid ${heroHit ? heroHit + "88" : C.line}`,
        borderRadius: 22, padding: 18, marginBottom: 16, transition: "border-color .4s",
      }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: C.si }}>SÍ</div>
            <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 44, lineHeight: 1, color: C.si, textShadow: `0 0 26px ${C.siGlow}` }}>
              {pSi}<span style={{ fontSize: 20 }}>%</span>
            </div>
            <div style={{ color: C.dim, fontSize: 12.5, marginTop: 3 }}><Amt cur={b.currency} v={b.pools[1]} /></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: C.no }}>NO</div>
            <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 44, lineHeight: 1, color: C.no, textShadow: `0 0 26px ${C.noGlow}` }}>
              {100 - pSi}<span style={{ fontSize: 20 }}>%</span>
            </div>
            <div style={{ color: C.dim, fontSize: 12.5, marginTop: 3 }}><Amt cur={b.currency} v={b.pools[0]} /></div>
          </div>
        </div>
        <div style={{ margin: "12px 0 12px" }}><DuelBar pools={b.pools} big /></div>
        <div style={{ display: "flex", gap: 14, color: C.dim, fontSize: 12.5 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Users size={13} /> {b.bettors} jugando</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.gold, fontWeight: 700 }}>
            <CircleDot size={13} /> <Amt cur={b.currency} v={total} /> en el pozo
          </span>
        </div>
      </div>

      {b.isPrivate && b.creator.mine && b.status !== "resolved" && b.status !== "cancelled" && (
        <div style={{
          background: `linear-gradient(160deg, ${C.gold}12, ${C.bg2})`,
          border: `1px solid ${C.gold}55`, borderRadius: 18, padding: 16, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, color: C.gold }}>
            <Lock size={14} /> <span style={{ fontWeight: 700, fontSize: 13 }}>Solo entra quien tiene el link</span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            background: `${C.bg}99`, border: `1px solid ${C.line}`, borderRadius: 12,
            padding: "9px 12px", marginBottom: 12, fontSize: 13.5,
          }}>
            <span style={{ color: C.dim }}>bardooo.app/bet/{b.id}</span>
            {b.code && (
              <span style={{
                marginLeft: "auto", border: `1px solid ${C.gold}55`, background: `${C.gold}14`,
                borderRadius: 8, padding: "2px 8px", color: C.gold, fontWeight: 800, fontSize: 12, letterSpacing: 1,
              }}>código: {b.code}</span>
            )}
          </div>
          <button onClick={share} className="press" style={{
            width: "100%", border: "none", borderRadius: 14, padding: "14px", cursor: "pointer",
            fontFamily: "Syne", fontWeight: 800, fontSize: 15, color: C.bg,
            background: `linear-gradient(90deg, ${C.gold}, #ffdd8f)`, boxShadow: `0 8px 24px ${C.gold}33`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <Share2 size={17} /> Copiar link de invitación
          </button>
        </div>
      )}

      {b.status === "resolved" ? (
        <Resolved b={b} myPay={myPay} onClaim={onClaim} />
      ) : b.status === "cancelled" ? (
        (b.myStake[0] + b.myStake[1] > 0 && !b.claimed) ? (
          <button onClick={() => onRefund(b.id)} className="press" style={{
            width: "100%", borderRadius: 18, padding: "17px", cursor: "pointer",
            fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.si,
            background: "transparent", border: `2px solid ${C.si}`,
          }}>Recuperar {amt(b.currency, b.myStake[0] + b.myStake[1])}</button>
        ) : (
          <Banner color={C.no} text="Apuesta anulada — se devuelve lo apostado." />
        )
      ) : canResolve ? (
        <ResolvePanel b={b} onResolve={onResolve} />
      ) : closed ? (
        <Banner color={C.gold} text="Apuestas cerradas. El creador carga el resultado cuando termina el evento." />
      ) : (
        <BetPanel b={b} option={option} setOption={setOption} amount={amount} setAmount={setAmount}
          est={est} fee={fee} onBet={onBet} lockedSide={lockedSide} fire={fire} />
      )}

      {(b.myStake[0] > 0 || b.myStake[1] > 0) && (
        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          {b.myStake[1] > 0 && <Chip col={C.si} label="tu SÍ" v={amt(b.currency, b.myStake[1])} />}
          {b.myStake[0] > 0 && <Chip col={C.no} label="tu NO" v={amt(b.currency, b.myStake[0])} />}
        </div>
      )}
    </div>
  );
}

function BetPanel({ b, option, setOption, amount, setAmount, est, fee, onBet, lockedSide, fire }) {
  const pickSi = () => lockedSide === 0 ? fire("Ya estás del lado del NO en esta apuesta", "err") : setOption(1);
  const pickNo = () => lockedSide === 1 ? fire("Ya estás del lado del SÍ en esta apuesta", "err") : setOption(0);
  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <Choice on={option === 1} disabled={lockedSide === 0} col={C.si} glow={C.siGlow}
          label="SÍ" sub={subFor(b, 1, fee)} onClick={pickSi} />
        <Choice on={option === 0} disabled={lockedSide === 1} col={C.no} glow={C.noGlow}
          label="NO" sub={subFor(b, 0, fee)} onClick={pickNo} />
      </div>

      {b.stakeMode === "fixed" ? (
        <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 16, padding: 15, marginBottom: 14, textAlign: "center" }}>
          <div style={{ color: C.dim, fontSize: 12.5, marginBottom: 3 }}>Monto fijo de esta apuesta</div>
          <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 30, color: C.gold }}>{amt(b.currency, b.fixedAmount)}</div>
        </div>
      ) : (
        <>
          <Stepper label="Tu apuesta" value={Number(amount) || 0}
            prefix={b.currency === "usdc" ? "$" : undefined}
            suffix={b.currency === "pts" ? "pts" : undefined}
            steps={[-25, -5, 5, 25]}
            min={b.minStake} max={b.stakeMode === "capped" ? b.maxStake : undefined}
            onChange={setAmount} color={b.currency === "pts" ? C.si : C.gold} />
        </>
      )}

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: `linear-gradient(90deg, ${option === 1 ? C.si : C.no}10, transparent)`,
        border: `1px solid ${(option === 1 ? C.si : C.no)}33`,
        borderRadius: 14, padding: "13px 16px", marginBottom: 12,
      }}>
        <span style={{ color: C.dim, fontSize: 13 }}>Si ganás, cobrás ≈</span>
        <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 24, color: option === 1 ? C.si : C.no }}>{amt(b.currency, est)}</span>
      </div>
      <p style={{ color: C.faint, fontSize: 11.5, margin: "0 0 14px", lineHeight: 1.5 }}>
        Estimado: el pago final depende de cómo cierren los pozos. Comisión total {(fee / 100).toFixed(0)}% (creador + plataforma), sale del pozo y nunca cobrás menos de lo que pusiste.
      </p>

      <button onClick={() => onBet(b.id, option, Number(amount))} className="press" style={{
        width: "100%", border: "none", borderRadius: 18, padding: "18px", cursor: "pointer",
        fontFamily: "Syne", fontWeight: 800, fontSize: 17, color: C.bg,
        background: option === 1 ? `linear-gradient(90deg, ${C.si}, #7cf7de)` : `linear-gradient(90deg, ${C.no}, #ff7ab0)`,
        boxShadow: `0 10px 30px ${option === 1 ? C.siGlow : C.noGlow}`,
      }}>
        {b.myStake[option] > 0 ? "Sumar" : "Meter"} {amt(b.currency, Number(amount) || 0)} al {option === 1 ? "SÍ" : "NO"}
      </button>
    </div>
  );
}

function subFor(b, side, fee) {
  const m = multFor(b.pools, side, fee);
  if (m != null) return `paga ${fmtMult(m)}`;
  const total = b.pools[0] + b.pools[1];
  return total === 0 ? "abrí el pozo" : "¡sé el 1ro y llevate todo!";
}

function Choice({ on, col, label, glow, onClick, disabled, sub }) {
  return (
    <button onClick={onClick} className="press" style={{
      flex: 1, borderRadius: 20, padding: "16px 0 13px", cursor: disabled ? "not-allowed" : "pointer",
      background: on ? col : "transparent",
      border: `2px solid ${disabled ? C.line : col}`,
      opacity: disabled ? 0.45 : 1,
      boxShadow: on ? `0 10px 30px ${glow}` : "none",
      transition: "all .18s", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
    }}>
      <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 27, color: on ? C.bg : (disabled ? C.faint : col) }}>
        {label}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: on ? `${C.bg}cc` : C.dim }}>
        {sub}
      </span>
    </button>
  );
}

function ResolvePanel({ b, onResolve }) {
  const [confirm, setConfirm] = useState(null); // null | 0 | 1
  const col = confirm === 1 ? C.si : C.no;
  const lado = confirm === 1 ? "SÍ" : "NO";
  return (
    <>
      <div style={{ background: `linear-gradient(160deg, ${C.gold}14, ${C.bg2})`, border: `1px solid ${C.gold}55`, borderRadius: 20, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, color: C.gold }}>
          <Trophy size={16} /> <span style={{ fontWeight: 700, fontSize: 14 }}>Sos el creador</span>
        </div>
        <p style={{ color: C.dim, fontSize: 13, margin: "0 0 14px", lineHeight: 1.5 }}>
          La apuesta cerró. Cargá el resultado real: los ganadores cobran y vos recibís tu comisión.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => setConfirm(1)} className="press" style={resolveBtn(C.si)}>Ganó el SÍ</button>
          <button onClick={() => setConfirm(0)} className="press" style={resolveBtn(C.no)}>Ganó el NO</button>
        </div>
      </div>

      {confirm !== null && (
        <div onClick={() => setConfirm(null)} style={{
          position: "fixed", inset: 0, zIndex: 45, display: "grid", placeItems: "center",
          background: "rgba(6,3,12,.72)", backdropFilter: "blur(4px)", padding: 20,
        }}>
          <div onClick={(e) => e.stopPropagation()} className="rise" style={{
            width: "100%", maxWidth: 380, background: C.bg2, border: `1px solid ${col}66`,
            borderRadius: 22, padding: "22px 20px", boxSizing: "border-box", textAlign: "center",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, color: C.dim, marginBottom: 8 }}>
              CONFIRMÁ EL RESULTADO
            </div>
            <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 32, color: col, textShadow: `0 0 26px ${col}55`, marginBottom: 10 }}>
              Ganó el {lado}
            </div>
            <p style={{ color: C.dim, fontSize: 13, lineHeight: 1.55, margin: "0 0 18px" }}>
              "{b.question}"<br />
              Los que apostaron al <b style={{ color: col }}>{lado}</b> cobran el pozo.
              <b style={{ color: C.text }}> Esto no se puede deshacer.</b>
            </p>
            <button onClick={() => { const o = confirm; setConfirm(null); onResolve(b.id, o); }} className="press" style={{
              width: "100%", border: "none", borderRadius: 16, padding: "16px", cursor: "pointer",
              fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.bg,
              background: col, boxShadow: `0 10px 28px ${col}44`,
            }}>Sí, ganó el {lado}</button>
            <button onClick={() => setConfirm(null)} className="press" style={{
              ...ghost, width: "100%", justifyContent: "center", marginTop: 10, fontSize: 14,
            }}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  );
}

function Resolved({ b, myPay, onClaim }) {
  const won = b.winningOption;
  const col = won === 1 ? C.si : C.no;
  const iWon = b.myStake[won] > 0;
  return (
    <div>
      <div style={{
        background: `linear-gradient(160deg, ${col}14, ${C.bg2})`, border: `1px solid ${col}66`,
        borderRadius: 20, padding: 20, marginBottom: 14, textAlign: "center",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, color: C.dim, marginBottom: 6 }}>RESULTADO</div>
        <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 34, color: col, textShadow: `0 0 30px ${col}55` }}>
          Ganó el {won === 1 ? "SÍ" : "NO"}
        </div>
      </div>
      {iWon ? (
        b.claimed ? (
          <Banner color={C.si} text={`Ya cobraste ${amt(b.currency, myPay)}. ¡Bien jugado!`} />
        ) : (
          <button onClick={() => onClaim(b.id)} className="press" style={{
            width: "100%", border: "none", borderRadius: 18, padding: "18px", cursor: "pointer",
            fontFamily: "Syne", fontWeight: 800, fontSize: 18, color: C.bg,
            background: `linear-gradient(90deg, ${C.gold}, #ffdd8f)`, boxShadow: `0 10px 30px ${C.gold}44`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}>
            <Trophy size={20} /> Cobrar {amt(b.currency, myPay)}
          </button>
        )
      ) : (
        <Banner color={C.faint} text="Esta vez no fue. La revancha se crea en un minuto." />
      )}
    </div>
  );
}

/* =============================== CREATE =============================== */
const DURATIONS = [
  { label: "30 min", v: "30" },
  { label: "1 h", v: "60" },
  { label: "2 h", v: "120" },
  { label: "Configurable", v: "custom" },
];

function Create({ onCreate, onBack, walletOn }) {
  const [isPrivate, setIsPrivate] = useState(false);
  const [code, setCode] = useState("");
  const [question, setQuestion] = useState("");
  const [stakeMode, setStakeMode] = useState("free");
  const [fixedAmount, setFixedAmount] = useState(20);
  const [maxStake, setMaxStake] = useState(50);
  const [minStake, setMinStake] = useState(5);
  const [maxBettors, setMaxBettors] = useState(0);
  const [creatorBps, setCreatorBps] = useState(700);

  const defaultStart = toLocalInput(new Date(Date.now() + 60 * 60000));
  const [timeMode, setTimeMode] = useState("guided"); // guided | manual
  const [eventAt, setEventAt] = useState(defaultStart);
  const [durChoice, setDurChoice] = useState("120");
  const [customQty, setCustomQty] = useState(3);
  const [customUnit, setCustomUnit] = useState("days"); // minutes | hours | days
  const [resolveAt, setResolveAt] = useState(toLocalInput(new Date(Date.now() + 3 * 60 * 60000)));

  const unitMins = { minutes: 1, hours: 60, days: 60 * 24 };
  const durM = durChoice === "custom"
    ? Math.max(1, Number(customQty) || 0) * unitMins[customUnit]
    : Number(durChoice);
  const eventTime = Date.parse(eventAt);
  const closeTime = isNaN(eventTime) ? NaN : eventTime - CLOSE_OFFSET_MIN * 60000;
  const resolveTime = timeMode === "manual" ? Date.parse(resolveAt) : (isNaN(eventTime) ? NaN : eventTime + durM * 60000);

  const timeOk = !isNaN(closeTime) && closeTime > Date.now() && !isNaN(resolveTime) && resolveTime > eventTime;
  const valid = question.trim().length > 6 && timeOk;

  const submit = () => valid && onCreate({
    question: question.trim(), stakeMode, fixedAmount: Number(fixedAmount),
    maxStake: Number(maxStake), minStake: Number(minStake),
    maxBettors: Number(maxBettors), creatorBps, isPrivate, code: isPrivate ? code.trim() : "",
    closeTime, resolveTime,
  });

  return (
    <div style={{ paddingTop: 12 }}>
      <button onClick={onBack} className="press" style={ghost}><ChevronLeft size={18} /> Volver</button>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: C.faint, margin: "10px 0 2px" }}>NUEVO DUELO</div>
      <h2 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 27, margin: "0 0 18px" }}>Crear apuesta</h2>

      <Label>La pregunta (se responde SÍ o NO)</Label>
      <textarea value={question} onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ej: ¿La Mona da el primer golpe en el round 1?"
        rows={2} style={{
          width: "100%", boxSizing: "border-box", background: C.bg2, border: `1px solid ${C.line}`,
          borderRadius: 14, padding: 14, color: C.text, fontSize: 16, fontFamily: "inherit",
          resize: "none", outline: "none", marginBottom: 18,
        }} />

      <Label>Visibilidad</Label>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[[false, "Pública"], [true, "Privada (solo con link)"]].map(([k, l]) => (
          <Seg key={String(k)} on={isPrivate === k} col={k ? C.gold : C.si} onClick={() => setIsPrivate(k)}>{l}</Seg>
        ))}
      </div>
      {isPrivate && (
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12}
          placeholder="Código de acceso (opcional)" style={{
            width: "100%", boxSizing: "border-box", background: C.bg2, border: `1px solid ${C.gold}44`,
            borderRadius: 12, padding: "12px 14px", color: C.gold, fontSize: 15, outline: "none",
            fontFamily: "inherit", fontWeight: 700, letterSpacing: 1, marginBottom: 14,
          }} />
      )}

      <Label>Modo de monto</Label>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["free", "Libre"], ["fixed", "Fijo"]].map(([k, l]) => (
          <Seg key={k} on={stakeMode === k} col={C.si} onClick={() => setStakeMode(k)}>{l}</Seg>
        ))}
      </div>

      {stakeMode === "fixed" && <NumField label="Monto fijo para todos" v={fixedAmount} set={setFixedAmount} />}
      {stakeMode !== "fixed" && <NumField label="Apuesta mínima" v={minStake} set={setMinStake} />}
      <NumField label="Máx. de apostadores (0 = sin límite)" v={maxBettors} set={setMaxBettors} />

      <div style={{ height: 1, background: C.line, margin: "6px 0 18px" }} />
      <Label>¿Cuándo se juega?</Label>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["guided", "Guiada"], ["manual", "Manual"]].map(([k, l]) => (
          <Seg key={k} on={timeMode === k} col={C.gold} onClick={() => setTimeMode(k)}>{l}</Seg>
        ))}
      </div>

      <DateField label="Fecha y hora del evento" v={eventAt} set={setEventAt} />

      {timeMode === "guided" ? (
        <>
          <Label>Duración (para saber cuándo cargar el resultado)</Label>
          <div style={{ display: "flex", gap: 8, marginBottom: durChoice === "custom" ? 12 : 6, flexWrap: "wrap" }}>
            {DURATIONS.map((d) => (
              <Seg key={d.v} grow on={durChoice === d.v} col={C.si} onClick={() => setDurChoice(d.v)}>{d.label}</Seg>
            ))}
          </div>
          {durChoice === "custom" && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <Label>Cantidad</Label>
                <input type="number" min={1} value={customQty} onChange={(e) => setCustomQty(e.target.value)} style={{
                  width: "100%", boxSizing: "border-box", background: C.bg2, border: `1px solid ${C.line}`,
                  borderRadius: 12, padding: "12px 14px", color: C.text, fontSize: 16, outline: "none", fontFamily: "inherit",
                }} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["minutes", "min"], ["hours", "horas"], ["days", "días"]].map(([k, l]) => (
                  <Seg key={k} pad on={customUnit === k} col={C.si} onClick={() => setCustomUnit(k)}>{l}</Seg>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <DateField label="Fecha y hora de fin" v={resolveAt} set={setResolveAt} />
      )}

      <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, margin: "6px 0 18px" }}>
        <Row k="Las apuestas cierran" v={fmtDateTime(closeTime)} note={`${CLOSE_OFFSET_MIN} min antes`} />
        <div style={{ height: 1, background: C.line, margin: "10px 0" }} />
        <Row k="Resultado a partir de" v={fmtDateTime(resolveTime)} col={C.gold} />
        {!timeOk && (
          <div style={{ color: C.no, fontSize: 12, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <X size={14} /> {isNaN(eventTime) ? "Elegí fecha y hora del evento" :
              closeTime <= Date.now() ? "El evento es muy pronto: el cierre ya pasó" :
              "El resultado tiene que ser después del evento"}
          </div>
        )}
      </div>

      <Label>Tu comisión de creador: {(creatorBps / 100).toFixed(1)}%</Label>
      <input type="range" min={0} max={MAX_CREATOR_BPS} step={50} value={creatorBps}
        onChange={(e) => setCreatorBps(Number(e.target.value))}
        style={{ width: "100%", accentColor: C.gold, marginBottom: 6 }} />
      <p style={{ color: C.faint, fontSize: 11.5, margin: "0 0 20px", lineHeight: 1.5 }}>
        Máximo {MAX_CREATOR_BPS / 100}%. La plataforma suma {PLATFORM_BPS / 100}% aparte. La comisión sale del pozo y nunca hace que un ganador cobre menos de lo que puso.
      </p>

      <p style={{ color: C.faint, fontSize: 11.5, margin: "0 0 12px", lineHeight: 1.5, textAlign: "center" }}>
        {walletOn ? "Sale en USDC y también en puntos, para que juegue toda tu audiencia." : "Se juega con puntos. Activá tu wallet para lanzar también en USDC."}
      </p>
      <button onClick={submit} disabled={!valid} className="press" style={{
        width: "100%", border: "none", borderRadius: 18, padding: "18px", cursor: valid ? "pointer" : "not-allowed",
        fontFamily: "Syne", fontWeight: 800, fontSize: 17, color: C.bg, opacity: valid ? 1 : .4,
        background: `linear-gradient(90deg, ${C.gold}, ${C.si})`,
        boxShadow: valid ? `0 10px 30px ${C.gold}33` : "none",
      }}>Lanzar duelo</button>
    </div>
  );
}

/* =================== ABRIR APUESTA POR LINK (privadas) =================== */
function LinkModal({ bets, onClose, onOpen, fire }) {
  const [txt, setTxt] = useState("");
  const [pend, setPend] = useState(null); // apuesta encontrada que pide codigo
  const [codeIn, setCodeIn] = useState("");
  const open = () => {
    const m = /(\d+)\s*$/.exec(txt.trim().replace(/\s*·.*$/, ""));
    const b = m && bets.find((x) => x.id === Number(m[1]));
    if (!b) return fire("No encontramos esa apuesta. Revisá el link", "err");
    if (b.code) { setPend(b); return; }
    onOpen(b.id);
  };
  const unlock = () => {
    if (codeIn.trim().toUpperCase() === pend.code.toUpperCase()) onOpen(pend.id);
    else fire("Código incorrecto", "err");
  };
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 40, display: "flex", alignItems: "flex-end", justifyContent: "center",
      background: "rgba(6,3,12,.66)", backdropFilter: "blur(4px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{
        width: "100%", maxWidth: 440, background: C.bg2, borderRadius: "26px 26px 0 0",
        border: `1px solid ${C.line}`, borderBottom: "none", padding: "18px 18px 26px", boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link2 size={17} color={C.si} />
            <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 19 }}>Abrir con link</span>
          </div>
          <button onClick={onClose} className="press" style={{ ...ghost, padding: 6 }}><X size={20} /></button>
        </div>
        {!pend ? (<>
          <input value={txt} onChange={(e) => setTxt(e.target.value)} autoFocus
            placeholder="bardooo.app/bet/7" style={{
              width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.line}`,
              borderRadius: 14, padding: "13px 14px", color: C.text, fontSize: 16, outline: "none",
              fontFamily: "inherit", marginBottom: 12,
            }} />
          <button onClick={open} className="press" style={{
            width: "100%", border: "none", borderRadius: 16, padding: "15px", cursor: "pointer",
            fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.bg,
            background: `linear-gradient(90deg, ${C.si}, #7cf7de)`,
          }}>Abrir la apuesta</button>
        </>) : (<>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: C.gold }}>
            <Lock size={15} /> <span style={{ fontSize: 13.5, fontWeight: 700 }}>Esta apuesta pide código de acceso</span>
          </div>
          <input value={codeIn} onChange={(e) => setCodeIn(e.target.value.toUpperCase())} autoFocus maxLength={12}
            placeholder="Código" style={{
              width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.gold}55`,
              borderRadius: 14, padding: "13px 14px", color: C.gold, fontSize: 17, outline: "none",
              fontFamily: "inherit", fontWeight: 800, letterSpacing: 2, textAlign: "center", marginBottom: 12,
            }} />
          <button onClick={unlock} className="press" style={{
            width: "100%", border: "none", borderRadius: 16, padding: "15px", cursor: "pointer",
            fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.bg,
            background: `linear-gradient(90deg, ${C.gold}, #ffdd8f)`,
          }}>Entrar</button>
        </>)}
        <p style={{ color: C.faint, fontSize: 11, margin: "12px 0 0", textAlign: "center", lineHeight: 1.5 }}>
          Las privadas no aparecen en la Arena: solo entra quien tiene el link.
        </p>
      </div>
    </div>
  );
}

/* ======================= RELÁMPAGO (bottom sheet) ======================= */
function QuickModal({ onClose, onCreate, goFull, walletOn }) {
  const [question, setQuestion] = useState("");
  const [stakeMode, setStakeMode] = useState("free");
  const [fixedAmount, setFixedAmount] = useState(20);
  const [windowMin, setWindowMin] = useState(15); // 5 a 60, de a 5
  const [isPrivate, setIsPrivate] = useState(false);
  const [code, setCode] = useState("");
  const valid = question.trim().length > 6 && (stakeMode !== "fixed" || Number(fixedAmount) > 0);

  const submit = () => {
    if (!valid) return;
    const launch = Date.now();
    onCreate({
      question: question.trim(), stakeMode, fixedAmount: Number(fixedAmount),
      maxStake: 0, minStake: stakeMode === "fixed" ? Number(fixedAmount) : 5,
      maxBettors: 0, creatorBps: 700, isPrivate, code: isPrivate ? code.trim() : "",
      relampago: true, launch,
      closeTime: launch + windowMin * 60000,
      resolveTime: launch + windowMin * 60000 + 1000,
      deadline: launch + (windowMin + 30) * 60000, // regla fija: cierre + 30 min o se anula
    });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 40, display: "flex", alignItems: "flex-end", justifyContent: "center",
      background: "rgba(6,3,12,.66)", backdropFilter: "blur(4px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{
        width: "100%", maxWidth: 440, background: C.bg2, borderRadius: "26px 26px 0 0",
        border: `1px solid ${C.line}`, borderBottom: "none", padding: "18px 18px 26px", boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={18} color={C.gold} fill={C.gold} />
            <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 20 }}>Relámpago</span>
          </div>
          <button onClick={onClose} className="press" style={{ ...ghost, padding: 6 }}><X size={20} /></button>
        </div>

        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} autoFocus
          placeholder="¿Hay gol antes del entretiempo?"
          rows={2} style={{
            width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.line}`,
            borderRadius: 14, padding: 13, color: C.text, fontSize: 16, fontFamily: "inherit",
            resize: "none", outline: "none", marginBottom: 12,
          }} />

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[[false, "Pública"], [true, "Privada"]].map(([k, l]) => (
            <Seg key={String(k)} on={isPrivate === k} col={k ? C.gold : C.si} onClick={() => setIsPrivate(k)}>
              {k ? <><Lock size={12} style={{ verticalAlign: "-1px", marginRight: 4 }} />{l}</> : l}
            </Seg>
          ))}
        </div>
        {isPrivate && (
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12}
            placeholder="Código de acceso (opcional), ej: ASADO" style={{
              width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.gold}44`,
              borderRadius: 12, padding: "11px 13px", color: C.gold, fontSize: 15, outline: "none",
              fontFamily: "inherit", fontWeight: 700, letterSpacing: 1, marginBottom: 10,
            }} />
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: stakeMode === "fixed" ? 10 : 12 }}>
          {[["free", "Apuesta libre"], ["fixed", "Monto fijo"]].map(([k, l]) => (
            <Seg key={k} on={stakeMode === k} col={C.si} onClick={() => setStakeMode(k)}>{l}</Seg>
          ))}
        </div>
        {stakeMode === "fixed" && (
          <Stepper label="Monto para todos" value={Number(fixedAmount)}
            steps={[-25, -5, 5, 25]} min={5} onChange={setFixedAmount} />
        )}

        <Stepper label="Abierta por" value={windowMin} suffix="min"
          steps={[-5, 5]} min={5} max={60} onChange={setWindowMin} />

        <p style={{ color: C.faint, fontSize: 11.5, margin: "0 0 14px", lineHeight: 1.5 }}>
          Se lanza ya{walletOn ? " en USDC y en puntos" : " en puntos"} · cierra en {windowMin} min · tenés 30 min más para cargar el resultado o se anula · tu comisión 7% <b style={{ color: C.gold }}>+2% bonus</b> (BARDOOO cobra solo 1%).
        </p>

        <button onClick={submit} disabled={!valid} className="press" style={{
          width: "100%", border: "none", borderRadius: 16, padding: "16px", cursor: valid ? "pointer" : "not-allowed",
          fontFamily: "Syne", fontWeight: 800, fontSize: 17, color: C.bg, opacity: valid ? 1 : .4,
          background: `linear-gradient(90deg, ${C.gold}, ${C.no})`,
          boxShadow: valid ? `0 10px 30px ${C.noGlow}` : "none",
        }}>⚡ Lanzar ya</button>

        <button onClick={goFull} className="press" style={{ ...ghost, width: "100%", justifyContent: "center", marginTop: 10, fontSize: 13 }}>
          ¿Evento con fecha? Modo completo →
        </button>
      </div>
    </div>
  );
}

function Seg({ on, col, onClick, children, grow, pad }) {
  return (
    <button onClick={onClick} className="press" style={{
      flex: grow ? "1 1 auto" : pad ? "0 0 auto" : 1,
      padding: pad ? "12px 12px" : "11px 12px", borderRadius: 12, cursor: "pointer",
      fontWeight: 700, fontSize: 13.5,
      color: on ? C.bg : C.text,
      background: on ? col : "transparent",
      border: `1px solid ${on ? col : C.line}`,
    }}>{children}</button>
  );
}

/* Stepper estilo control remoto: numero heroe arriba (quieto), pildora de botones abajo */
function Stepper({ label, value, steps, min, max, onChange, color = C.gold, prefix, suffix }) {
  const clamp = (v) => Math.min(max ?? Infinity, Math.max(min ?? 0, v));
  const all = [...steps].sort((a, b) => a - b);
  const pct = min != null && max != null ? ((value - min) / (max - min)) * 100 : null;
  return (
    <div style={{
      background: `linear-gradient(165deg, ${color}10, ${C.bg3})`,
      border: `1px solid ${color}30`, borderRadius: 18,
      padding: "13px 14px 12px", marginBottom: 12, textAlign: "center",
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2.2, color: C.dim, textTransform: "uppercase", marginBottom: 7 }}>
        {label}
      </div>
      <div key={String(value)} className="pop" style={{
        fontFamily: "Syne", fontWeight: 800, fontSize: 38, color, lineHeight: 1,
        textShadow: `0 0 26px ${color}50`, marginBottom: pct != null ? 10 : 12,
      }}>
        {prefix && <span style={{ fontSize: 22, marginRight: 2 }}>{prefix}</span>}
        {Number(value).toLocaleString("es-UY")}
        {suffix && <span style={{ fontSize: 15, color: C.dim, marginLeft: 8, fontWeight: 700, letterSpacing: 1.5 }}>{suffix}</span>}
      </div>
      {pct != null && (
        <div style={{ height: 4, borderRadius: 4, background: `${C.bg}cc`, margin: "0 26px 12px", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${color}55, ${color})`, transition: "width .25s ease" }} />
        </div>
      )}
      <div style={{
        display: "flex", alignItems: "stretch", background: `${C.bg}b8`,
        border: `1px solid ${C.line}`, borderRadius: 999, overflow: "hidden",
      }}>
        {all.map((s, i) => {
          const nv = clamp(value + s);
          const off = nv === value;
          return (
            <button key={s} disabled={off} onClick={() => !off && onChange(nv)} className="press" style={{
              flex: 1, border: "none", cursor: off ? "default" : "pointer",
              borderLeft: i > 0 ? `1px solid ${C.line}` : "none",
              background: s > 0 && !off ? `${color}12` : "transparent",
              fontFamily: "Syne", fontWeight: 800, fontSize: 15, padding: "12px 0",
              color: off ? C.faint : s > 0 ? color : C.text,
              opacity: off ? 0.35 : 1,
            }}>{s > 0 ? `+${s}` : s}</button>
          );
        })}
      </div>
    </div>
  );
}

function DateField({ label, v, set }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      <input type="datetime-local" value={v} onChange={(e) => set(e.target.value)} style={{
        width: "100%", boxSizing: "border-box", background: C.bg2, border: `1px solid ${C.line}`,
        borderRadius: 12, padding: "12px 14px", color: C.text, fontSize: 16, outline: "none",
        fontFamily: "inherit", colorScheme: "dark",
      }} />
    </div>
  );
}

function Row({ k, v, note, col }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: C.dim, fontSize: 13 }}>{k}{note && <span style={{ color: C.faint, fontSize: 11 }}> · {note}</span>}</span>
      <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 14, color: col || C.text, textAlign: "right" }}>{v}</span>
    </div>
  );
}

/* =========================== LA FICHA (bonus) =========================== */
/* Flappy tematico: la ficha (el anillo de BARDOOO) rueda entre pilares SI/NO. $1 por caño,
   tope $15 por vuelo. En la app real, limite y premio viven en el BACKEND. */
const GW = 380, GH = 470, BX = 92, BR = 13, PW = 60, GAP = 76;

function Game({ onBack, tries, onPrize, play }) {
  const canvasRef = useRef(null);
  const gRef = useRef(null);
  const phaseRef = useRef("ready");
  const [phase, setPhase] = useState("ready"); // ready | playing | over
  const [score, setScore] = useState(0);
  const [prize, setPrize] = useState(0);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const drawScene = (ctx, g) => {
    ctx.clearRect(0, 0, GW, GH);
    // fondo de arena
    const bg = ctx.createLinearGradient(0, 0, 0, GH);
    bg.addColorStop(0, "#170C2E"); bg.addColorStop(1, "#0E0720");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, GW, GH);
    // pilares
    for (const p of g.pipes) {
      ctx.save();
      ctx.shadowColor = p.col; ctx.shadowBlur = 14;
      const grad = ctx.createLinearGradient(p.x, 0, p.x + PW, 0);
      grad.addColorStop(0, p.col + "cc"); grad.addColorStop(1, p.col + "77");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.roundRect(p.x, -12, PW, p.cy - GAP + 12, 10); ctx.fill();
      ctx.beginPath(); ctx.roundRect(p.x, p.cy + GAP, PW, GH - p.cy - GAP + 12, 10); ctx.fill();
      ctx.restore();
    }
    // la ficha: el anillo de BARDOOO, girando a medida que avanza
    const R = 15;
    ctx.save(); ctx.translate(BX, g.y); ctx.rotate(g.rot || 0);
    ctx.shadowColor = "#00F0C0"; ctx.shadowBlur = 14;
    ctx.fillStyle = "#00F0C0";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -Math.PI * 0.4, Math.PI * 0.6); ctx.closePath(); ctx.fill();
    ctx.shadowColor = "#FF2E7C";
    ctx.fillStyle = "#FF2E7C";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, Math.PI * 0.6, Math.PI * 1.6); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#0C0616"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(R * Math.cos(-Math.PI * 0.4), R * Math.sin(-Math.PI * 0.4));
    ctx.lineTo(R * Math.cos(Math.PI * 0.6), R * Math.sin(Math.PI * 0.6));
    ctx.stroke();
    ctx.fillStyle = "#12081F";
    ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // loop del juego
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    cv.width = GW * dpr; cv.height = GH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (phase !== "playing") {
      drawScene(ctx, gRef.current || { y: GH / 2, v: 0, pipes: [] });
      return;
    }

    const g = { y: GH / 2, v: -6, pipes: [], dist: 140, score: 0, rot: 0 };
    gRef.current = g;
    let raf, last = performance.now();

    const loop = (t) => {
      const dt = Math.min(34, t - last) / 16.67; last = t;
      const spd = Math.min(4.1, 2.5 + g.score * 0.05); // acelera con cada caño

      g.v += 0.42 * dt;
      g.y += g.v * dt;
      g.dist += spd * dt;
      g.rot += spd * dt * 0.055; // rueda: gira mas rapido cuanto mas rapido va
      if (g.dist >= 205) {
        g.dist = 0;
        const cy = 110 + Math.random() * (GH - 220);
        g.pipes.push({ x: GW + 30, cy, passed: false, col: g.pipes.length % 2 ? "#FF2E7C" : "#00F0C0" });
      }
      for (const p of g.pipes) p.x -= spd * dt;
      g.pipes = g.pipes.filter((p) => p.x > -PW - 20);

      for (const p of g.pipes) {
        if (!p.passed && p.x + PW < BX - BR) {
          p.passed = true; g.score++; setScore(g.score); play("pass");
        }
      }

      let dead = g.y < BR || g.y > GH - BR;
      for (const p of g.pipes) {
        if (BX + BR > p.x && BX - BR < p.x + PW) {
          if (g.y - BR < p.cy - GAP || g.y + BR > p.cy + GAP) dead = true;
        }
      }

      drawScene(ctx, g);

      if (dead) {
        play("crash");
        const won = Math.min(g.score, 15); // $1 por caño, tope $15
        setPrize(won);
        setPhase("over");
        onPrize(won);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const tap = () => {
    if (phaseRef.current === "ready" && tries > 0) { setScore(0); setPhase("playing"); return; }
    if (phaseRef.current === "playing" && gRef.current) { gRef.current.v = -7.3; play("flap"); }
  };
  const again = () => { if (tries > 0) { setScore(0); setPhase("playing"); } };

  return (
    <div style={{ paddingTop: 12 }}>
      <button onClick={onBack} className="press" style={ghost}><ChevronLeft size={18} /> Volver</button>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: C.faint, margin: "10px 0 2px" }}>BONUS DIARIO</div>
      <h2 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 27, margin: "0 0 6px" }}>La Ficha</h2>
      <p style={{ color: C.dim, fontSize: 13.5, margin: "0 0 16px", lineHeight: 1.5 }}>
        Tocá y la ficha vuela girando; esquivá los pilares. <b style={{ color: C.gold }}>1 pt por caño</b>, hasta 15 pts por vuelo. Los puntos se apuestan en los duelos de puntos.
      </p>

      <div style={{ position: "relative", borderRadius: 22, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 16 }}>
        <canvas ref={canvasRef} onPointerDown={tap}
          style={{ display: "block", width: "100%", height: "auto", cursor: "pointer", touchAction: "manipulation" }} />
        {/* marcador */}
        <div style={{ position: "absolute", top: 12, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
          <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 40, color: "#F6F1FF", textShadow: "0 2px 14px rgba(0,0,0,.6)" }}>
            {phase === "playing" || phase === "over" ? score : ""}
          </span>
        </div>
        {phase === "ready" && (
          <div onPointerDown={tap} style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center", cursor: "pointer",
            background: "rgba(12,6,22,.45)", backdropFilter: "blur(2px)",
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 24, color: C.gold, textShadow: `0 0 24px ${C.gold}66` }}>
                {tries > 0 ? "Tocá para volar" : "Sin vuelos por hoy"}
              </div>
              {tries > 0 && <div style={{ color: C.dim, fontSize: 13, marginTop: 6 }}>{tries} {tries === 1 ? "vuelo" : "vuelos"} disponibles</div>}
            </div>
          </div>
        )}
      </div>

      {phase === "over" && (
        <div className="rise">
          <div style={{
            textAlign: "center", background: `linear-gradient(160deg, ${prize >= 10 ? C.gold : prize > 0 ? C.si : C.no}14, ${C.bg2})`,
            border: `1px solid ${prize >= 10 ? C.gold : prize > 0 ? C.si : C.no}66`, borderRadius: 20, padding: 20, marginBottom: 14,
          }}>
            <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 30, color: prize >= 10 ? C.gold : prize > 0 ? C.si : C.no }}>
              {prize >= 10 ? `¡${score} CAÑOS!` : prize > 0 ? `+${prize} pts` : "Te estrellaste"}
            </div>
            <div style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>
              {prize > 0 ? `${prize} pts sumados` : "Ni un caño esta vez"}
              {tries > 0 ? ` · te ${tries === 1 ? "queda 1 vuelo" : `quedan ${tries} vuelos`}` : " · sin vuelos por hoy"}
            </div>
          </div>
          {tries > 0 ? (
            <button onClick={again} className="press" style={{
              width: "100%", border: "none", borderRadius: 18, padding: "17px", cursor: "pointer",
              fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.bg,
              background: `linear-gradient(90deg, ${C.gold}, #ffdd8f)`,
            }}>Volar de nuevo</button>
          ) : (
            <button onClick={onBack} className="press" style={{
              width: "100%", borderRadius: 18, padding: "17px", cursor: "pointer",
              fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.si,
              background: "transparent", border: `2px solid ${C.si}`,
            }}>A la Arena, a apostar lo ganado</button>
          )}
        </div>
      )}

      <p style={{ color: C.faint, fontSize: 11, marginTop: 4, lineHeight: 1.5, textAlign: "center" }}>
        3 vuelos por día. En el prototipo se reinician al recargar; en la app real el límite y el premio viven en el backend.
      </p>
    </div>
  );
}

/* =============================== MINE =============================== */
function Mine({ bets, now, onOpen, earned, onInvite, profile, setProfile, walletOn, walletAddr, fire }) {
  const mine = bets.filter((b) => b.creator.mine || b.myStake[0] > 0 || b.myStake[1] > 0);
  const created = bets.filter((b) => b.creator.mine);
  const pending = created.filter((b) => b.status === "locked");
  const playing = mine.filter((b) => b.status === "open" || b.status === "locked");
  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: C.faint, marginBottom: 2 }}>TU RINCÓN</div>
      <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 24, marginBottom: 14 }}>Mis apuestas</div>

      <ProfileCard profile={profile} setProfile={setProfile}
        walletOn={walletOn} walletAddr={walletAddr} fire={fire} />

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <Stat icon={<Sparkles size={13} />} label="Creadas" v={created.length} />
        <Stat icon={<Users size={13} />} label="Jugando" v={playing.length} />
        <Stat icon={<TrendingUp size={13} />} label="Comisiones" v={money(earned)} col={C.gold} />
      </div>

      <div onClick={onInvite} className="press" style={{
        display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
        background: `linear-gradient(90deg, ${C.si}14, transparent)`,
        border: `1px solid ${C.si}55`, borderRadius: 16, padding: "13px 14px", marginBottom: 14,
      }}>
        <Share2 size={17} color={C.si} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Invitá amigos, ganá 25 pts por cada uno</div>
          <div style={{ color: C.dim, fontSize: 12 }}>Más gente = pozos más grandes en tus duelos</div>
        </div>
        <ArrowRight size={16} color={C.si} />
      </div>

      {pending.length > 0 && (
        <div onClick={() => onOpen(pending[0].id)} className="press" style={{
          display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
          background: `linear-gradient(90deg, ${C.gold}20, transparent)`,
          border: `1px solid ${C.gold}66`, borderRadius: 16, padding: "13px 14px", marginBottom: 14,
        }}>
          <Hourglass size={18} color={C.gold} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>
              {pending.length === 1 ? "1 apuesta espera tu resultado" : `${pending.length} apuestas esperan tu resultado`}
            </div>
            <div style={{ color: C.dim, fontSize: 12 }}>La gente no puede cobrar hasta que lo cargues</div>
          </div>
          <ArrowRight size={16} color={C.gold} />
        </div>
      )}

      {mine.length === 0 ? (
        <Empty />
      ) : mine.map((b, i) => <BetCard key={b.id} b={b} now={now} onOpen={onOpen} delay={i * 70} />)}
    </div>
  );
}

function ProfileCard({ profile, setProfile, walletOn, walletAddr, fire }) {
  const [editing, setEditing] = useState(false);
  const [tmp, setTmp] = useState(profile.name);
  const seed = walletOn ? walletAddr : profile.handle;
  const short = walletAddr.slice(0, 6) + "…" + walletAddr.slice(-4);
  const save = () => {
    const name = tmp.trim() || profile.name;
    setProfile({ name, handle: "@" + name.toLowerCase().replace(/\s+/g, "") });
    setEditing(false);
  };
  const copyAddr = () => {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(walletAddr).then(() => fire("Dirección copiada"));
  };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 13, background: `linear-gradient(160deg, ${C.bg3}, ${C.bg2})`,
      border: `1px solid ${C.line}`, borderRadius: 18, padding: 14, marginBottom: 14,
    }}>
      <Identicon seed={seed} size={52} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input value={tmp} onChange={(e) => setTmp(e.target.value)} autoFocus maxLength={20}
              onKeyDown={(e) => e.key === "Enter" && save()} style={{
                flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.si}55`, borderRadius: 10,
                padding: "7px 10px", color: C.text, fontSize: 15, fontWeight: 700, outline: "none", fontFamily: "inherit",
              }} />
            <button onClick={save} className="press" style={{
              border: "none", background: C.si, color: C.bg, borderRadius: 10, padding: "0 12px",
              fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            }}><Check size={16} /></button>
          </div>
        ) : (
          <div onClick={() => { setTmp(profile.name); setEditing(true); }} style={{ cursor: "pointer" }}>
            <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 17, display: "flex", alignItems: "center", gap: 7 }}>
              {profile.name}
              <span style={{ color: C.faint, fontSize: 11, fontWeight: 600 }}>editar</span>
            </div>
            <div style={{ color: C.dim, fontSize: 12.5 }}>{profile.handle}</div>
          </div>
        )}
        {walletOn ? (
          <button onClick={copyAddr} className="press" style={{
            ...ghost, gap: 5, marginTop: 5, fontSize: 12, padding: 0, color: C.gold,
          }}>
            <Wallet size={12} /> {short} · copiar
          </button>
        ) : (
          <div style={{ color: C.faint, fontSize: 11.5, marginTop: 5 }}>Tu bicho cambia al activar la wallet</div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, v, col }) {
  return (
    <div style={{ flex: 1, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 14, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, color: col || C.dim, fontSize: 11, fontWeight: 700 }}>
        {icon} {label}
      </div>
      <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 18, marginTop: 2, color: col || C.text }}>{v}</div>
    </div>
  );
}

/* =============================== BITS =============================== */
function BottomNav({ view, setView, onQuick }) {
  const Item = ({ id, icon, label }) => (
    <button onClick={() => setView(id)} className="press" style={{
      background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column",
      alignItems: "center", gap: 4, color: view === id ? C.text : C.faint, flex: 1, padding: "8px 0",
    }}>{icon}<span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5 }}>{label}</span></button>
  );
  return (
    <div style={{
      position: "fixed", bottom: 12, left: 0, right: 0, maxWidth: 408, margin: "0 auto",
      background: `${C.bg2}f0`, backdropFilter: "blur(16px)", border: `1px solid ${C.line}`,
      borderRadius: 24, display: "flex", alignItems: "center", padding: "6px 12px",
      boxShadow: "0 14px 40px rgba(0,0,0,.55)", zIndex: 30,
    }}>
      <Item id="feed" icon={<Home size={21} />} label="Arena" />
      <Item id="create" icon={<Plus size={21} />} label="Crear" />
      <button onClick={onQuick} className="press" title="Relámpago" style={{
        width: 58, height: 58, borderRadius: 20, margin: "-18px 8px 0", border: `3px solid ${C.bg}`,
        cursor: "pointer", background: `linear-gradient(135deg, ${C.gold}, ${C.no})`,
        display: "grid", placeItems: "center", boxShadow: `0 10px 28px ${C.noGlow}`, flexShrink: 0,
      }}><Zap size={26} color={C.bg} fill={C.bg} strokeWidth={2.4} /></button>
      <Item id="mine" icon={<Ticket size={21} />} label="Mías" />
    </div>
  );
}

function Avatar({ c }) {
  return <Identicon seed={c.handle || c.name} size={38} />;
}

function Timer({ closed, left }) {
  const fmt = () => {
    if (closed || left <= 0) return "cerrada";
    const s = Math.floor(left / 1000), m = Math.floor(s / 60);
    if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  };
  const urgent = !closed && left > 0 && left < 60000;
  return (
    <div className={urgent ? "blink" : ""} style={{
      display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999,
      fontSize: 12, fontWeight: 700,
      background: urgent ? `${C.no}22` : C.bg3,
      color: closed ? C.faint : urgent ? C.no : C.dim,
      border: `1px solid ${urgent ? C.no + "55" : C.line}`,
    }}>
      <Clock size={13} /> {fmt()}
    </div>
  );
}

function Chip({ col, label, v }) {
  return (
    <div style={{ flex: 1, background: C.bg2, border: `1px solid ${col}55`, borderRadius: 14, padding: "10px 12px" }}>
      <div style={{ color: col, fontSize: 11, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 18 }}>{v}</div>
    </div>
  );
}

function Banner({ color, text }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${color}55`, borderRadius: 14, padding: "14px 16px", color: C.dim, fontSize: 13.5, lineHeight: 1.5 }}>
      {text}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 12.5, fontWeight: 700, color: C.dim, marginBottom: 8 }}>{children}</div>;
}

function NumField({ label, v, set }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      <input type="number" value={v} onChange={(e) => set(e.target.value)} style={{
        width: "100%", boxSizing: "border-box", background: C.bg2, border: `1px solid ${C.line}`,
        borderRadius: 12, padding: "12px 14px", color: C.text, fontSize: 16, outline: "none", fontFamily: "inherit",
      }} />
    </div>
  );
}

function Empty() {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.faint }}>
      <Sparkles size={32} style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>Todavía no jugaste ninguna.<br />Pasá por la Arena y elegí tu lado.</div>
    </div>
  );
}

function Toast({ t }) {
  const col = t.kind === "err" ? C.no : t.kind === "win" ? C.gold : C.si;
  return (
    <div key={t.id} className="toast" style={{
      position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)", zIndex: 50,
      maxWidth: 400, width: "calc(100% - 40px)", background: C.bg3, border: `1px solid ${col}`,
      borderRadius: 14, padding: "13px 16px", display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 10px 30px rgba(0,0,0,.5)",
    }}>
      <div style={{ width: 22, height: 22, borderRadius: 999, background: col, display: "grid", placeItems: "center", flexShrink: 0 }}>
        {t.kind === "err" ? <X size={14} color={C.bg} /> : t.kind === "win" ? <Trophy size={13} color={C.bg} /> : <Check size={14} color={C.bg} />}
      </div>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{t.msg}</span>
    </div>
  );
}

function Burst() {
  const cols = [C.si, C.no, C.gold, "#8A6CFF", "#FF9A3D"];
  const parts = Array.from({ length: 30 }, (_, i) => ({
    left: 6 + Math.random() * 88,
    delay: Math.random() * 0.3,
    dur: 1 + Math.random() * 0.6,
    size: 6 + Math.random() * 8,
    rot: Math.random() * 360,
    col: cols[i % cols.length],
  }));
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60, overflow: "hidden" }}>
      {parts.map((p, i) => (
        <span key={i} style={{
          position: "absolute", top: "-4%", left: `${p.left}%`,
          width: p.size, height: p.size * 0.45, background: p.col, borderRadius: 2,
          transform: `rotate(${p.rot}deg)`,
          animation: `fall ${p.dur}s ${p.delay}s cubic-bezier(.2,.7,.3,1) forwards`,
        }} />
      ))}
    </div>
  );
}

const ghost = {
  display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
  color: C.dim, cursor: "pointer", fontSize: 14, fontWeight: 600, padding: "6px 0", fontFamily: "inherit",
};
const stepBtn = (off) => ({
  width: 44, height: 40, borderRadius: 12, cursor: off ? "not-allowed" : "pointer",
  background: "transparent", border: `1.5px solid ${off ? C.line : C.gold}`,
  color: off ? C.faint : C.gold, fontFamily: "Syne", fontWeight: 800, fontSize: 16,
  opacity: off ? 0.5 : 1,
});
const resolveBtn = (col) => ({
  flex: 1, padding: "14px 0", borderRadius: 14, border: `2px solid ${col}`, background: "transparent",
  color: col, fontFamily: "Syne", fontWeight: 800, fontSize: 16, cursor: "pointer",
});

function Style() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap');
      * { -webkit-tap-highlight-color: transparent; }
      input::placeholder, textarea::placeholder { color: ${C.faint}; }
      input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      .press { transition: transform .12s ease; }
      .press:active { transform: scale(.96); }
      .rise { animation: rise .5s cubic-bezier(.2,.8,.2,1) both; }
      @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      .toast { animation: tin .25s ease; }
      @keyframes tin { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
      .blink { animation: bl 1s ease-in-out infinite; }
      @keyframes bl { 50% { opacity: .5; } }
      .pop { animation: pp .18s ease; }
      @keyframes pp { from { transform: scale(1.14); } to { transform: none; } }
      .sheet { animation: up .28s cubic-bezier(.2,.8,.2,1); }
      @keyframes up { from { transform: translateY(100%); } to { transform: none; } }
      .sway { animation: sw 1.2s ease-in-out infinite; }
      @keyframes sw { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
      @keyframes fall { to { transform: translateY(112vh) rotate(720deg); opacity: .85; } }
      .hit { animation: hitp .9s ease; }
      @keyframes hitp { from { box-shadow: 0 0 0 0 var(--hit); } to { box-shadow: 0 0 0 22px transparent; } }
      .marquee { animation: mq 22s linear infinite; }
      @keyframes mq { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      .shine { background: linear-gradient(105deg, transparent 42%, rgba(255,255,255,.14) 50%, transparent 58%); background-size: 260% 100%; animation: sh 3.6s ease-in-out infinite; }
      @keyframes sh { 0% { background-position: 130% 0; } 55%, 100% { background-position: -130% 0; } }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    `}</style>
  );
}
