import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { C } from "./theme";
import { amt } from "./lib/format";
import { sfx } from "./lib/sfx";
import { useSound } from "./hooks/useSound";
import { useMusic } from "./hooks/useMusic";
import { useApiBettingService } from "./services/apiBettingService";
import { Style } from "./components/ui/Style";
import { Bg } from "./components/ui/Bg";
import { Burst, Toast } from "./components/ui/bits";
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

  const { soundOn, play, toggleSound } = useSound();
  const { musicOn, toggleMusic, startIfOn } = useMusic();

  const connected = authenticated && !!me;
  const points = me?.points ?? 0;
  const profile = { name: me?.name ?? "vos", handle: me?.handle ?? "@vos" };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

  const placeBet = async (id, option, amount) => {
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
    const r = await svc.createBet(form);
    if (!r.ok) return fire(r.error, "err");
    fire(r.bet.isPrivate
      ? "Privada creada · compartí el link para que entren"
      : "Apuesta lanzada");
    setActiveId(r.bet.id);
    setView("detail");
  };

  const resolve = async (id, option) => {
    const r = await svc.resolve(id, option);
    if (!r.ok) return fire(r.error, "err");
    if (r.cancelled) return fire("Sin contraparte: apuesta anulada, se devuelve todo", "err");
    setEarned((x) => x + r.creatorCut);
    play("win");
    fire(`Resultado cargado · tu comisión: ${amt(r.currency, r.creatorCut)}`, "win");
  };

  const claim = async (id) => {
    const r = await svc.claim(id);
    if (!r.ok) return fire(r.error, "err");
    setBurst(true); setTimeout(() => setBurst(false), 1700);
    play("win");
    fire(`Cobraste ${amt(r.currency, r.pay)}`, "win");
  };

  const refundMy = async (id) => {
    const r = await svc.refund(id);
    if (!r.ok) return fire(r.error, "err");
    fire(`Recuperaste ${amt(r.currency, r.total)}`);
  };

  const invite = () => {
    const code = me?.refCode ?? "";
    const txt = `Te invito a BARDOOO, la arena de apuestas entre amigos ⚡ bardooo.app/i/${code}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(txt).then(() => {
        play("tick");
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

  const connect = async () => {
    try { await sfx.ensure(); } catch (e) {} // el click es el gesto que habilita el audio
    login();
  };

  /* audio de bienvenida recién cuando la sesión está adentro */
  useEffect(() => {
    if (!connected) return;
    try {
      startIfOn();
      if (soundOn) sfx.tick();
    } catch (e) {}
  }, [connected]);

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
            <Header balance={0} points={points} walletOn={false} onWallet={() => setShowWallet(true)} soundOn={soundOn} onSound={toggleSound} musicOn={musicOn} onMusic={toggleMusic} />
            {ticker.length > 0 && <Ticker items={ticker} />}
            <div style={{ padding: "0 16px 130px", position: "relative" }}>
              {view === "feed" && (
                <Feed bets={bets} now={now} tries={flightsLeft} onGame={() => setView("game")} onLink={() => setShowLink(true)}
                  onOpen={(id) => { setActiveId(id); setView("detail"); }} />
              )}
              {view === "game" && (
                <Game onBack={() => setView("feed")} tries={flightsLeft} onPrize={onPrize} play={play}
                  fichaStart={svc.fichaStart} fichaEnd={svc.fichaEnd} onError={(m) => fire(m, "err")} />
              )}
              {view === "detail" && active && (
                <Detail b={active} now={now} fire={fire}
                  onBack={() => setView("feed")}
                  onBet={placeBet} onResolve={resolve} onClaim={claim} onRefund={refundMy} />
              )}
              {view === "create" && <Create onCreate={createBet} onBack={() => setView("feed")} walletOn={false} />}
              {view === "mine" && (
                <Mine bets={bets} now={now} earned={earned} onInvite={invite}
                  profile={profile} onSaveName={saveName} onLogout={logout}
                  walletOn={false} walletAddr={""} fire={fire}
                  onOpen={(id) => { setActiveId(id); setView("detail"); }} />
              )}
            </div>
            <BottomNav view={view} setView={(v) => { setView(v); if (v !== "detail") setActiveId(null); }} onQuick={() => setShowQuick(true)} />
            {showLink && (
              <LinkModal onClose={() => setShowLink(false)}
                openByLink={svc.openByLink} useReferral={svc.useReferral}
                onOpen={(id) => { setShowLink(false); setActiveId(id); setView("detail"); }}
                fire={fire} />
            )}
            {showWallet && (
              <WalletSheet onClose={() => setShowWallet(false)} />
            )}
            {showQuick && (
              <QuickModal walletOn={false}
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
