import { C } from "../../theme";

/* Modal centrado y NOTORIO para los momentos que un toast no alcanza
   (referidos: bienvenida del invitado, "tu amigo entró", "+25"). */
export function PopModal({ emoji, title, body, cta = "¡Dale!", onClose }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 55, display: "grid", placeItems: "center",
      background: "rgba(6,3,12,.72)", backdropFilter: "blur(4px)", padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} className="rise" style={{
        width: "100%", maxWidth: 360, background: C.bg2, border: `1px solid ${C.si}55`,
        borderRadius: 24, padding: "26px 22px", boxSizing: "border-box", textAlign: "center",
        boxShadow: `0 20px 60px rgba(0,0,0,.6), 0 0 40px ${C.siGlow}`,
      }}>
        <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 10 }}>{emoji}</div>
        <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 22, marginBottom: 8 }}>{title}</div>
        <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.55, margin: "0 0 18px" }}>{body}</p>
        <button onClick={onClose} className="press" style={{
          width: "100%", border: "none", borderRadius: 16, padding: "15px", cursor: "pointer",
          fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.bg,
          background: `linear-gradient(90deg, ${C.si}, #7cf7de)`, boxShadow: `0 10px 28px ${C.siGlow}`,
        }}>{cta}</button>
      </div>
    </div>
  );
}
