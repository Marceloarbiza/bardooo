import { useState } from "react";
import { ChevronLeft, SlidersHorizontal, X, Zap } from "lucide-react";
import { C } from "../theme";
import { fmtDateTime, toLocalInput } from "../lib/format";
import { BetCard } from "./Arena";
import { DateField, Row, Seg, Stepper } from "./ui/bits";
import { ghost } from "./ui/styles";

/* =============================== CREATE ===============================
   Reforma 2026-07-11: alineada al lenguaje del resto de la app —
   steppers en vez de inputs crudos, UN solo flujo de tiempo (muere el
   toggle Guiada/Manual), tres tarjetas con jerarquía, ajustes finos
   plegados y preview EN VIVO con el BetCard real de la Arena.
   El payload de onCreate no cambia.                                     */

const DURATIONS = [
  { label: "30 min", v: "30" },
  { label: "1 h", v: "60" },
  { label: "2 h", v: "120" },
  { label: "Fin exacto", v: "end" },
];

const card = { background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, marginBottom: 14 };
const kicker = { fontSize: 10.5, fontWeight: 800, letterSpacing: 2.2, color: C.faint, textTransform: "uppercase", marginBottom: 10 };

export function Create({ onCreate, onBack, onQuick, walletOn, bondPts = 0, fees, profile, now = Date.now() }) {
  // comisiones vigentes: vienen de /config (perillas del server), jamás hardcodeadas
  const platformPct = (fees?.platformBps ?? 300) / 100;
  const creatorPct = (fees?.creatorBps ?? 700) / 100;
  const flashCreatorPct = (fees?.flashCreatorBps ?? 900) / 100;
  const totalPct = platformPct + creatorPct;
  const pct = (n) => `${Number.isInteger(n) ? n : n.toFixed(2)}%`;

  const [question, setQuestion] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [code, setCode] = useState("");
  const [stakeMode, setStakeMode] = useState("free");
  const [fixedAmount, setFixedAmount] = useState(20);
  const [minStake, setMinStake] = useState(5);
  const [maxBettors, setMaxBettors] = useState(0);
  const [showFine, setShowFine] = useState(false);

  const [eventAt, setEventAt] = useState(toLocalInput(new Date(Date.now() + 60 * 60000)));
  const [durChoice, setDurChoice] = useState("120");
  const [resolveAt, setResolveAt] = useState(toLocalInput(new Date(Date.now() + 3 * 60 * 60000)));

  const eventTime = Date.parse(eventAt);
  // sin buffer (decisión 2026-07-10): se apuesta hasta la hora EXACTA del evento
  const closeTime = eventTime;
  const resolveTime = durChoice === "end"
    ? Date.parse(resolveAt)
    : (isNaN(eventTime) ? NaN : eventTime + Number(durChoice) * 60000);

  const timeOk = !isNaN(closeTime) && closeTime > now && !isNaN(resolveTime) && resolveTime > eventTime;
  const valid = question.trim().length > 6 && timeOk;

  const submit = () => valid && onCreate({
    question: question.trim(), stakeMode, fixedAmount: Number(fixedAmount),
    maxStake: 50, minStake: Number(minStake),
    maxBettors: Number(maxBettors), isPrivate, code: isPrivate ? code.trim() : "",
    closeTime, resolveTime,
  });

  /* el duelo que se está armando, con la MISMA carta de la Arena: consistencia
     gratis y anticipación ("así lo va a ver tu audiencia") */
  const previewBet = question.trim().length > 0 ? {
    id: 0,
    question: question.trim(),
    currency: walletOn && !isPrivate ? "usdc" : "pts",
    status: "open",
    closeTime: isNaN(closeTime) ? now + 3600000 : closeTime,
    pools: [0, 0],
    bettors: 0,
    isPrivate,
    feeBps: (fees?.platformBps ?? 300) + (fees?.creatorBps ?? 700),
    myStake: [0, 0],
    creator: { name: profile?.name ?? "vos", handle: profile?.handle ?? "@vos", mine: true },
  } : null;

  return (
    <div style={{ paddingTop: 12 }}>
      <button onClick={onBack} className="press" style={ghost}><ChevronLeft size={18} /> Volver</button>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: C.faint, margin: "10px 0 2px" }}>NUEVO DUELO</div>
      <h2 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 27, margin: "0 0 12px" }}>Crear apuesta</h2>

      {/* el camino inverso al "Modo completo →" del QuickModal */}
      {onQuick && (
        <button onClick={onQuick} className="press" style={{
          ...ghost, width: "100%", justifyContent: "center", gap: 6, marginBottom: 16, fontSize: 12.5,
          border: `1px dashed ${C.gold}55`, borderRadius: 12, padding: "9px 0", color: C.gold,
        }}>
          <Zap size={14} fill={C.gold} /> ¿Es para YA? Lanzalo Relámpago
        </button>
      )}

      {/* ---- 1. la pregunta ---- */}
      <div style={card}>
        <div style={kicker}>La pregunta · se responde SÍ o NO</div>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ej: ¿La Mona da el primer golpe en el round 1?"
          rows={2} style={{
            width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.line}`,
            borderRadius: 14, padding: 13, color: C.text, fontSize: 16, fontFamily: "inherit",
            resize: "none", outline: "none",
          }} />
      </div>

      {/* ---- 2. cómo se juega ---- */}
      <div style={card}>
        <div style={kicker}>Cómo se juega</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[["free", "Apuesta libre"], ["fixed", "Monto fijo"]].map(([k, l]) => (
            <Seg key={k} on={stakeMode === k} col={C.si} onClick={() => setStakeMode(k)}>{l}</Seg>
          ))}
        </div>
        {stakeMode === "fixed" ? (
          <Stepper label="Monto para todos" value={Number(fixedAmount)}
            steps={[-25, -5, 5, 25]} min={5} onChange={setFixedAmount} />
        ) : (
          <Stepper label="Apuesta mínima" value={Number(minStake)}
            steps={[-25, -5, 5, 25]} min={1} onChange={setMinStake} color={C.si} />
        )}
        <div style={{ display: "flex", gap: 8 }}>
          {[[false, "Pública"], [true, "Privada (solo con link)"]].map(([k, l]) => (
            <Seg key={String(k)} on={isPrivate === k} col={k ? C.gold : C.si} onClick={() => setIsPrivate(k)}>{l}</Seg>
          ))}
        </div>
        {isPrivate && (
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12}
            placeholder="Código de acceso (opcional), ej: ASADO" style={{
              width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.gold}44`,
              borderRadius: 12, padding: "11px 13px", color: C.gold, fontSize: 15, outline: "none",
              fontFamily: "inherit", fontWeight: 700, letterSpacing: 1, marginTop: 10,
            }} />
        )}
      </div>

      {/* ---- 3. cuándo ---- */}
      <div style={card}>
        <div style={kicker}>Cuándo se juega</div>
        <DateField label="Fecha y hora del evento" v={eventAt} set={setEventAt} />
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.dim, marginBottom: 8 }}>
          Duración (para saber cuándo cargás el resultado)
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: durChoice === "end" ? 12 : 4, flexWrap: "wrap" }}>
          {DURATIONS.map((d) => (
            <Seg key={d.v} grow on={durChoice === d.v} col={C.si} onClick={() => setDurChoice(d.v)}>{d.label}</Seg>
          ))}
        </div>
        {durChoice === "end" && <DateField label="Fecha y hora de fin" v={resolveAt} set={setResolveAt} />}

        <div style={{ height: 1, background: C.line, margin: "12px 0" }} />
        <Row k="Las apuestas cierran" v={fmtDateTime(closeTime)} note="cuando arranca el evento" />
        <div style={{ height: 8 }} />
        <Row k="Resultado a partir de" v={fmtDateTime(resolveTime)} col={C.gold} />
        {!timeOk && (
          <div style={{ color: C.no, fontSize: 12, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <X size={14} /> {isNaN(eventTime) ? "Elegí fecha y hora del evento" :
              closeTime <= now ? "El evento ya empezó — para algo que arranca ya, usá el Relámpago ⚡" :
              "El resultado tiene que ser después del evento"}
          </div>
        )}
      </div>

      {/* ---- ajustes finos, plegados: casi nadie los toca ---- */}
      <button onClick={() => setShowFine(!showFine)} className="press" style={{
        ...ghost, width: "100%", justifyContent: "center", gap: 6, marginBottom: 14, fontSize: 12.5,
      }}>
        <SlidersHorizontal size={13} /> Ajustes finos {showFine ? "▴" : "▾"}
      </button>
      {showFine && (
        <Stepper label="Máximo de apostadores" value={Number(maxBettors)}
          steps={[-10, -5, 5, 10]} min={0} onChange={setMaxBettors}
          color={C.si} zeroText="Sin límite" />
      )}

      {/* ---- tu comisión ---- */}
      <div style={{
        background: `linear-gradient(160deg, ${C.gold}10, ${C.bg2})`,
        border: `1px solid ${C.gold}33`, borderRadius: 14, padding: "13px 16px", marginBottom: 14,
      }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 3 }}>
          Tu comisión: <span style={{ color: C.gold }}>{pct(creatorPct)}</span> del pozo
        </div>
        <div style={{ color: C.faint, fontSize: 11.5, lineHeight: 1.5 }}>
          Comisión total del {pct(totalPct)} ({pct(creatorPct)} vos{platformPct > 0 ? ` + ${pct(platformPct)} BARDOOO` : " — BARDOOO no cobra nada"}). Sale del pozo y nunca hace que un ganador cobre menos de lo que puso.{flashCreatorPct !== creatorPct && <> En relámpagos tu parte {flashCreatorPct > creatorPct ? "sube" : "cambia"} al {pct(flashCreatorPct)}.</>}
          {bondPts > 0 && <> Al lanzar se retienen <b style={{ color: C.gold }}>{bondPts} pts de garantía</b>: te vuelven al cargar el resultado.</>}
        </div>
      </div>

      {/* ---- preview en vivo: la carta REAL de la Arena ---- */}
      {previewBet && (
        <div className="rise" style={{ marginBottom: 6 }}>
          <div style={{ ...kicker, marginBottom: 8 }}>Así lo ve tu audiencia</div>
          <div style={{ pointerEvents: "none" }}>
            <BetCard b={previewBet} now={now} onOpen={() => {}} />
          </div>
        </div>
      )}

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
