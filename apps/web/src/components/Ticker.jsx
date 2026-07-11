import { C } from "../theme";
import { amt } from "../lib/format";

/* ========================= TICKER DE ACTIVIDAD ========================= */
/* Cada tipo de evento tiene su verbo: el server manda bet_created/resolved
   sin monto ni lado, y el viejo "metió {amt} al {lado}" único inventaba
   frases sin sentido ("metió 0 pts al NO" al crear un duelo).             */
export function Ticker({ items }) {
  const side = (s) => (
    <b style={{ color: s === 1 ? C.si : C.no, fontWeight: 800 }}>{s === 1 ? "SÍ" : "NO"}</b>
  );
  const phrase = (e) => {
    switch (e.type) {
      case "bet_created": return <>lanzó un duelo <span aria-hidden>🔥</span></>;
      case "resolved": return <>resolvió: ganó el {side(e.side)}</>;
      case "claimed": return <>cobró <b style={{ color: C.gold, fontWeight: 800 }}>{amt(e.cur, e.amt)}</b> <span aria-hidden>🏆</span></>;
      default: return <>metió {amt(e.cur, e.amt)} al {side(e.side)}</>;
    }
  };
  const dotCol = (e) =>
    e.type === "bet_created" || e.type === "claimed" ? C.gold : e.side === 1 ? C.si : C.no;

  const row = items.map((e, i) => (
    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, marginRight: 26, fontSize: 12, color: C.dim }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: dotCol(e) }} />
      <b style={{ color: C.text, fontWeight: 600 }}>{e.u}</b> {phrase(e)}
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
