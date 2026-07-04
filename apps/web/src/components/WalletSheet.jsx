import { X } from "lucide-react";
import { C } from "../theme";
import { ghost } from "./ui/styles";

/* Sheet "Activá tu saldo USDC" — fase 2: los duelos de plata real todavía no
   están (banner "pronto", como manda PLAN.md). La wallet embebida + USDC
   llegan con las fases 3-4; este sheet queda como teaser de la graduación.   */
export function WalletSheet({ onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 40, display: "flex", alignItems: "flex-end", justifyContent: "center",
      background: "rgba(6,3,12,.66)", backdropFilter: "blur(4px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{
        width: "100%", maxWidth: 440, background: C.bg2, borderRadius: "26px 26px 0 0",
        border: `1px solid ${C.line}`, borderBottom: "none", padding: "20px 18px 26px", boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 20 }}>Activá tu saldo USDC</span>
          <button onClick={onClose} className="press" style={{ ...ghost, padding: 6 }}><X size={20} /></button>
        </div>
        <p style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 16px" }}>
          Tu wallet se va a crear sola desde tu cuenta, sin frases raras ni apps extra. Cargás con tarjeta o cripto y jugás los duelos de plata real. El gas lo paga BARDOOO.
        </p>
        <div style={{
          width: "100%", border: `1px dashed ${C.gold}66`, borderRadius: 16, padding: "16px",
          fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.gold, textAlign: "center",
          background: `${C.gold}0d`, boxSizing: "border-box",
        }}>Pronto ⚡ los duelos de USDC están en camino</div>
        <p style={{ color: C.faint, fontSize: 11, margin: "12px 0 0", textAlign: "center", lineHeight: 1.5 }}>
          Mientras tanto: La Ficha diaria e invitar amigos suman puntos para jugar.
        </p>
      </div>
    </div>
  );
}
