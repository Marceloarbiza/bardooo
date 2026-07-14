import { useState } from "react";
import { CircleDot, Sparkles, Wallet, X } from "lucide-react";
import { C } from "../theme";
import { money } from "../lib/format";
import { ghost } from "./ui/styles";

/*  Sheet "Activá tu saldo USDC" — fase 4, la graduación de verdad:
    1) crear la wallet EMBEBIDA desde tu misma cuenta (sin extensión, sin
       frase semilla) — o conectar una externa si ya tenés
    2) firmar el vínculo con tu cuenta (el server verifica la firma)
    3) cargar 500 mUSDC de prueba (si el relayer está prendido, sin gas)
    El onramp real (tarjeta/depósito) llega con la fase de dinero real.      */

export function WalletSheet({ onClose, chain, me, onLink, fire, desktop }) {
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
      position: "fixed", inset: 0, zIndex: 40, display: "flex", justifyContent: "center",
      alignItems: desktop ? "center" : "flex-end", padding: desktop ? 20 : 0,
      background: "rgba(6,3,12,.66)", backdropFilter: "blur(4px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} className={desktop ? "rise" : "sheet"} style={{
        width: "100%", maxWidth: desktop ? 420 : 440, background: C.bg2,
        borderRadius: desktop ? 24 : "26px 26px 0 0",
        border: `1px solid ${C.line}`, borderBottom: desktop ? `1px solid ${C.line}` : "none",
        padding: "20px 18px 26px", boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 20 }}>Activá tu saldo USDC</span>
          <button onClick={onClose} className="press" style={{ ...ghost, padding: 6 }}><X size={20} /></button>
        </div>

        {step === 1 && (<>
          <p style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 16px" }}>
            Tu wallet se crea sola desde tu cuenta: sin extensiones, sin frases raras. {chain.gaslessOn ? "Y el gas lo paga BARDOOO." : ""}
          </p>
          <button onClick={() => run(chain.createEmbedded)} className="press"
            style={bigBtn(`linear-gradient(90deg, ${C.gold}, #ffdd8f)`, `0 10px 30px ${C.gold}44`)}>
            <Sparkles size={16} style={{ verticalAlign: "-3px", marginRight: 8 }} />
            {busy ? "Creando…" : "Crear mi wallet BARDOOO"}
          </button>
          <button onClick={() => run(chain.connectExternal)} className="press" style={{
            ...ghost, width: "100%", justifyContent: "center", marginTop: 12, fontSize: 13,
          }}>
            <Wallet size={15} /> Ya tengo wallet (MetaMask y otras)
          </button>
        </>)}

        {step === 2 && (<>
          <p style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 6px" }}>
            Wallet lista: <b style={{ color: C.text }}>{short(chain.address)}</b>{chain.isEmbedded ? " (tu wallet BARDOOO)" : ""}
          </p>
          <p style={{ color: C.dim, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 16px" }}>
            Último paso: una firma (gratis) la vincula a tu cuenta <b style={{ color: C.si }}>{me?.handle}</b>. Tus duelos saldrán en USDC <b style={{ color: C.text }}>y también en puntos</b> para toda tu audiencia — y tu bicho cambia de semilla 👾.
          </p>
          <button onClick={() => run(async () => {
            const { address, signature } = await chain.signLink();
            const r = await onLink(address, signature);
            if (!r.ok) fire(r.error, "err");
            else fire("Wallet vinculada · conocé a tu bicho definitivo", "win");
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
            {chain.gaslessOn
              ? "Es MockUSDC de testnet. El gas lo paga BARDOOO: no necesitás POL ni saber qué es."
              : "Es MockUSDC de testnet. Necesitás un toque de POL de Amoy para el gas."}
          </p>
        </>)}
      </div>
    </div>
  );
}
