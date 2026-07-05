import { ShieldCheck, Wallet } from "lucide-react";
import { C } from "../theme";
import { multFor } from "../lib/math";
import { Logo } from "./ui/brand";
import { DuelBar } from "./ui/DuelBar";
import { MultTag } from "./ui/badges";
import { Live } from "./ui/bits";
import { ghost } from "./ui/styles";

/* =============================== CONNECT =============================== */
export function Connect({ onConnect, now }) {
  const wob = (now / 1000) % 40;
  const demo = [95 + wob, 140 - wob];
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", padding: 24, position: "relative" }}>
      <div style={{ position: "relative", marginTop: 36 }}><Logo size={28} /></div>

      <div style={{ position: "relative", marginTop: "auto", marginBottom: 26 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: C.faint, marginBottom: 12 }}>
          LA ARENA DE APUESTAS ENTRE AMIGOS
        </div>
        <h1 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 52, lineHeight: 0.98, margin: "0 0 16px", letterSpacing: -1 }}>
          Elegí<br />tu <span style={{ color: C.si }}>la</span><span style={{ color: C.no }}>do</span>.
        </h1>
        <p style={{ color: C.dim, fontSize: 16, margin: "0 0 26px", maxWidth: 320, lineHeight: 1.5 }}>
          Cualquiera crea la apuesta. La gente pone el pozo. El lado que pierde le paga al que gana. Sin casa, sin cuotas raras.
        </p>

        <div style={{ background: `${C.bg2}cc`, border: `1px solid ${C.line}`, borderRadius: 20, padding: 16, marginBottom: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12.5, color: C.dim }}>¿La Mona da el primer golpe?</span>
            <Live />
          </div>
          <DuelBar pools={demo} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <MultTag side={1} m={multFor(demo, 1, 1000)} />
            <MultTag side={0} m={multFor(demo, 0, 1000)} />
          </div>
        </div>

        {/* google/twitter por REDIRECT (sin popups: funciona en la PWA instalada);
            email abre el modal de Privy (no necesita popup) */}
        <button onClick={() => onConnect("google")} className="press" style={{
          width: "100%", border: "none", borderRadius: 18, padding: "18px",
          fontFamily: "Syne", fontWeight: 800, fontSize: 17, color: C.bg, cursor: "pointer",
          background: "#FFFFFF",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        }}>
          <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 17 }}>G</span> Continuar con Google
        </button>
        {/* wallet al mismo nivel que Google: el público también es cripto */}
        <button onClick={() => onConnect("wallet")} className="press" style={{
          width: "100%", border: "none", borderRadius: 18, padding: "18px", marginTop: 10,
          fontFamily: "Syne", fontWeight: 800, fontSize: 17, color: C.bg, cursor: "pointer",
          background: `linear-gradient(90deg, ${C.gold}, #ffdd8f)`, boxShadow: `0 10px 30px ${C.gold}33`,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        }}>
          <Wallet size={18} /> Entrar con wallet
        </button>
        <button onClick={() => onConnect("email")} className="press" style={{
          width: "100%", borderRadius: 18, padding: "16px", marginTop: 10, cursor: "pointer",
          fontFamily: "Syne", fontWeight: 800, fontSize: 15, color: C.text,
          background: "transparent", border: `1.5px solid ${C.line}`,
        }}>Entrar con email</button>
        <button onClick={() => onConnect("twitter")} className="press" style={{
          ...ghost, width: "100%", justifyContent: "center", marginTop: 12, fontSize: 13,
        }}>
          Continuar con X (Twitter)
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, color: C.faint, fontSize: 12 }}>
          <ShieldCheck size={14} /> Jugás gratis con puntos · la wallet, cuando vos quieras
        </div>
      </div>
    </div>
  );
}
