import { useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { C, CLOSE_OFFSET_MIN } from "../theme";
import { fmtDateTime, toLocalInput } from "../lib/format";
import { DateField, Label, NumField, Row, Seg } from "./ui/bits";
import { ghost } from "./ui/styles";

/* =============================== CREATE =============================== */
const DURATIONS = [
  { label: "30 min", v: "30" },
  { label: "1 h", v: "60" },
  { label: "2 h", v: "120" },
  { label: "Configurable", v: "custom" },
];

export function Create({ onCreate, onBack, walletOn, bondPts = 0 }) {
  const [isPrivate, setIsPrivate] = useState(false);
  const [code, setCode] = useState("");
  const [question, setQuestion] = useState("");
  const [stakeMode, setStakeMode] = useState("free");
  const [fixedAmount, setFixedAmount] = useState(20);
  const [maxStake, setMaxStake] = useState(50);
  const [minStake, setMinStake] = useState(5);
  const [maxBettors, setMaxBettors] = useState(0);

  const defaultStart = toLocalInput(new Date(Date.now() + 60 * 60000));
  const [timeMode, setTimeMode] = useState("guided"); // guided | manual
  const [eventAt, setEventAt] = useState(defaultStart);
  const [durChoice, setDurChoice] = useState("120");
  const [customQty, setCustomQty] = useState(3);
  const [customUnit, setCustomUnit] = useState("days"); // minutes | hours | days
  const [resolveAt, setResolveAt] = useState(toLocalInput(new Date(Date.now() + 3 * 60 * 60000)));

  const unitMins = { minutes: 1, hours: 60, days: 60 * 24 };
  const durM = durChoice === "custom"
    ? Math.max(1, Number(customQty) || 0) * unitMins[customUnit]
    : Number(durChoice);
  const eventTime = Date.parse(eventAt);
  const closeTime = isNaN(eventTime) ? NaN : eventTime - CLOSE_OFFSET_MIN * 60000;
  const resolveTime = timeMode === "manual" ? Date.parse(resolveAt) : (isNaN(eventTime) ? NaN : eventTime + durM * 60000);

  const timeOk = !isNaN(closeTime) && closeTime > Date.now() && !isNaN(resolveTime) && resolveTime > eventTime;
  const valid = question.trim().length > 6 && timeOk;

  const submit = () => valid && onCreate({
    question: question.trim(), stakeMode, fixedAmount: Number(fixedAmount),
    maxStake: Number(maxStake), minStake: Number(minStake),
    maxBettors: Number(maxBettors), isPrivate, code: isPrivate ? code.trim() : "",
    closeTime, resolveTime,
  });

  return (
    <div style={{ paddingTop: 12 }}>
      <button onClick={onBack} className="press" style={ghost}><ChevronLeft size={18} /> Volver</button>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: C.faint, margin: "10px 0 2px" }}>NUEVO DUELO</div>
      <h2 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 27, margin: "0 0 18px" }}>Crear apuesta</h2>

      <Label>La pregunta (se responde SÍ o NO)</Label>
      <textarea value={question} onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ej: ¿La Mona da el primer golpe en el round 1?"
        rows={2} style={{
          width: "100%", boxSizing: "border-box", background: C.bg2, border: `1px solid ${C.line}`,
          borderRadius: 14, padding: 14, color: C.text, fontSize: 16, fontFamily: "inherit",
          resize: "none", outline: "none", marginBottom: 18,
        }} />

      <Label>Visibilidad</Label>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[[false, "Pública"], [true, "Privada (solo con link)"]].map(([k, l]) => (
          <Seg key={String(k)} on={isPrivate === k} col={k ? C.gold : C.si} onClick={() => setIsPrivate(k)}>{l}</Seg>
        ))}
      </div>
      {isPrivate && (
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12}
          placeholder="Código de acceso (opcional)" style={{
            width: "100%", boxSizing: "border-box", background: C.bg2, border: `1px solid ${C.gold}44`,
            borderRadius: 12, padding: "12px 14px", color: C.gold, fontSize: 15, outline: "none",
            fontFamily: "inherit", fontWeight: 700, letterSpacing: 1, marginBottom: 14,
          }} />
      )}

      <Label>Modo de monto</Label>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["free", "Libre"], ["fixed", "Fijo"]].map(([k, l]) => (
          <Seg key={k} on={stakeMode === k} col={C.si} onClick={() => setStakeMode(k)}>{l}</Seg>
        ))}
      </div>

      {stakeMode === "fixed" && <NumField label="Monto fijo para todos" v={fixedAmount} set={setFixedAmount} />}
      {stakeMode !== "fixed" && <NumField label="Apuesta mínima" v={minStake} set={setMinStake} />}
      <NumField label="Máx. de apostadores (0 = sin límite)" v={maxBettors} set={setMaxBettors} />

      <div style={{ height: 1, background: C.line, margin: "6px 0 18px" }} />
      <Label>¿Cuándo se juega?</Label>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["guided", "Guiada"], ["manual", "Manual"]].map(([k, l]) => (
          <Seg key={k} on={timeMode === k} col={C.gold} onClick={() => setTimeMode(k)}>{l}</Seg>
        ))}
      </div>

      <DateField label="Fecha y hora del evento" v={eventAt} set={setEventAt} />

      {timeMode === "guided" ? (
        <>
          <Label>Duración (para saber cuándo cargar el resultado)</Label>
          <div style={{ display: "flex", gap: 8, marginBottom: durChoice === "custom" ? 12 : 6, flexWrap: "wrap" }}>
            {DURATIONS.map((d) => (
              <Seg key={d.v} grow on={durChoice === d.v} col={C.si} onClick={() => setDurChoice(d.v)}>{d.label}</Seg>
            ))}
          </div>
          {durChoice === "custom" && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <Label>Cantidad</Label>
                <input type="number" min={1} value={customQty} onChange={(e) => setCustomQty(e.target.value)} style={{
                  width: "100%", boxSizing: "border-box", background: C.bg2, border: `1px solid ${C.line}`,
                  borderRadius: 12, padding: "12px 14px", color: C.text, fontSize: 16, outline: "none", fontFamily: "inherit",
                }} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["minutes", "min"], ["hours", "horas"], ["days", "días"]].map(([k, l]) => (
                  <Seg key={k} pad on={customUnit === k} col={C.si} onClick={() => setCustomUnit(k)}>{l}</Seg>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <DateField label="Fecha y hora de fin" v={resolveAt} set={setResolveAt} />
      )}

      <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, margin: "6px 0 18px" }}>
        <Row k="Las apuestas cierran" v={fmtDateTime(closeTime)} note={`${CLOSE_OFFSET_MIN} min antes`} />
        <div style={{ height: 1, background: C.line, margin: "10px 0" }} />
        <Row k="Resultado a partir de" v={fmtDateTime(resolveTime)} col={C.gold} />
        {!timeOk && (
          <div style={{ color: C.no, fontSize: 12, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <X size={14} /> {isNaN(eventTime) ? "Elegí fecha y hora del evento" :
              closeTime <= Date.now() ? "El evento es muy pronto: el cierre ya pasó" :
              "El resultado tiene que ser después del evento"}
          </div>
        )}
      </div>

      <div style={{
        background: `linear-gradient(160deg, ${C.gold}10, ${C.bg2})`,
        border: `1px solid ${C.gold}33`, borderRadius: 14, padding: "13px 16px", marginBottom: 20,
      }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 3 }}>
          Tu comisión: <span style={{ color: C.gold }}>7%</span> del pozo
        </div>
        <div style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.5 }}>
          Comisión total fija del 10% (7% vos + 3% BARDOOO). Sale del pozo y nunca hace que un ganador cobre menos de lo que puso. En relámpagos tu parte sube al 9%.
          {bondPts > 0 && <> Al lanzar se retienen <b style={{ color: C.gold }}>{bondPts} pts de garantía</b>: te vuelven al cargar el resultado.</>}
        </div>
      </div>

      <p style={{ color: C.faint, fontSize: 11.5, margin: "0 0 12px", lineHeight: 1.5, textAlign: "center" }}>
        {walletOn ? "Sale en USDC y también en puntos, para que juegue toda tu audiencia." : "Se juega con puntos. Activá tu wallet para lanzar también en USDC."}
      </p>
      <button onClick={submit} disabled={!valid} className="press" style={{
        width: "100%", border: "none", borderRadius: 18, padding: "18px", cursor: valid ? "pointer" : "not-allowed",
        fontFamily: "Syne", fontWeight: 800, fontSize: 17, color: C.bg, opacity: valid ? 1 : .4,
        background: `linear-gradient(90deg, ${C.gold}, ${C.si})`,
        boxShadow: valid ? `0 10px 30px ${C.gold}33` : "none",
      }}>Lanzar duelo</button>
    </div>
  );
}
