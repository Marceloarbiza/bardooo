import { C } from "../theme";
import { amt } from "../lib/format";

/* ========================= TICKER DE ACTIVIDAD ========================= */
export function Ticker({ items }) {
  const row = items.map((e, i) => (
    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginRight: 26, fontSize: 12, color: C.dim }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: e.side === 1 ? C.si : C.no }} />
      <b style={{ color: C.text, fontWeight: 600 }}>{e.u}</b> metió {amt(e.cur, e.amt)} al
      <b style={{ color: e.side === 1 ? C.si : C.no, fontWeight: 800 }}>{e.side === 1 ? "SÍ" : "NO"}</b>
    </span>
  ));
  return (
    <div style={{ overflow: "hidden", borderBottom: `1px solid ${C.line}`, background: `${C.bg2}88`, padding: "7px 0", position: "relative", zIndex: 10 }}>
      <div className="marquee" style={{ display: "inline-flex", whiteSpace: "nowrap", paddingLeft: 16 }}>
        {row}{row}
      </div>
    </div>
  );
}
