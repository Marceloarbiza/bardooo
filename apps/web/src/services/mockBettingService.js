import { useCallback, useEffect, useRef, useState } from "react";
import { commission, payoutFor, feeSplit } from "../lib/math";
import { amt, money, mins } from "../lib/format";
import { C, PLATFORM_BPS, FLASH_REBATE_BPS } from "../theme";

/* ===========================================================================
   Implementación MOCK de BettingService: la "cadena" vive en estado React.
   Toda la lógica de producto es real (crear, apostar, resolver, cobrar);
   en fases 2-3 se reemplaza por API/on-chain sin tocar los componentes.
   La matemática de pago es espejo del contrato vía @bardooo/core.
=========================================================================== */

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

export const seedTicker = [
  { u: "@leo", amt: 50, side: 1, cur: "usdc" }, { u: "@caro.p", amt: 20, side: 0, cur: "usdc" },
  { u: "@nachovlc", amt: 100, side: 1, cur: "usdc" }, { u: "@flor__", amt: 35, side: 0, cur: "pts" },
  { u: "@tomas.g", amt: 15, side: 1, cur: "usdc" }, { u: "@romi", amt: 60, side: 0, cur: "pts" },
];

/** Mock de BettingService sobre estado React. `now` maneja las transiciones
 *  por tiempo (open→locked; relámpago vencido→cancelled). */
export function useMockBettingService(now) {
  const [bets, setBets] = useState(seedBets);
  const betsRef = useRef(bets);
  useEffect(() => { betsRef.current = bets; }, [bets]);

  /* transiciones por tiempo (en la app real las deriva el server/indexer) */
  useEffect(() => {
    setBets((bs) => bs.map((b) => {
      let x = b;
      if (x.status === "open" && now >= x.closeTime) x = { ...x, status: "locked" };
      // relampago: si el creador no resolvio a tiempo, se anula y se devuelve
      if (x.relampago && (x.status === "open" || x.status === "locked") && now > (x.deadline || x.launch + 2 * 3600000))
        x = { ...x, status: "cancelled" };
      return x;
    }));
  }, [now]);

  const placeBet = useCallback((id, option, amount, ctx) => {
    const b = betsRef.current.find((x) => x.id === id);
    if (!b) return null;
    const other = option === 1 ? 0 : 1;
    if (b.myStake[other] > 0)
      return { ok: false, error: `Ya estás del lado del ${other === 1 ? "SÍ" : "NO"} en esta apuesta` };
    if (b.currency === "usdc" && !ctx.walletOn)
      return { ok: false, error: "Este duelo se juega con USDC: activá tu wallet", needWallet: true };
    const bal = b.currency === "pts" ? ctx.points : ctx.balance;
    if (amount > bal)
      return { ok: false, error: b.currency === "pts" ? "No te alcanzan los puntos" : "Saldo insuficiente" };
    if (b.stakeMode === "fixed" && amount !== b.fixedAmount)
      return { ok: false, error: `En esta apuesta el monto es ${amt(b.currency, b.fixedAmount)}` };
    if (amount < b.minStake)
      return { ok: false, error: `Mínimo ${amt(b.currency, b.minStake)}` };
    if (b.stakeMode === "capped" && b.myStake[option] + amount > b.maxStake)
      return { ok: false, error: `Tope por persona: ${money(b.maxStake)}` };

    setBets((bs) => bs.map((x) => {
      if (x.id !== id) return x;
      const pools = [...x.pools];
      pools[option] += amount;
      const myStake = [...x.myStake];
      const isNew = x.myStake[0] + x.myStake[1] === 0;
      myStake[option] += amount;
      return { ...x, pools, myStake, bettors: x.bettors + (isNew ? 1 : 0), lastHit: { side: option, t: Date.now() } };
    }));
    return { ok: true, currency: b.currency };
  }, []);

  const createBet = useCallback((form, creator, walletOn) => {
    const current = betsRef.current;
    const nextId = Math.max(...current.map((b) => b.id)) + 1;
    const mk = (id, currency) => ({
      id, currency,
      creator: { name: creator.name, handle: creator.handle, mine: true },
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
    return nextId;
  }, []);

  const resolve = useCallback((id, option) => {
    const b = betsRef.current.find((x) => x.id === id);
    if (!b) return null;
    const total = b.pools[0] + b.pools[1];
    const wp = b.pools[option];
    if (b.pools[0] === 0 || b.pools[1] === 0) {
      setBets((bs) => bs.map((x) => (x.id === id ? { ...x, status: "cancelled" } : x)));
      return { ok: true, cancelled: true };
    }
    const comm = commission(total, wp, PLATFORM_BPS + b.creatorBps); // total identico para el apostador
    const totalBps = PLATFORM_BPS + b.creatorBps;
    const platformShare = b.relampago ? PLATFORM_BPS - FLASH_REBATE_BPS : PLATFORM_BPS; // bonus relampago
    const { creatorCut } = feeSplit(comm, platformShare, totalBps);
    setBets((bs) => bs.map((x) => (x.id === id ? { ...x, status: "resolved", winningOption: option } : x)));
    return { ok: true, cancelled: false, creatorCut, currency: b.currency };
  }, []);

  const claim = useCallback((id) => {
    const b = betsRef.current.find((x) => x.id === id);
    if (!b || b.status !== "resolved" || b.claimed) return null;
    const pay = payoutFor(b.pools, b.winningOption, b.myStake[b.winningOption], PLATFORM_BPS + b.creatorBps);
    if (pay <= 0) return { ok: false, error: "No tenés premio en esta apuesta" };
    setBets((bs) => bs.map((x) => (x.id === id ? { ...x, claimed: true } : x)));
    return { ok: true, pay, currency: b.currency };
  }, []);

  const refund = useCallback((id) => {
    const b = betsRef.current.find((x) => x.id === id);
    if (!b || b.status !== "cancelled" || b.claimed) return null;
    const total = b.myStake[0] + b.myStake[1];
    if (total <= 0) return null;
    setBets((bs) => bs.map((x) => (x.id === id ? { ...x, claimed: true } : x)));
    return { ok: true, total, currency: b.currency };
  }, []);

  /* apuesta de terceros: hoy la multitud simulada; en la app real, eventos BetPlaced */
  const externalBet = useCallback((id, side, amount) => {
    setBets((bs) => bs.map((x) => {
      if (x.id !== id) return x;
      const pools = side === 1 ? [x.pools[0], x.pools[1] + amount] : [x.pools[0] + amount, x.pools[1]];
      const bettors = x.bettors + 1;
      const full = x.maxBettors !== 0 && bettors >= x.maxBettors;
      return { ...x, pools, bettors, lastHit: { side, t: Date.now() }, status: full ? "locked" : x.status };
    }));
  }, []);

  const list = useCallback(() => betsRef.current, []);

  return { bets, list, placeBet, createBet, resolve, claim, refund, externalBet };
}
