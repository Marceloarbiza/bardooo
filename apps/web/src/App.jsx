import { useEffect, useRef, useState } from "react";
import { C } from "./theme";
import { amt } from "./lib/format";
import { sfx } from "./lib/sfx";
import { useSound } from "./hooks/useSound";
import { useMusic } from "./hooks/useMusic";
import { useMockBettingService, seedTicker } from "./services/mockBettingService";
import { Style } from "./components/ui/Style";
import { Bg } from "./components/ui/Bg";
import { Burst, Toast } from "./components/ui/bits";
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
   BARDOOO v2 — la arena del duelo. Prototipo funcional, blockchain SIMULADA.
   Toda la logica de producto es real (crear, apostar, resolver, cobrar); la
   "cadena" vive detras de la interfaz BettingService (mock en fase 1) para
   reemplazarse por API (fase 2) y wagmi/viem (fase 3) sin tocar el diseno.
   La matematica de pago es espejo del contrato via @bardooo/core.
   PLATFORM_BPS se leera de la factory en la app real (ver docs/INTEGRATION.md).
=========================================================================== */

export default function App() {
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState(0);
  const [walletOn, setWalletOn] = useState(false);   // la wallet es la graduacion, no la entrada
  const [profile, setProfile] = useState({ name: "vos", handle: "@vos" });
  const WALLET_ADDR = "0x7bC4f2a9E11d84c3B6f09A5d21c7E38F4a9D9E2a"; // demo: en la app real la crea Privy
  const [showWallet, setShowWallet] = useState(false);
  const [points, setPoints] = useState(60); // puntos BARDOOO: se ganan con La Ficha e invitando, se apuestan en duelos de puntos
  const [view, setView] = useState("feed");
  const [activeId, setActiveId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState(null);
  const [earned, setEarned] = useState(0);
  const [burst, setBurst] = useState(false);
  const [ticker, setTicker] = useState(seedTicker);
  const [tries, setTries] = useState(3); // vuelos diarios de La Ficha (en el prototipo: por sesion)
  const [showQuick, setShowQuick] = useState(false); // modal relampago
  const [showLink, setShowLink] = useState(false);   // abrir apuesta por link

  const { soundOn, play, toggleSound } = useSound();
  const { musicOn, toggleMusic, startIfOn } = useMusic();
  const svc = useMockBettingService(now);
  const { bets } = svc;

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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fire = (msg, kind = "ok") => {
    setToast({ msg, kind, id: Math.random() });
    setTimeout(() => setToast(null), 2600);
  };
  const pushTick = (e) => setTicker((t) => [e, ...t].slice(0, 12));

  /* ---- multitud simulada: en la app real, esto son los eventos BetPlaced ---- */
  useEffect(() => {
    if (!connected) return;
    let alive = true, to;
    const crowd = ["@leo", "@caro.p", "@nachovlc", "@flor__", "@tomas.g", "@romi", "@seba.k", "@juli", "@mateo_ok", "@vale.re"];
    const loop = () => {
      to = setTimeout(() => {
        if (!alive) return;
        const open = svc.list().filter((b) => b.status === "open" && !b.isPrivate);
        if (open.length > 0) {
          const b = open[Math.floor(Math.random() * open.length)];
          // leve sesgo hacia el lado que va ganando: la manada sigue a la manada
          const side = Math.random() < (b.pools[1] + 10) / (b.pools[0] + b.pools[1] + 20) ? 1 : 0;
          const amt = b.stakeMode === "fixed" ? b.fixedAmount : [5, 10, 15, 20, 25, 50][Math.floor(Math.random() * 6)];
          const u = crowd[Math.floor(Math.random() * crowd.length)];
          pushTick({ u, amt, side });
          play("crowd");
          svc.externalBet(b.id, side, amt);
        }
        loop();
      }, 2500 + Math.random() * 5000);
    };
    loop();
    return () => { alive = false; clearTimeout(to); };
  }, [connected]);

  /* ---------- acciones "on-chain" via BettingService (mock en fase 1) ---------- */
  const placeBet = (id, option, amount) => {
    const r = svc.placeBet(id, option, amount, { walletOn, points, balance });
    if (!r) return;
    if (!r.ok) {
      if (r.needWallet) setShowWallet(true);
      return fire(r.error, "err");
    }
    if (r.currency === "pts") setPoints((x) => x - amount); else setBalance((x) => x - amount);
    pushTick({ u: "@vos", amt: amount, side: option, cur: r.currency });
    play("tick");
    fire(`Metiste ${amt(r.currency, amount)} al ${option === 1 ? "SÍ" : "NO"}`);
  };

  const createBet = (form) => {
    const nextId = svc.createBet(form, profile, walletOn);
    fire(form.isPrivate
      ? "Privada creada · compartí el link para que entren"
      : walletOn ? "Lanzada en USDC y en puntos" : "Apuesta lanzada");
    setActiveId(nextId);
    setView("detail");
  };

  const resolve = (id, option) => {
    const r = svc.resolve(id, option);
    if (!r) return;
    if (r.cancelled) return fire("Sin contraparte: apuesta anulada, se devuelve todo", "err");
    if (r.currency === "pts") setPoints((x) => x + r.creatorCut);
    else { setBalance((x) => x + r.creatorCut); setEarned((x) => x + r.creatorCut); }
    play("win");
    fire(`Resultado cargado · tu comisión: ${amt(r.currency, r.creatorCut)}`, "win");
  };

  const claim = (id) => {
    const r = svc.claim(id);
    if (!r) return;
    if (!r.ok) return fire(r.error, "err");
    if (r.currency === "pts") setPoints((x) => x + r.pay); else setBalance((x) => x + r.pay);
    setBurst(true); setTimeout(() => setBurst(false), 1700);
    play("win");
    fire(`Cobraste ${amt(r.currency, r.pay)}`, "win");
  };

  const refundMy = (id) => {
    const r = svc.refund(id);
    if (!r) return;
    if (r.currency === "pts") setPoints((x) => x + r.total); else setBalance((x) => x + r.total);
    fire(`Recuperaste ${amt(r.currency, r.total)}`);
  };

  const activateWallet = () => {
    setWalletOn(true);
    setShowWallet(false);
    setBalance(500); // demo: en la app real, wallet embebida (Privy/Web3Auth) + deposito
    play("win");
    fire("Wallet activada · 500 USDC (demo)");
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
              startIfOn();
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
              <WalletSheet onClose={() => setShowWallet(false)} onActivate={activateWallet} />
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
