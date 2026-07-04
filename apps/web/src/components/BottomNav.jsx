import { Home, Plus, Ticket, Zap } from "lucide-react";
import { C } from "../theme";

export function BottomNav({ view, setView, onQuick }) {
  const Item = ({ id, icon, label }) => (
    <button onClick={() => setView(id)} className="press" style={{
      background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column",
      alignItems: "center", gap: 4, color: view === id ? C.text : C.faint, flex: 1, padding: "8px 0",
    }}>{icon}<span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5 }}>{label}</span></button>
  );
  return (
    <div style={{
      position: "fixed", bottom: 12, left: 0, right: 0, maxWidth: 408, margin: "0 auto",
      background: `${C.bg2}f0`, backdropFilter: "blur(16px)", border: `1px solid ${C.line}`,
      borderRadius: 24, display: "flex", alignItems: "center", padding: "6px 12px",
      boxShadow: "0 14px 40px rgba(0,0,0,.55)", zIndex: 30,
    }}>
      <Item id="feed" icon={<Home size={21} />} label="Arena" />
      <Item id="create" icon={<Plus size={21} />} label="Crear" />
      <button onClick={onQuick} className="press" title="Relámpago" style={{
        width: 58, height: 58, borderRadius: 20, margin: "-18px 8px 0", border: `3px solid ${C.bg}`,
        cursor: "pointer", background: `linear-gradient(135deg, ${C.gold}, ${C.no})`,
        display: "grid", placeItems: "center", boxShadow: `0 10px 28px ${C.noGlow}`, flexShrink: 0,
      }}><Zap size={26} color={C.bg} fill={C.bg} strokeWidth={2.4} /></button>
      <Item id="mine" icon={<Ticket size={21} />} label="Mías" />
    </div>
  );
}
