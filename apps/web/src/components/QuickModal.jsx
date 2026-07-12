import { useState } from "react";
import { Lock, X, Zap } from "lucide-react";
import { C } from "../theme";
import { Seg, Stepper } from "./ui/bits";
import { ghost } from "./ui/styles";

/* ======================= RELÁMPAGO (bottom sheet) ======================= */
export function QuickModal({ onClose, onCreate, goFull, walletOn, bondPts = 0, fees, initialQuestion }) {
  // comisiones vigentes del relámpago (perillas del server, /config)
  const fPlat = (fees?.flashPlatformBps ?? 100) / 100;
  const fCre = (fees?.flashCreatorBps ?? 900) / 100;
  const pct = (n) => `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
  const [question, setQuestion] = useState(initialQuestion ?? ""); // revancha: llega prellenada
  const [stakeMode, setStakeMode] = useState("free");
  const [fixedAmount, setFixedAmount] = useState(20);
  const [windowMin, setWindowMin] = useState(15); // 5 a 60, de a 5
  const [isPrivate, setIsPrivate] = useState(false);
  const [code, setCode] = useState("");
  const valid = question.trim().length > 6 && (stakeMode !== "fixed" || Number(fixedAmount) > 0);

  const submit = () => {
    if (!valid) return;
    // los tiempos del relámpago los fija el SERVER (cierre = ahora + ventana;
    // deadline = cierre + 30 min): el cliente solo manda la ventana elegida
    onCreate({
      question: question.trim(), stakeMode, fixedAmount: Number(fixedAmount),
      maxStake: 0, minStake: stakeMode === "fixed" ? Number(fixedAmount) : 5,
      maxBettors: 0, isPrivate, code: isPrivate ? code.trim() : "",
      relampago: true, windowMin,
    });
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 40, display: "flex", alignItems: "flex-end", justifyContent: "center",
      background: "rgba(6,3,12,.66)", backdropFilter: "blur(4px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{
        width: "100%", maxWidth: 440, background: C.bg2, borderRadius: "26px 26px 0 0",
        border: `1px solid ${C.line}`, borderBottom: "none", padding: "18px 18px 26px", boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={18} color={C.gold} fill={C.gold} />
            <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 20 }}>Relámpago</span>
          </div>
          <button onClick={onClose} className="press" style={{ ...ghost, padding: 6 }}><X size={20} /></button>
        </div>

        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} autoFocus
          placeholder="¿Hay gol antes del entretiempo?"
          rows={2} style={{
            width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.line}`,
            borderRadius: 14, padding: 13, color: C.text, fontSize: 16, fontFamily: "inherit",
            resize: "none", outline: "none", marginBottom: 12,
          }} />

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[[false, "Pública"], [true, "Privada"]].map(([k, l]) => (
            <Seg key={String(k)} on={isPrivate === k} col={k ? C.gold : C.si} onClick={() => setIsPrivate(k)}>
              {k ? <><Lock size={12} style={{ verticalAlign: "-1px", marginRight: 4 }} />{l}</> : l}
            </Seg>
          ))}
        </div>
        {isPrivate && (
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12}
            placeholder="Código de acceso (opcional), ej: ASADO" style={{
              width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.gold}44`,
              borderRadius: 12, padding: "11px 13px", color: C.gold, fontSize: 15, outline: "none",
              fontFamily: "inherit", fontWeight: 700, letterSpacing: 1, marginBottom: 10,
            }} />
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: stakeMode === "fixed" ? 10 : 12 }}>
          {[["free", "Apuesta libre"], ["fixed", "Monto fijo"]].map(([k, l]) => (
            <Seg key={k} on={stakeMode === k} col={C.si} onClick={() => setStakeMode(k)}>{l}</Seg>
          ))}
        </div>
        {stakeMode === "fixed" && (
          <Stepper label="Monto para todos" value={Number(fixedAmount)}
            steps={[-25, -5, 5, 25]} min={5} onChange={setFixedAmount} />
        )}

        <Stepper label="Abierta por" value={windowMin} suffix="min"
          steps={[-5, 5]} min={5} max={60} onChange={setWindowMin} />

        <p style={{ color: C.faint, fontSize: 11.5, margin: "0 0 14px", lineHeight: 1.5 }}>
          Se lanza ya{walletOn ? " en USDC y en puntos" : " en puntos"} · cierra en {windowMin} min · tenés 30 min más para cargar el resultado o se anula · tu comisión <b style={{ color: C.gold }}>{pct(fCre)}</b> ({fPlat > 0 ? `BARDOOO cobra solo ${pct(fPlat)}` : "BARDOOO no cobra nada"}).
          {bondPts > 0 && <> Se retienen <b style={{ color: C.gold }}>{bondPts} pts de garantía</b> que vuelven al resolver.</>}
        </p>

        <button onClick={submit} disabled={!valid} className="press" style={{
          width: "100%", border: "none", borderRadius: 16, padding: "16px", cursor: valid ? "pointer" : "not-allowed",
          fontFamily: "Syne", fontWeight: 800, fontSize: 17, color: C.bg, opacity: valid ? 1 : .4,
          background: `linear-gradient(90deg, ${C.gold}, ${C.no})`,
          boxShadow: valid ? `0 10px 30px ${C.noGlow}` : "none",
        }}>⚡ Lanzar ya</button>

        <button onClick={goFull} className="press" style={{ ...ghost, width: "100%", justifyContent: "center", marginTop: 10, fontSize: 13 }}>
          ¿Evento con fecha? Modo completo →
        </button>
      </div>
    </div>
  );
}
