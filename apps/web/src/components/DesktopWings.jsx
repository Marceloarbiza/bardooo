import { QRCodeSVG } from "qrcode.react";
import { Smartphone } from "lucide-react";
import { C } from "../theme";
import { Mark } from "./ui/brand";

/*  Alas de escritorio: en el teléfono no existen (mobile-first intacto). En una
    compu, el margen violeta muerto a los lados de la columna de 440px se
    convierte en un póster de marca — identidad a la izquierda, un QR para saltar
    al teléfono a la derecha. La app real sigue viviendo en la columna del medio.
    El QR lleva al link de referido si hay sesión (tráfico de invitación desde
    el desktop), o a la home si todavía no. */
export function DesktopWings({ origin, refSlug, connected }) {
  const qrUrl = connected && refSlug ? `${origin}/i/${refSlug}` : origin;
  const wing = {
    position: "fixed", top: 0, bottom: 0, width: "calc((100% - 440px) / 2)",
    display: "none", flexDirection: "column", justifyContent: "center",
    padding: "0 clamp(20px, 3vw, 56px)", boxSizing: "border-box", zIndex: 5, pointerEvents: "none",
  };
  return (
    <>
      {/* ── ala izquierda: identidad + el modelo en una línea ── */}
      <div className="dwing" style={{ ...wing, left: 0, alignItems: "flex-end", textAlign: "right" }}>
        <div style={{ maxWidth: 360 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
            <Mark size={54} />
          </div>
          <h1 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 46, lineHeight: 1, letterSpacing: -1, margin: "0 0 16px" }}>
            La arena de<br />apuestas<br />entre <span style={{ color: C.si }}>ami</span><span style={{ color: C.no }}>gos</span>.
          </h1>
          <p style={{ color: C.dim, fontSize: 15.5, lineHeight: 1.6, margin: "0 0 22px" }}>
            Cualquiera crea el duelo. La gente pone el pozo. El lado que pierde le paga al que gana. Sin casa, sin cuotas raras.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, alignItems: "flex-end" }}>
            <Step col={C.si} n="1" t="Elegís un SÍ o NO sobre lo que sea" />
            <Step col={C.no} n="2" t="Ponés tu lado en el pozo" />
            <Step col={C.gold} n="3" t="Ganás: cobrás la parte de los que perdieron" />
          </div>
        </div>
      </div>

      {/* ── ala derecha: el puente al teléfono ── */}
      <div className="dwing" style={{ ...wing, right: 0, alignItems: "flex-start" }}>
        <div style={{
          maxWidth: 300, background: `linear-gradient(165deg, ${C.bg2}, ${C.bg3})`,
          border: `1px solid ${C.line}`, borderRadius: 26, padding: 26,
          boxShadow: `0 24px 60px rgba(0,0,0,.5)`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.si, marginBottom: 6 }}>
            <Smartphone size={17} />
            <span style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 1.5 }}>DESDE EL TELÉFONO</span>
          </div>
          <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 21, lineHeight: 1.15, marginBottom: 16 }}>
            {connected ? "Compartí tu arena" : "Jugá en tu mano"}
          </div>
          <div style={{
            background: "#fff", borderRadius: 16, padding: 14, display: "grid", placeItems: "center",
            boxShadow: `0 0 0 1px ${C.line}`,
          }}>
            <QRCodeSVG value={qrUrl} size={196} level="M" bgColor="#ffffff" fgColor={C.bg}
              style={{ width: "100%", height: "auto" }} />
          </div>
          <p style={{ color: C.dim, fontSize: 12.5, lineHeight: 1.5, margin: "14px 0 0", textAlign: "center" }}>
            {connected
              ? <>Escaneá para abrir tu link de invitación. Si un amigo entra y juega, <b style={{ color: C.si }}>+25 pts</b> para vos.</>
              : "Escaneá y seguí jugando en el celular — es donde BARDOOO se siente mejor."}
          </p>
        </div>
      </div>
    </>
  );
}

function Step({ col, n, t }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, flexDirection: "row-reverse" }}>
      <span style={{
        width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: "grid", placeItems: "center",
        background: `${col}1c`, border: `1px solid ${col}55`, color: col, fontFamily: "Syne", fontWeight: 800, fontSize: 12,
      }}>{n}</span>
      <span style={{ color: C.text, fontSize: 13.5 }}>{t}</span>
    </div>
  );
}
