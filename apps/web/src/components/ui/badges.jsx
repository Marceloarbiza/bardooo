import { Lock, Zap } from "lucide-react";
import { C } from "../../theme";
import { fmtMult } from "../../lib/format";

export function PrivBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
      border: `1px solid ${C.gold}55`, background: `${C.gold}12`, color: C.gold,
      borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, letterSpacing: 1,
    }}>
      <Lock size={10} /> PRIVADA
    </span>
  );
}

export function PtsBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0,
      border: `1px solid ${C.si}55`, background: `${C.si}12`, color: C.si,
      borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, letterSpacing: 1,
    }}>
      <Zap size={10} fill={C.si} /> PUNTOS
    </span>
  );
}

export function MultTag({ side, m }) {
  const col = side === 1 ? C.si : C.no;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      border: `1px solid ${col}44`, background: `${col}12`,
      borderRadius: 999, padding: "3px 9px", fontSize: 11.5, fontWeight: 700, color: col,
    }}>
      {side === 1 ? "SÍ" : "NO"} {m == null
        ? <b style={{ fontFamily: "Syne", fontWeight: 800 }}>¡sé el 1ro!</b>
        : <>paga <b style={{ fontFamily: "Syne", fontWeight: 800 }}>{fmtMult(m)}</b></>}
    </span>
  );
}
