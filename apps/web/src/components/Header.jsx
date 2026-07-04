import { CircleDot, Music, Volume2, VolumeX, Wallet } from "lucide-react";
import { C } from "../theme";
import { Logo, ORing } from "./ui/brand";
import { Money, Num } from "./ui/animated";

export function Header({ balance, points, walletOn, onWallet, soundOn, onSound, musicOn, onMusic }) {
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
