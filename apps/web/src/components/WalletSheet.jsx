import { X } from "lucide-react";
import { C } from "../theme";
import { ghost } from "./ui/styles";

/* Sheet "Activá tu saldo USDC": la wallet es la graduación, no la entrada. */
export function WalletSheet({ onClose, onActivate }) {
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
          Tu wallet se crea sola desde tu cuenta, sin frases raras ni apps extra. Cargás con tarjeta o cripto y jugás los duelos de plata real. El gas lo paga BARDOOO.
        </p>
        <button onClick={onActivate} className="press" style={{
          width: "100%", border: "none", borderRadius: 16, padding: "16px", cursor: "pointer",
          fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.bg,
          background: `linear-gradient(90deg, ${C.gold}, #ffdd8f)`, boxShadow: `0 10px 30px ${C.gold}44`,
        }}>Activar wallet (demo: +500 USDC)</button>
        <p style={{ color: C.faint, fontSize: 11, margin: "12px 0 0", textAlign: "center", lineHeight: 1.5 }}>
          En la app real: wallet embebida (Privy / Web3Auth) creada desde tu login + depósito con tarjeta.
        </p>
      </div>
    </div>
  );
}
