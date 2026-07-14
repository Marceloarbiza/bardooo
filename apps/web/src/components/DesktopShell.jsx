import { Home, Plus, Ticket, Zap, Music, Volume2, VolumeX, Wallet, CircleDot } from "lucide-react";
import { C } from "../theme";
import { Logo, ORing } from "./ui/brand";
import { Identicon } from "./ui/Identicon";
import { Money, Num } from "./ui/animated";
import { Ticker } from "./Ticker";

/*  App-shell de ESCRITORIO (elección del dueño 2026-07-14): barra lateral fija
    con navegación + saldo + perfil, y el contenido usando todo el ancho. En
    mobile esto no se monta — sigue el Header + BottomNav de siempre.
    `maxW` limita el ancho del contenido: la Arena va ancha (grilla), el resto
    de las vistas se centran más angostas para que no se estiren.              */
export function DesktopShell({
  view, setView, onQuick, onOpenProfile,
  points, balance, walletOn, onWallet,
  profile, soundOn, onSound, musicOn, onMusic,
  ticker, maxW = 1100, children,
}) {
  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", position: "relative", zIndex: 1 }}>
      {/* ── SIDEBAR (fija: no scrollea con el contenido) ── */}
      <aside style={{
        width: 244, flexShrink: 0, height: "100%", display: "flex", flexDirection: "column",
        overflowY: "auto",
        borderRight: `1px solid ${C.line}`, background: `${C.bg2}77`,
        backdropFilter: "blur(12px)", padding: "22px 16px 16px", boxSizing: "border-box",
      }}>
        <div style={{ padding: "0 6px 20px" }}><Logo size={20} /></div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <NavItem on={view === "feed"} icon={<Home size={19} />} label="Arena" onClick={() => setView("feed")} />
          <NavItem on={view === "create"} icon={<Plus size={19} />} label="Crear" onClick={() => setView("create")} />
          <NavItem on={view === "mine"} icon={<Ticket size={19} />} label="Mías" onClick={() => setView("mine")} />
        </nav>

        {/* botón relámpago protagonista, como en mobile */}
        <button onClick={onQuick} className="press" style={{
          marginTop: 14, border: "none", borderRadius: 16, padding: "13px 16px", cursor: "pointer",
          fontFamily: "Syne", fontWeight: 800, fontSize: 15, color: C.bg,
          background: `linear-gradient(135deg, ${C.gold}, ${C.no})`, boxShadow: `0 10px 28px ${C.noGlow}`,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <Zap size={18} fill={C.bg} strokeWidth={2.4} /> Relámpago
        </button>

        <div style={{ flex: 1 }} />

        {/* saldo */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 10,
          background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 14,
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ORing size={15} hole={C.bg2} />
            <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 15, color: C.si }}><Num v={points} /></span>
          </span>
          <div style={{ width: 1, height: 16, background: C.line }} />
          {walletOn ? (
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <CircleDot size={13} color={C.gold} />
              <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 15, color: C.gold }}><Money v={balance} /></span>
            </span>
          ) : (
            <button onClick={onWallet} className="press" style={{
              border: "none", background: `${C.gold}1c`, color: C.gold, borderRadius: 999,
              padding: "5px 11px", fontWeight: 800, fontSize: 12, cursor: "pointer",
              fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5,
            }}><Wallet size={12} /> Activar</button>
          )}
        </div>

        {/* perfil + audio */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onOpenProfile} className="press" style={{
            flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 9, cursor: "pointer",
            background: "transparent", border: "none", padding: 4, textAlign: "left",
          }}>
            <Identicon seed={profile.handle} size={34} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 13.5, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.name}</div>
              <div style={{ color: C.faint, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile.handle}</div>
            </div>
          </button>
          <div style={{ display: "flex", background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 999, overflow: "hidden", flexShrink: 0 }}>
            <button onClick={onMusic} className={"press" + (musicOn ? " sway" : "")} title={musicOn ? "Parar música" : "Música"}
              style={{ width: 30, height: 30, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", color: musicOn ? C.gold : C.faint }}>
              <Music size={13} />
            </button>
            <button onClick={onSound} className="press" title={soundOn ? "Silenciar" : "Activar sonido"}
              style={{ width: 30, height: 30, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", color: soundOn ? C.si : C.faint }}>
              {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
            </button>
          </div>
        </div>
      </aside>

      {/* ── CONTENIDO (el ÚNICO que scrollea) ── */}
      <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {ticker && ticker.length > 0 && <Ticker items={ticker} />}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ maxWidth: maxW, margin: "0 auto", padding: "8px 32px 60px" }}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function NavItem({ on, icon, label, onClick }) {
  return (
    <button onClick={onClick} className="press" style={{
      display: "flex", alignItems: "center", gap: 12, width: "100%", cursor: "pointer",
      padding: "11px 13px", borderRadius: 12, border: "none", textAlign: "left",
      fontFamily: "Syne", fontWeight: 800, fontSize: 15,
      color: on ? C.text : C.dim,
      background: on ? `${C.si}14` : "transparent",
      boxShadow: on ? `inset 0 0 0 1px ${C.si}33` : "none",
    }}>
      <span style={{ color: on ? C.si : C.faint, display: "grid", placeItems: "center" }}>{icon}</span>
      {label}
    </button>
  );
}
