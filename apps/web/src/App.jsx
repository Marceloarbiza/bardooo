import { useEffect, useRef, useState } from "react";
import { usePrivy, useLoginWithOAuth } from "@privy-io/react-auth";
import { C } from "./theme";
import { amt } from "./lib/format";
import { sfx } from "./lib/sfx";
import { useSound } from "./hooks/useSound";
import { useMusic } from "./hooks/useMusic";
import { useApiBettingService } from "./services/apiBettingService";
import { useChainBetting, chainErrorMsg } from "./services/chainBetting";
import { Style } from "./components/ui/Style";
import { Bg } from "./components/ui/Bg";
import { Burst, Toast } from "./components/ui/bits";
import { PopModal } from "./components/ui/PopModal";
import { Logo } from "./components/ui/brand";
import { Header } from "./components/Header";
import { Ticker } from "./components/Ticker";
import { Connect } from "./components/Connect";
import { Feed } from "./components/Arena";
import { Detail } from "./components/Detail";
import { Create } from "./components/Create";
import { Game } from "./components/LaFicha";
import { Mine } from "./components/Mine";
import { BottomNav } from "./components/BottomNav";
import { LinkModal } from "./components/LinkModal";
import { QuickModal } from "./components/QuickModal";
import { WalletSheet } from "./components/WalletSheet";

/* ===========================================================================
   BARDOOO — fase 2: multi-usuario REAL. Login con Privy, estado en el server
   (apps/api), pozos y ticker en vivo por polling. La UI habla solo con la
   interfaz BettingService (hoy ApiBettingService; en fase 3, la cadena).
   La multitud simulada de fase 1 SE FUE: lo que late, late de verdad.
=========================================================================== */

export default function App() {
  const { ready, authenticated, user: privyUser, login, logout, getAccessToken } = usePrivy();

  const nameHint =
    privyUser?.google?.name ||
    privyUser?.twitter?.name ||
    privyUser?.email?.address?.split("@")[0] ||
    undefined;

  const svc = useApiBettingService({ getToken: getAccessToken, nameHint, enabled: authenticated });
  const { bets, activity, me, flightsLeft } = svc;

  const [view, setView] = useState("feed");
  const [activeId, setActiveId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState(null);
  const [earned, setEarned] = useState(0); // comisiones cobradas en esta sesión (pts)
  const [burst, setBurst] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showQuick, setShowQuick] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkPrefill, setLinkPrefill] = useState(null); // deep link que pide código
  const [pendingBetId, setPendingBetId] = useState(null);
  const [popup, setPopup] = useState(null); // modales notorios de referidos

  const { soundOn, play, toggleSound } = useSound();
  const { musicOn, toggleMusic, startIfOn } = useMusic();

  const connected = authenticated && !!me;
  const points = me?.points ?? 0;
  const profile = { name: me?.name ?? "vos", handle: me?.handle ?? "@vos" };

  /* fase 3/4: escrituras usdc a la cadena (gasless si el relayer está prendido);
     lecturas siguen por la API */
  const chain = useChainBetting({
    me,
    onStatus: (m) => fire(m),
    gasless: { enabled: svc.gaslessOn, relay: svc.relay, faucetServer: svc.faucetServer },
  });
  const walletOn = chain.linked;
  const balance = walletOn ? chain.balance : 0;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* ---- deep links (fase 5): /bet/:id, /i/:codigo y ?i=codigo ----
     El código de referido se guarda ANTES del login: sobrevive el redirect
     de Privy y se registra recién cuando la sesión está adentro.           */
  useEffect(() => {
    const path = window.location.pathname;
    const bet = /^\/bet\/(\d+)/.exec(path);
    const inv = /^\/i\/([A-Za-z0-9_-]+)/.exec(path);
    const q = new URLSearchParams(window.location.search).get("i");
    const ref = inv?.[1] ?? q;
    if (ref) { try { localStorage.setItem("bardooo:ref", ref); } catch (e) {} }
    if (bet) setPendingBetId(Number(bet[1]));
    if (bet || inv || q) window.history.replaceState({}, "", "/");
  }, []);

  const deepHandled = useRef(false);
  useEffect(() => {
    if (!connected || deepHandled.current) return;
    deepHandled.current = true;
    (async () => {
      let code = null;
      try { code = localStorage.getItem("bardooo:ref"); localStorage.removeItem("bardooo:ref"); } catch (e) {}
      if (code) {
        const r = await svc.useReferral(code).catch(() => null);
        if (r?.ok && r.registered) fire("¡Invitación registrada! Tu amigo suma 25 pts cuando juegues");
      }
      if (pendingBetId != null) {
        const r = await svc.openByLink(pendingBetId);
        if (r.ok) { setActiveId(r.bet.id); setView("detail"); }
        else if (r.needsCode) { setLinkPrefill(pendingBetId); setShowLink(true); }
        else fire(r.error, "err");
      }
    })();
  }, [connected, pendingBetId]);

  /* ---- referidos NOTORIOS (pedido del dueño): modales, no toasts fugaces ----
     - invitado pendiente: bienvenida con la consigna clara (una vez)
     - invitador: "¡tu amigo entró!" en vivo, y festejo cuando juega (+25)    */
  const refPrev = useRef(null);
  useEffect(() => {
    const r = svc.referral;
    if (!connected || !r || !me) return;
    if (refPrev.current === null) {
      refPrev.current = r;
      if (r.invitedBy) {
        const key = `bardooo:refwelcome:${me.handle}`;
        let seen = null;
        try { seen = localStorage.getItem(key); localStorage.setItem(key, "1"); } catch (e) {}
        if (!seen) {
          setPopup({
            emoji: "🎁",
            title: "¡Bienvenido a la arena!",
            body: <>Te invitó <b style={{ color: C.si }}>{r.invitedBy}</b>. Ya tenés tus puntos para arrancar — y con tu primer vuelo de La Ficha o tu primera apuesta, le regalás 25 pts.</>,
            cta: "¡A jugar!",
          });
        }
      }
      return;
    }
    const prev = refPrev.current;
    if (r.pending > prev.pending && r.lastPendingHandle) {
      play("tick");
      setPopup({
        emoji: "👋",
        title: `¡${r.lastPendingHandle} ya entró!`,
        body: "Tu invitación funcionó. En cuanto juegue su primera (un vuelo o una apuesta), te llevás +25 pts.",
        cta: "Genial",
      });
    }
    if (r.accredited > prev.accredited) {
      setBurst(true); setTimeout(() => setBurst(false), 1700);
      play("win");
      setPopup({
        emoji: "🎉",
        title: "¡+25 pts!",
        body: <>{r.lastAccreditedHandle ? <><b style={{ color: C.si }}>{r.lastAccreditedHandle}</b> jugó su primera.</> : "Tu invitado jugó su primera."} Gracias por agrandar la arena.</>,
        cta: "¡Vamos!",
      });
    }
    refPrev.current = r;
  }, [svc.referral, connected, me]);

  /* juego responsable (fase puntos): recordatorio suave de tiempo de sesión */
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => {
      fire("Llevás un buen rato en la arena. Un respiro no le viene mal a nadie 🧉");
    }, 45 * 60000);
    return () => clearInterval(t);
  }, [connected]);

  const fire = (msg, kind = "ok") => {
    setToast({ msg, kind, id: Math.random() });
    setTimeout(() => setToast(null), 2600);
  };

  /* blip suave cuando OTRO usuario mueve un pozo (reemplaza a la multitud fake) */
  useEffect(() => {
    svc.setOnLiveHit(() => play("crowd"));
  }, []);

  /* bienvenida: una sola vez por sesión, cuando el /me llega tras el login */
  const welcomed = useRef(false);
  useEffect(() => {
    if (!connected || welcomed.current) return;
    welcomed.current = true;
    fire(`¡Adentro, ${me.name}! Tenés ${me.points.toLocaleString("es-UY")} pts`);
  }, [connected]);

  /* ---------- acciones contra el server (validación allá, toasts acá) ---------- */

  const isChainBet = (id) => {
    const b = bets.find((x) => x.id === id);
    return b?.currency === "usdc" ? b : null;
  };

  const placeBet = async (id, option, amount) => {
    const b = isChainBet(id);
    if (b) {
      if (!walletOn) { setShowWallet(true); return fire("Este duelo se juega con USDC: activá tu wallet", "err"); }
      try {
        await chain.placeBet(b.chainAddress, option, amount);
        play("tick");
        fire(`Metiste ${amt("usdc", amount)} al ${option === 1 ? "SÍ" : "NO"} · confirmado en la cadena`);
        svc.refreshAll().catch(() => {});
      } catch (e) { fire(chainErrorMsg(e), "err"); }
      return;
    }
    const r = await svc.placeBet(id, option, amount);
    if (!r.ok) {
      if (r.needWallet) setShowWallet(true);
      return fire(r.error, "err");
    }
    play("tick");
    fire(`Metiste ${amt(r.currency, amount)} al ${option === 1 ? "SÍ" : "NO"}`);
    svc.refreshAll().catch(() => {});
  };

  const createBet = async (form) => {
    // con wallet vinculada, los duelos PÚBLICOS nacen en la cadena; el indexer
    // crea el gemelo de puntos solo. Las privadas siguen en puntos (la
    // privacidad es de la app, no del contrato — backlog fase siguiente).
    if (walletOn && !form.isPrivate) {
      try {
        await chain.createBet(form);
        fire("Lanzada en USDC · el duelo (y su gemelo en puntos) aparece en segundos", "win");
        setView("feed");
        svc.refreshAll().catch(() => {});
      } catch (e) { fire(chainErrorMsg(e), "err"); }
      return;
    }
    const r = await svc.createBet(form);
    if (!r.ok) return fire(r.error, "err");
    fire(r.bet.isPrivate
      ? "Privada creada · compartí el link para que entren"
      : "Apuesta lanzada");
    setActiveId(r.bet.id);
    setView("detail");
  };

  const resolve = async (id, option) => {
    const b = isChainBet(id);
    if (b) {
      try {
        await chain.resolve(b.chainAddress, option);
        play("win");
        fire("Resultado cargado en la cadena · el gemelo de puntos se resuelve solo", "win");
        svc.refreshAll().catch(() => {});
      } catch (e) { fire(chainErrorMsg(e), "err"); }
      return;
    }
    const r = await svc.resolve(id, option);
    if (!r.ok) return fire(r.error, "err");
    if (r.cancelled) return fire("Sin contraparte: apuesta anulada, se devuelve todo", "err");
    setEarned((x) => x + r.creatorCut);
    play("win");
    fire(`Resultado cargado · tu comisión: ${amt(r.currency, r.creatorCut)}`, "win");
  };

  const claim = async (id) => {
    const b = isChainBet(id);
    if (b) {
      try {
        await chain.claim(b.chainAddress);
        setBurst(true); setTimeout(() => setBurst(false), 1700);
        play("win");
        fire("¡Cobraste tu premio on-chain!", "win");
        svc.refreshAll().catch(() => {});
      } catch (e) { fire(chainErrorMsg(e), "err"); }
      return;
    }
    const r = await svc.claim(id);
    if (!r.ok) return fire(r.error, "err");
    setBurst(true); setTimeout(() => setBurst(false), 1700);
    play("win");
    fire(`Cobraste ${amt(r.currency, r.pay)}`, "win");
  };

  const refundMy = async (id) => {
    const b = isChainBet(id);
    if (b) {
      try {
        await chain.refund(b.chainAddress);
        fire("Recuperaste tu stake on-chain");
        svc.refreshAll().catch(() => {});
      } catch (e) { fire(chainErrorMsg(e), "err"); }
      return;
    }
    const r = await svc.refund(id);
    if (!r.ok) return fire(r.error, "err");
    fire(`Recuperaste ${amt(r.currency, r.total)}`);
  };

  const refSlug = me?.handle?.slice(1) ?? ""; // el handle sin @: link corto y con marca

  const invite = () => {
    const url = `${window.location.origin}/i/${refSlug}`;
    const txt = "Te invito a BARDOOO, la arena de apuestas entre amigos ⚡";
    if (navigator.share) {
      navigator.share({ text: txt, url }).then(() => svc.track("share")).catch(() => {});
      return;
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(`${txt} ${url}`).then(() => {
        play("tick");
        svc.track("share"); // hito del embudo
        fire("Link copiado · sumás 25 pts cuando tu amigo entre y juegue");
      });
    } else fire("No se pudo copiar", "err");
  };

  const saveName = async (name) => {
    try {
      await svc.updateName(name);
      fire("Nombre guardado");
    } catch {
      fire("No se pudo guardar el nombre", "err");
    }
  };

  /* premio de La Ficha: lo acredita el SERVER; acá solo la fiesta */
  const onPrize = (prize) => {
    if (prize > 0) {
      if (prize >= 10) { setBurst(true); setTimeout(() => setBurst(false), 1700); play("win"); }
      else play("tick");
      fire(prize >= 10 ? `¡PERFECTO! Ganaste ${prize} pts` : `Ganaste ${prize} pts para apostar`, prize >= 10 ? "win" : "ok");
    } else {
      fire("Ni un caño esta vez. ¡Otra!", "err");
    }
  };

  /* OAuth por REDIRECT de página completa (no popup): los popups mueren en la
     PWA instalada y con bloqueadores — "toco Google y no pasa nada". El hook
     vive acá (App siempre montado) para completar el login al volver.        */
  const { initOAuth } = useLoginWithOAuth();
  const connect = async (method) => {
    try { await sfx.ensure(); } catch (e) {} // el click es el gesto que habilita el audio
    try {
      if (method === "google" || method === "twitter") {
        await initOAuth({ provider: method });
      } else if (method === "wallet") {
        // cripto-nativos: SIWE con su wallet (la extensión maneja su propia UI)
        login({ loginMethods: ["wallet"] });
      } else {
        login(); // email: el modal de Privy no necesita popups
      }
    } catch (e) {
      fire("No se pudo iniciar sesión. Probá entrar con email.", "err");
    }
  };

  /* audio de bienvenida recién cuando la sesión está adentro */
  useEffect(() => {
    if (!connected) return;
    try {
      startIfOn();
      if (soundOn) sfx.tick();
    } catch (e) {}
  }, [connected]);

  /* sesión RECORDADA: al volver ya logueado no existe el click de "Conectar"
     que habilita el audio (los navegadores exigen un gesto del usuario) — el
     PRIMER toque o tecla en la app destraba sonido y música automáticamente */
  useEffect(() => {
    if (!connected) return;
    if (sfx.ctx && sfx.ctx.state === "running") return; // ya está destrabado
    const unlock = () => {
      (async () => {
        try {
          await sfx.ensure();
          startIfOn();
          if (soundOn) sfx.tick(); // el blip de bienvenida, ahora sí
        } catch (e) {}
      })();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [connected, soundOn, musicOn]);

  const ticker = activity.map((a) => ({ u: a.u, amt: a.amt, side: a.side, cur: a.cur }));
  const active = bets.find((b) => b.id === activeId) || null;

  const splash = (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div className="blink"><Logo size={24} /></div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", justifyContent: "center" }}>
      <Style />
      <div style={{
        width: "100%", maxWidth: 440, minHeight: "100vh", position: "relative",
        overflow: "hidden", fontFamily: "'Space Grotesk', system-ui, sans-serif",
        color: C.text, boxShadow: "0 0 90px rgba(0,0,0,.6)",
      }}>
        <Bg />
        {!ready ? (
          splash
        ) : !authenticated ? (
          <Connect onConnect={connect} now={now} />
        ) : !me ? (
          splash
        ) : (
          <>
            <Header balance={balance} points={points} walletOn={walletOn} onWallet={() => setShowWallet(true)} soundOn={soundOn} onSound={toggleSound} musicOn={musicOn} onMusic={toggleMusic} />
            {ticker.length > 0 && <Ticker items={ticker} />}
            <div style={{ padding: "0 16px 130px", position: "relative" }}>
              {view === "feed" && (
                <Feed bets={bets} now={now} tries={flightsLeft} onGame={() => setView("game")} onLink={() => setShowLink(true)}
                  invitedBy={svc.referral?.invitedBy}
                  onOpen={(id) => { setActiveId(id); setView("detail"); }} />
              )}
              {view === "game" && (
                <Game onBack={() => setView("feed")} tries={flightsLeft} onPrize={onPrize} play={play}
                  fichaStart={svc.fichaStart} fichaEnd={svc.fichaEnd} onError={(m) => fire(m, "err")} />
              )}
              {view === "detail" && active && (
                <Detail b={active} now={now} fire={fire} refCode={refSlug} track={svc.track}
                  onBack={() => setView("feed")}
                  onBet={placeBet} onResolve={resolve} onClaim={claim} onRefund={refundMy} />
              )}
              {view === "create" && <Create onCreate={createBet} onBack={() => setView("feed")} walletOn={walletOn} bondPts={svc.knobs.bondPts} />}
              {view === "mine" && (
                <Mine bets={bets} now={now} earned={earned} onInvite={invite}
                  profile={profile} onSaveName={saveName} onLogout={logout}
                  walletOn={walletOn} walletAddr={chain.address ?? ""} fire={fire}
                  refStats={svc.referral}
                  onOpen={(id) => { setActiveId(id); setView("detail"); }} />
              )}
            </div>
            <BottomNav view={view} setView={(v) => { setView(v); if (v !== "detail") setActiveId(null); }} onQuick={() => setShowQuick(true)} />
            {showLink && (
              <LinkModal onClose={() => { setShowLink(false); setLinkPrefill(null); }}
                openByLink={svc.openByLink} useReferral={svc.useReferral}
                initialBetId={linkPrefill}
                onOpen={(id) => { setShowLink(false); setLinkPrefill(null); setActiveId(id); setView("detail"); }}
                fire={fire} />
            )}
            {showWallet && (
              <WalletSheet onClose={() => setShowWallet(false)} chain={chain} me={me}
                onLink={svc.linkWallet} fire={fire} />
            )}
            {showQuick && (
              <QuickModal walletOn={walletOn} bondPts={svc.knobs.bondPts}
                onClose={() => setShowQuick(false)}
                onCreate={(f) => { setShowQuick(false); createBet(f); }}
                goFull={() => { setShowQuick(false); setView("create"); }} />
            )}
          </>
        )}
        {popup && <PopModal {...popup} onClose={() => setPopup(null)} />}
        {burst && <Burst />}
        {toast && <Toast t={toast} />}
      </div>
    </div>
  );
}
