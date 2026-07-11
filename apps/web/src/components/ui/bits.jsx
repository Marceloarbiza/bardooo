import { Check, Clock, Sparkles, Trophy, X } from "lucide-react";
import { C } from "../../theme";

export function Live() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, letterSpacing: 1.5, color: C.no }}>
      <span className="blink" style={{ width: 6, height: 6, borderRadius: 99, background: C.no, boxShadow: `0 0 8px ${C.no}` }} />
      EN VIVO
    </span>
  );
}

export function Timer({ closed, left }) {
  const fmt = () => {
    if (closed || left <= 0) return "cerrada";
    const s = Math.floor(left / 1000), m = Math.floor(s / 60);
    if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  };
  const urgent = !closed && left > 0 && left < 60000;
  return (
    <div className={urgent ? "blink" : ""} style={{
      display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999,
      fontSize: 12, fontWeight: 700,
      background: urgent ? `${C.no}22` : C.bg3,
      color: closed ? C.faint : urgent ? C.no : C.dim,
      border: `1px solid ${urgent ? C.no + "55" : C.line}`,
    }}>
      <Clock size={13} /> {fmt()}
    </div>
  );
}

export function Chip({ col, label, v }) {
  return (
    <div style={{ flex: 1, background: C.bg2, border: `1px solid ${col}55`, borderRadius: 14, padding: "10px 12px" }}>
      <div style={{ color: col, fontSize: 11, fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 18 }}>{v}</div>
    </div>
  );
}

export function Banner({ color, text }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${color}55`, borderRadius: 14, padding: "14px 16px", color: C.dim, fontSize: 13.5, lineHeight: 1.5 }}>
      {text}
    </div>
  );
}

export function Label({ children }) {
  return <div style={{ fontSize: 12.5, fontWeight: 700, color: C.dim, marginBottom: 8 }}>{children}</div>;
}

export function NumField({ label, v, set }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      <input type="number" value={v} onChange={(e) => set(e.target.value)} style={{
        width: "100%", boxSizing: "border-box", background: C.bg2, border: `1px solid ${C.line}`,
        borderRadius: 12, padding: "12px 14px", color: C.text, fontSize: 16, outline: "none", fontFamily: "inherit",
      }} />
    </div>
  );
}

export function DateField({ label, v, set }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      <input type="datetime-local" value={v} onChange={(e) => set(e.target.value)} style={{
        width: "100%", boxSizing: "border-box", background: C.bg2, border: `1px solid ${C.line}`,
        borderRadius: 12, padding: "12px 14px", color: C.text, fontSize: 16, outline: "none",
        fontFamily: "inherit", colorScheme: "dark",
      }} />
    </div>
  );
}

export function Row({ k, v, note, col }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: C.dim, fontSize: 13 }}>{k}{note && <span style={{ color: C.faint, fontSize: 11 }}> · {note}</span>}</span>
      <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 14, color: col || C.text, textAlign: "right" }}>{v}</span>
    </div>
  );
}

export function Seg({ on, col, onClick, children, grow, pad }) {
  return (
    <button onClick={onClick} className="press" style={{
      flex: grow ? "1 1 auto" : pad ? "0 0 auto" : 1,
      padding: pad ? "12px 12px" : "11px 12px", borderRadius: 12, cursor: "pointer",
      fontWeight: 700, fontSize: 13.5,
      color: on ? C.bg : C.text,
      background: on ? col : "transparent",
      border: `1px solid ${on ? col : C.line}`,
    }}>{children}</button>
  );
}

/* Stepper estilo control remoto: numero heroe arriba (quieto), pildora de botones abajo */
export function Stepper({ label, value, steps, min, max, onChange, color = C.gold, prefix, suffix }) {
  const clamp = (v) => Math.min(max ?? Infinity, Math.max(min ?? 0, v));
  const all = [...steps].sort((a, b) => a - b);
  const pct = min != null && max != null ? ((value - min) / (max - min)) * 100 : null;
  return (
    <div style={{
      background: `linear-gradient(165deg, ${color}10, ${C.bg3})`,
      border: `1px solid ${color}30`, borderRadius: 18,
      padding: "13px 14px 12px", marginBottom: 12, textAlign: "center",
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 2.2, color: C.dim, textTransform: "uppercase", marginBottom: 7 }}>
        {label}
      </div>
      <div key={String(value)} className="pop" style={{
        fontFamily: "Syne", fontWeight: 800, fontSize: 38, color, lineHeight: 1,
        textShadow: `0 0 26px ${color}50`, marginBottom: pct != null ? 10 : 12,
      }}>
        {prefix && <span style={{ fontSize: 22, marginRight: 2 }}>{prefix}</span>}
        {Number(value).toLocaleString("es-UY")}
        {suffix && <span style={{ fontSize: 15, color: C.dim, marginLeft: 8, fontWeight: 700, letterSpacing: 1.5 }}>{suffix}</span>}
      </div>
      {pct != null && (
        <div style={{ height: 4, borderRadius: 4, background: `${C.bg}cc`, margin: "0 26px 12px", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: `linear-gradient(90deg, ${color}55, ${color})`, transition: "width .25s ease" }} />
        </div>
      )}
      <div style={{
        display: "flex", alignItems: "stretch", background: `${C.bg}b8`,
        border: `1px solid ${C.line}`, borderRadius: 999, overflow: "hidden",
      }}>
        {all.map((s, i) => {
          const nv = clamp(value + s);
          const off = nv === value;
          return (
            <button key={s} disabled={off} onClick={() => !off && onChange(nv)} className="press" style={{
              flex: 1, border: "none", cursor: off ? "default" : "pointer",
              borderLeft: i > 0 ? `1px solid ${C.line}` : "none",
              background: s > 0 && !off ? `${color}12` : "transparent",
              fontFamily: "Syne", fontWeight: 800, fontSize: 15, padding: "12px 0",
              color: off ? C.faint : s > 0 ? color : C.text,
              opacity: off ? 0.35 : 1,
            }}>{s > 0 ? `+${s}` : s}</button>
          );
        })}
      </div>
    </div>
  );
}

export function Empty() {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.faint }}>
      <Sparkles size={32} style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>Todavía no jugaste ninguna.<br />Pasá por la Arena y elegí tu lado.</div>
    </div>
  );
}

export function Toast({ t }) {
  const col = t.kind === "err" ? C.no : t.kind === "win" ? C.gold : C.si;
  return (
    <div key={t.id} className="toast" style={{
      position: "fixed", bottom: "calc(96px + env(safe-area-inset-bottom, 0px))", left: "50%", transform: "translateX(-50%)", zIndex: 50,
      maxWidth: 400, width: "calc(100% - 40px)", background: C.bg3, border: `1px solid ${col}`,
      borderRadius: 14, padding: "13px 16px", display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 10px 30px rgba(0,0,0,.5)",
    }}>
      <div style={{ width: 22, height: 22, borderRadius: 999, background: col, display: "grid", placeItems: "center", flexShrink: 0 }}>
        {t.kind === "err" ? <X size={14} color={C.bg} /> : t.kind === "win" ? <Trophy size={13} color={C.bg} /> : <Check size={14} color={C.bg} />}
      </div>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{t.msg}</span>
    </div>
  );
}

export function Burst() {
  const cols = [C.si, C.no, C.gold, "#8A6CFF", "#FF9A3D"];
  const parts = Array.from({ length: 30 }, (_, i) => ({
    left: 6 + Math.random() * 88,
    delay: Math.random() * 0.3,
    dur: 1 + Math.random() * 0.6,
    size: 6 + Math.random() * 8,
    rot: Math.random() * 360,
    col: cols[i % cols.length],
  }));
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60, overflow: "hidden" }}>
      {parts.map((p, i) => (
        <span key={i} style={{
          position: "absolute", top: "-4%", left: `${p.left}%`,
          width: p.size, height: p.size * 0.45, background: p.col, borderRadius: 2,
          transform: `rotate(${p.rot}deg)`,
          animation: `fall ${p.dur}s ${p.delay}s cubic-bezier(.2,.7,.3,1) forwards`,
        }} />
      ))}
    </div>
  );
}
