import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiFail } from "./api";
import { PLATFORM_BPS } from "../theme";

/* ===========================================================================
   ApiBettingService — la implementación REAL de BettingService (fase 2).
   Misma forma que el mock de fase 1, pero contra apps/api:
   - pozos y ticker en vivo por polling corto (5 s)
   - el server valida TODO; acá solo se muestran sus respuestas
   - lastHit se deriva comparando pozos entre polls (el pulso de las cartas
     ahora late con actividad REAL, no simulada)
   - los códigos de privadas viven SOLO en el server (hasheados); el del
     creador se recuerda en memoria local para poder compartirlo
=========================================================================== */

const POLL_MS = 5000;

export function useApiBettingService({ getToken, nameHint, enabled }) {
  const [bets, setBets] = useState([]);
  const [activity, setActivity] = useState([]);
  const [me, setMe] = useState(null);
  const [flightsLeft, setFlightsLeft] = useState(0);
  const [onLiveHit, setOnLiveHit] = useState(null); // callback para el blip de actividad ajena

  const extraBetsRef = useRef(new Map()); // privadas abiertas por link (no vienen en /bets)
  const myCodesRef = useRef(new Map()); // betId -> código propio (para compartir)
  const betsRef = useRef(bets);
  useEffect(() => { betsRef.current = bets; }, [bets]);
  const onLiveHitRef = useRef(null);

  const call = useCallback(async (path, opts = {}) => {
    const token = await getToken();
    return apiFetch(path, { ...opts, token, nameHint });
  }, [getToken, nameHint]);

  /* ---- merge con detección de actividad ajena (pozo creció → lastHit) ---- */
  const mergeBets = useCallback((incoming) => {
    setBets((prev) => {
      const prevById = new Map(prev.map((b) => [b.id, b]));
      const now = Date.now();
      const next = incoming.map((nb) => {
        const old = prevById.get(nb.id);
        const withCode = myCodesRef.current.has(nb.id)
          ? { ...nb, code: myCodesRef.current.get(nb.id) }
          : nb;
        if (!old) return withCode;
        const grewSi = nb.pools[1] > old.pools[1];
        const grewNo = nb.pools[0] > old.pools[0];
        const mineChanged = nb.myStake[0] !== old.myStake[0] || nb.myStake[1] !== old.myStake[1];
        if ((grewSi || grewNo) && !mineChanged) {
          onLiveHitRef.current?.();
          return { ...withCode, lastHit: { side: grewSi ? 1 : 0, t: now } };
        }
        return { ...withCode, lastHit: old.lastHit };
      });
      // conserva las privadas abiertas por link que el listado público no trae
      for (const [id, b] of extraBetsRef.current) {
        if (!next.some((x) => x.id === id)) next.push(b);
      }
      return next;
    });
  }, []);

  const upsertBet = useCallback((bet) => {
    if (myCodesRef.current.has(bet.id)) bet = { ...bet, code: myCodesRef.current.get(bet.id) };
    if (bet.isPrivate) extraBetsRef.current.set(bet.id, bet);
    setBets((prev) => {
      const i = prev.findIndex((b) => b.id === bet.id);
      if (i === -1) return [bet, ...prev];
      const copy = [...prev];
      copy[i] = { ...bet, lastHit: prev[i].lastHit };
      return copy;
    });
    return bet;
  }, []);

  /* ------------------------------ polling ------------------------------ */
  const refreshAll = useCallback(async () => {
    const [b, a, m] = await Promise.all([
      call("/bets"),
      call("/activity"),
      call("/me"),
    ]);
    // refresco individual de las privadas abiertas por link
    for (const id of extraBetsRef.current.keys()) {
      try {
        const r = await call(`/bets/${id}`);
        extraBetsRef.current.set(id, r.bet);
      } catch {} // si dejó de ser accesible, queda la última vista
    }
    mergeBets(b.bets);
    setActivity(a.activity.filter((x) => x.type === "bet_placed"));
    setMe(m.user);
    setFlightsLeft(m.flightsLeft);
    return m.user;
  }, [call, mergeBets]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = () => refreshAll().catch(() => {});
    tick();
    const t = setInterval(() => alive && tick(), POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [enabled, refreshAll]);

  const refreshMe = useCallback(async () => {
    const m = await call("/me");
    setMe(m.user);
    setFlightsLeft(m.flightsLeft);
    return m.user;
  }, [call]);

  /* --------------------- acciones (validación en server) --------------------- */
  /* Devuelven la misma forma que el mock de fase 1: {ok, ...} o {ok:false, error}. */

  const placeBet = useCallback(async (id, option, amount) => {
    try {
      const r = await call(`/bets/${id}/place`, { method: "POST", body: { option, amount } });
      upsertBet(r.bet);
      await refreshMe();
      return { ok: true, currency: r.bet.currency };
    } catch (e) {
      if (e instanceof ApiFail) return { ok: false, error: e.message, needWallet: e.code === "NEEDS_WALLET" };
      throw e;
    }
  }, [call, upsertBet, refreshMe]);

  const createBet = useCallback(async (form) => {
    try {
      const r = await call("/bets", {
        method: "POST",
        body: {
          question: form.question,
          currency: "pts",
          stakeMode: form.stakeMode,
          fixedAmount: form.fixedAmount,
          minStake: form.minStake,
          maxStake: form.maxStake,
          maxBettors: form.maxBettors,
          creatorBps: form.creatorBps,
          isPrivate: form.isPrivate,
          code: form.code || undefined,
          relampago: form.relampago,
          windowMin: form.windowMin,
          closeTime: form.closeTime,
          resolveTime: form.resolveTime,
        },
      });
      if (form.isPrivate && form.code) myCodesRef.current.set(r.bet.id, form.code.toUpperCase());
      const bet = upsertBet(r.bet);
      return { ok: true, bet };
    } catch (e) {
      if (e instanceof ApiFail) return { ok: false, error: e.message };
      throw e;
    }
  }, [call, upsertBet]);

  const resolve = useCallback(async (id, option) => {
    try {
      const r = await call(`/bets/${id}/resolve`, { method: "POST", body: { option } });
      const fresh = await call(`/bets/${id}`);
      upsertBet(fresh.bet);
      await refreshMe();
      if (r.cancelled) return { ok: true, cancelled: true };
      return { ok: true, cancelled: false, creatorCut: r.creatorCut, currency: fresh.bet.currency };
    } catch (e) {
      if (e instanceof ApiFail) return { ok: false, error: e.message };
      throw e;
    }
  }, [call, upsertBet, refreshMe]);

  const claim = useCallback(async (id) => {
    try {
      const r = await call(`/bets/${id}/claim`, { method: "POST" });
      const fresh = await call(`/bets/${id}`);
      upsertBet(fresh.bet);
      await refreshMe();
      return { ok: true, pay: r.pay, currency: fresh.bet.currency };
    } catch (e) {
      if (e instanceof ApiFail) return { ok: false, error: e.message };
      throw e;
    }
  }, [call, upsertBet, refreshMe]);

  const refund = useCallback(async (id) => {
    try {
      const r = await call(`/bets/${id}/refund`, { method: "POST" });
      const fresh = await call(`/bets/${id}`);
      upsertBet(fresh.bet);
      await refreshMe();
      return { ok: true, total: r.refunded, currency: fresh.bet.currency };
    } catch (e) {
      if (e instanceof ApiFail) return { ok: false, error: e.message };
      throw e;
    }
  }, [call, upsertBet, refreshMe]);

  /* ---- abrir por link: bets públicos o privados; puede pedir código ---- */
  const openByLink = useCallback(async (id, code) => {
    try {
      const r = code === undefined
        ? await call(`/bets/${id}`)
        : await call(`/bets/${id}/unlock`, { method: "POST", body: { code } });
      upsertBet(r.bet);
      return { ok: true, bet: r.bet };
    } catch (e) {
      if (e instanceof ApiFail) return { ok: false, error: e.message, needsCode: e.code === "NEEDS_CODE", wrongCode: e.code === "WRONG_CODE" };
      throw e;
    }
  }, [call, upsertBet]);

  /* ------------------------------ La Ficha ------------------------------ */
  const fichaStart = useCallback(async () => {
    try {
      const r = await call("/ficha/start", { method: "POST" });
      setFlightsLeft(r.remaining);
      return { ok: true, flightId: r.flightId };
    } catch (e) {
      if (e instanceof ApiFail) return { ok: false, error: e.message };
      throw e;
    }
  }, [call]);

  const fichaEnd = useCallback(async (flightId, score) => {
    try {
      const r = await call("/ficha/end", { method: "POST", body: { flightId, score } });
      setFlightsLeft(r.remaining);
      await refreshMe();
      return { ok: true, prize: r.prize, remaining: r.remaining };
    } catch (e) {
      if (e instanceof ApiFail) return { ok: false, error: e.message };
      throw e;
    }
  }, [call, refreshMe]);

  /* ------------------------------ varios ------------------------------ */
  const updateName = useCallback(async (name) => {
    const r = await call("/me", { method: "PATCH", body: { name } });
    setMe(r.user);
    return r.user;
  }, [call]);

  const useReferral = useCallback(async (code) => {
    try {
      const r = await call("/referrals/use", { method: "POST", body: { code } });
      return { ok: true, registered: r.registered };
    } catch (e) {
      if (e instanceof ApiFail) return { ok: false, error: e.message };
      throw e;
    }
  }, [call]);

  /* config de plataforma: en fase 3 esto viene de la factory; hoy validamos
     que el server y el front estén de acuerdo (trampa conocida de CLAUDE.md) */
  useEffect(() => {
    if (!enabled) return;
    apiFetch("/config").then((c) => {
      if (c.platformBps !== PLATFORM_BPS)
        console.error(`PLATFORM_BPS desincronizado: front ${PLATFORM_BPS} vs server ${c.platformBps}`);
    }).catch(() => {});
  }, [enabled]);

  return {
    bets, activity, me, flightsLeft,
    placeBet, createBet, resolve, claim, refund,
    openByLink, fichaStart, fichaEnd, updateName, useReferral,
    refreshAll, refreshMe,
    setOnLiveHit: (fn) => { onLiveHitRef.current = fn; },
  };
}
