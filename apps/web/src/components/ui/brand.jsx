import { C } from "../../theme";

/* Marca BARDOOO: el anillo partido — un circulo dividido en teal/magenta, el duelo
   hecho simbolo. Mismo signo en el isotipo, la O del wordmark y el chip de puntos.
   El rayo queda SOLO para el boton de relampago. */
export function Mark({ size = 26 }) {
  return (
    <span style={{ display: "inline-block", flexShrink: 0, filter: `drop-shadow(0 0 9px ${C.siGlow}) drop-shadow(0 0 9px ${C.noGlow})` }}>
      <ORing size={size} hole={C.bg} />
    </span>
  );
}

export function ORing({ size = 14, hole = C.bg }) {
  return (
    <span style={{ position: "relative", display: "inline-block", width: size, height: size, verticalAlign: "-6%" }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.bg, overflow: "hidden" }}>
        <span style={{ position: "absolute", inset: 0, background: C.si, clipPath: "polygon(0 0, 72% 0, 20% 100%, 0 100%)" }} />
        <span style={{ position: "absolute", inset: 0, background: C.no, clipPath: "polygon(80% 0, 100% 0, 100% 100%, 28% 100%)" }} />
      </span>
      <span style={{ position: "absolute", inset: "27%", borderRadius: "50%", background: hole }} />
    </span>
  );
}

export function Logo({ size = 20 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <Mark size={size + 7} />
      <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: size, letterSpacing: 0.5 }}>BARDOOO</span>
    </div>
  );
}
