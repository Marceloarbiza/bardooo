import { C } from "../../theme";

/* La firma de BARDOOO: costura diagonal, marcador VS en el punto de choque,
   brillo que barre. big=true la agranda para el detalle.                 */
export function DuelBar({ pools, big }) {
  const total = pools[0] + pools[1];
  const pSi = total > 0 ? (pools[1] / total) * 100 : 50;
  const pNo = 100 - pSi;
  const h = big ? 58 : 34;
  const seam = Math.min(92, Math.max(8, pSi));
  return (
    <div style={{ position: "relative" }}>
      <div style={{
        display: "flex", height: h, borderRadius: h / 2.6, overflow: "hidden",
        background: C.bg3, border: `1px solid ${C.line}`, position: "relative",
      }}>
        <div style={{
          width: `${pSi}%`, minWidth: 0,
          background: `linear-gradient(90deg, ${C.siDeep}, ${C.si})`,
          clipPath: "polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)",
          display: "flex", alignItems: "center", paddingLeft: 14,
          transition: "width .6s cubic-bezier(.2,.8,.2,1)",
          boxShadow: `inset 0 0 24px ${C.siGlow}`,
        }}>
          <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: big ? 19 : 13, color: "#032018" }}>
            {Math.round(pSi)}%
          </span>
        </div>
        <div style={{
          flex: 1, marginLeft: -12,
          background: `linear-gradient(90deg, ${C.no}, ${C.noDeep})`,
          clipPath: "polygon(12px 0, 100% 0, 100% 100%, 0 100%)",
          display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 14,
          transition: "width .6s cubic-bezier(.2,.8,.2,1)",
          boxShadow: `inset 0 0 24px ${C.noGlow}`,
        }}>
          <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: big ? 19 : 13, color: "#2E0417" }}>
            {Math.round(pNo)}%
          </span>
        </div>
        <div className="shine" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
      </div>
      <div style={{
        position: "absolute", top: "50%", left: `${seam}%`,
        transform: "translate(-50%,-50%) rotate(-8deg)",
        transition: "left .6s cubic-bezier(.2,.8,.2,1)",
        background: C.bg, border: `1px solid ${C.line}`,
        borderRadius: 8, padding: big ? "4px 9px" : "2px 7px",
        fontFamily: "Syne", fontWeight: 800, fontSize: big ? 13 : 10,
        letterSpacing: 1, color: C.text,
        boxShadow: `0 0 14px rgba(0,0,0,.6), 0 0 20px ${C.siGlow}`,
      }}>VS</div>
    </div>
  );
}
