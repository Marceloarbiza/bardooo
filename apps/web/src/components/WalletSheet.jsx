import { useState } from "react";
import { CircleDot, Wallet, X } from "lucide-react";
import { C } from "../theme";
import { money } from "../lib/format";
import { ghost } from "./ui/styles";

/*  Sheet "Activá tu saldo USDC" — fase 3 (testnet Amoy):
    1) conectar la wallet (MetaMask / injected)
    2) firmar el vínculo con tu cuenta (el server verifica la firma)
    3) cargar 500 mUSDC del faucet de prueba
    En fase 4 esto se vuelve invisible: wallet embebida de Privy + onramp.    */

export function WalletSheet({ onClose, chain, me, onLink, fire }) {
  const [busy, setBusy] = useState(false);
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) {
      const { chainErrorMsg } = await import("../services/chainBetting");
      fire(chainErrorMsg(e), "err");
    }
    setBusy(false);
  };

  const step = !chain.isConnected ? 1 : !chain.linked ? 2 : 3;

  const bigBtn = (bg, shadow) => ({
    width: "100%", border: "none", borderRadius: 16, padding: "16px", cursor: "pointer",
    fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.bg, opacity: busy ? 0.6 : 1,
    background: bg, boxShadow: shadow,
  });

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

        {step === 1 && (<>
          <p style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 16px" }}>
            Fase de prueba (testnet Amoy): conectá tu wallet para jugar los duelos de USDC de mentira. En la app final la wallet se crea sola desde tu cuenta, sin extensiones.
          </p>
          <button onClick={() => run(chain.connect)} className="press"
            style={bigBtn(`linear-gradient(90deg, ${C.gold}, #ffdd8f)`, `0 10px 30px ${C.gold}44`)}>
            <Wallet size={16} style={{ verticalAlign: "-3px", marginRight: 8 }} />
            {busy ? "Conectando…" : "Conectar wallet (MetaMask)"}
          </button>
        </>)}

        {step === 2 && (<>
          <p style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 6px" }}>
            Wallet conectada: <b style={{ color: C.text }}>{short(chain.address)}</b>
          </p>
          <p style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 16px" }}>
            Falta vincularla a tu cuenta <b style={{ color: C.si }}>{me?.handle}</b>: firmás un mensaje (gratis, sin gas) y tus duelos on-chain quedan con tu nombre y tu bicho. Además, tus duelos saldrán en USDC <b style={{ color: C.text }}>y también en puntos</b> para toda tu audiencia.
          </p>
          <button onClick={() => run(async () => {
            const { address, signature } = await chain.signLink();
            const r = await onLink(address, signature);
            if (!r.ok) fire(r.error, "err");
            else fire("Wallet vinculada · tus duelos ahora salen en USDC y en puntos", "win");
          })} className="press"
            style={bigBtn(`linear-gradient(90deg, ${C.si}, #7cf7de)`, `0 10px 30px ${C.siGlow}`)}>
            {busy ? "Firmando…" : "Firmar y vincular"}
          </button>
        </>)}

        {step === 3 && (<>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: `${C.bg}99`, border: `1px solid ${C.line}`, borderRadius: 14,
            padding: "13px 16px", marginBottom: 14,
          }}>
            <span style={{ color: C.dim, fontSize: 13 }}>{short(chain.address)}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Syne", fontWeight: 800, fontSize: 20, color: C.gold }}>
              <CircleDot size={15} /> {money(chain.balance)}
            </span>
          </div>
          <button onClick={() => run(async () => {
            await chain.faucet();
            fire("¡500 USDC de prueba acreditados!", "win");
          })} className="press"
            style={bigBtn(`linear-gradient(90deg, ${C.gold}, #ffdd8f)`, `0 10px 30px ${C.gold}44`)}>
            {busy ? "Cargando…" : "Cargá 500 USDC de prueba (faucet)"}
          </button>
          <p style={{ color: C.faint, fontSize: 11, margin: "12px 0 0", textAlign: "center", lineHeight: 1.5 }}>
            Es MockUSDC de testnet: plata de mentira para probar los duelos on-chain. Necesitás un toque de POL de Amoy para el gas.
          </p>
        </>)}
      </div>
    </div>
  );
}
