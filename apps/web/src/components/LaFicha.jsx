import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { C } from "../theme";
import { ghost } from "./ui/styles";

/* =========================== LA FICHA (bonus) =========================== */
/* Flappy tematico: la ficha (el anillo de BARDOOO) rueda entre pilares SI/NO. 1 pt por caño,
   tope 15 por vuelo. En la app real, limite y premio viven en el BACKEND. */
const GW = 380, GH = 470, BX = 92, BR = 13, PW = 60, GAP = 76;

export function Game({ onBack, tries, onPrize, play, fichaStart, fichaEnd, onError }) {
  const canvasRef = useRef(null);
  const gRef = useRef(null);
  const phaseRef = useRef("ready");
  const flightIdRef = useRef(null); // token del vuelo emitido por el server
  const busyRef = useRef(false);
  const [phase, setPhase] = useState("ready"); // ready | playing | over
  const [score, setScore] = useState(0);
  const [prize, setPrize] = useState(0);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  /* el vuelo arranca y termina en el SERVER: el cliente nunca acredita */
  const startRun = async () => {
    if (busyRef.current || tries <= 0) return;
    busyRef.current = true;
    const r = await fichaStart();
    busyRef.current = false;
    if (!r.ok) return onError(r.error);
    flightIdRef.current = r.flightId;
    setScore(0);
    setPhase("playing");
  };

  const reportRun = async (finalScore) => {
    const r = await fichaEnd(flightIdRef.current, Math.min(finalScore, 15));
    if (r.ok) {
      setPrize(r.prize);
      onPrize(r.prize);
    } else {
      setPrize(0);
      onError(r.error);
    }
  };

  const drawScene = (ctx, g) => {
    ctx.clearRect(0, 0, GW, GH);
    // fondo de arena
    const bg = ctx.createLinearGradient(0, 0, 0, GH);
    bg.addColorStop(0, "#170C2E"); bg.addColorStop(1, "#0E0720");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, GW, GH);
    // pilares
    for (const p of g.pipes) {
      ctx.save();
      ctx.shadowColor = p.col; ctx.shadowBlur = 14;
      const grad = ctx.createLinearGradient(p.x, 0, p.x + PW, 0);
      grad.addColorStop(0, p.col + "cc"); grad.addColorStop(1, p.col + "77");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.roundRect(p.x, -12, PW, p.cy - GAP + 12, 10); ctx.fill();
      ctx.beginPath(); ctx.roundRect(p.x, p.cy + GAP, PW, GH - p.cy - GAP + 12, 10); ctx.fill();
      ctx.restore();
    }
    // la ficha: el anillo de BARDOOO, girando a medida que avanza
    const R = 15;
    ctx.save(); ctx.translate(BX, g.y); ctx.rotate(g.rot || 0);
    ctx.shadowColor = "#00F0C0"; ctx.shadowBlur = 14;
    ctx.fillStyle = "#00F0C0";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -Math.PI * 0.4, Math.PI * 0.6); ctx.closePath(); ctx.fill();
    ctx.shadowColor = "#FF2E7C";
    ctx.fillStyle = "#FF2E7C";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, Math.PI * 0.6, Math.PI * 1.6); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#0C0616"; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(R * Math.cos(-Math.PI * 0.4), R * Math.sin(-Math.PI * 0.4));
    ctx.lineTo(R * Math.cos(Math.PI * 0.6), R * Math.sin(Math.PI * 0.6));
    ctx.stroke();
    ctx.fillStyle = "#12081F";
    ctx.beginPath(); ctx.arc(0, 0, R * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  // loop del juego
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    cv.width = GW * dpr; cv.height = GH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (phase !== "playing") {
      drawScene(ctx, gRef.current || { y: GH / 2, v: 0, pipes: [] });
      return;
    }

    const g = { y: GH / 2, v: -6, pipes: [], dist: 140, score: 0, rot: 0 };
    gRef.current = g;
    let raf, last = performance.now();

    const loop = (t) => {
      const dt = Math.min(34, t - last) / 16.67; last = t;
      const spd = Math.min(4.1, 2.5 + g.score * 0.05); // acelera con cada caño

      g.v += 0.42 * dt;
      g.y += g.v * dt;
      g.dist += spd * dt;
      g.rot += spd * dt * 0.055; // rueda: gira mas rapido cuanto mas rapido va
      if (g.dist >= 205) {
        g.dist = 0;
        const cy = 110 + Math.random() * (GH - 220);
        g.pipes.push({ x: GW + 30, cy, passed: false, col: g.pipes.length % 2 ? "#FF2E7C" : "#00F0C0" });
      }
      for (const p of g.pipes) p.x -= spd * dt;
      g.pipes = g.pipes.filter((p) => p.x > -PW - 20);

      for (const p of g.pipes) {
        if (!p.passed && p.x + PW < BX - BR) {
          p.passed = true; g.score++; setScore(g.score); play("pass");
        }
      }

      let dead = g.y < BR || g.y > GH - BR;
      for (const p of g.pipes) {
        if (BX + BR > p.x && BX - BR < p.x + PW) {
          if (g.y - BR < p.cy - GAP || g.y + BR > p.cy + GAP) dead = true;
        }
      }

      drawScene(ctx, g);

      if (dead) {
        play("crash");
        setPrize(Math.min(g.score, 15)); // optimista; el server confirma (o rechaza)
        setPhase("over");
        reportRun(g.score);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const tap = () => {
    if (phaseRef.current === "ready" && tries > 0) { startRun(); return; }
    if (phaseRef.current === "playing" && gRef.current) { gRef.current.v = -7.3; play("flap"); }
  };
  const again = () => { startRun(); };

  return (
    // el juego se diseñó a ~380px: en desktop se limita a su ancho natural y se
    // centra, en vez de estirar el canvas a todo el panel (se veía enorme)
    <div style={{ paddingTop: 12, maxWidth: 460, margin: "0 auto" }}>
      <button onClick={onBack} className="press" style={ghost}><ChevronLeft size={18} /> Volver</button>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: C.faint, margin: "10px 0 2px" }}>BONUS DIARIO</div>
      <h2 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 27, margin: "0 0 6px" }}>La Ficha</h2>
      <p style={{ color: C.dim, fontSize: 13.5, margin: "0 0 16px", lineHeight: 1.5 }}>
        Tocá y la ficha vuela girando; esquivá los pilares. <b style={{ color: C.gold }}>1 pt por caño</b>, hasta 15 pts por vuelo. Los puntos se apuestan en los duelos de puntos.
      </p>

      <div style={{ position: "relative", borderRadius: 22, overflow: "hidden", border: `1px solid ${C.line}`, marginBottom: 16 }}>
        <canvas ref={canvasRef} onPointerDown={tap}
          style={{ display: "block", width: "100%", height: "auto", cursor: "pointer", touchAction: "manipulation" }} />
        {/* marcador */}
        <div style={{ position: "absolute", top: 12, left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
          <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 40, color: "#F6F1FF", textShadow: "0 2px 14px rgba(0,0,0,.6)" }}>
            {phase === "playing" || phase === "over" ? score : ""}
          </span>
        </div>
        {phase === "ready" && (
          <div onPointerDown={tap} style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center", cursor: "pointer",
            background: "rgba(12,6,22,.45)", backdropFilter: "blur(2px)",
          }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 24, color: C.gold, textShadow: `0 0 24px ${C.gold}66` }}>
                {tries > 0 ? "Tocá para volar" : "Sin vuelos por hoy"}
              </div>
              {tries > 0 && <div style={{ color: C.dim, fontSize: 13, marginTop: 6 }}>{tries} {tries === 1 ? "vuelo" : "vuelos"} disponibles</div>}
            </div>
          </div>
        )}
      </div>

      {phase === "over" && (
        <div className="rise">
          <div style={{
            textAlign: "center", background: `linear-gradient(160deg, ${prize >= 10 ? C.gold : prize > 0 ? C.si : C.no}14, ${C.bg2})`,
            border: `1px solid ${prize >= 10 ? C.gold : prize > 0 ? C.si : C.no}66`, borderRadius: 20, padding: 20, marginBottom: 14,
          }}>
            <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 30, color: prize >= 10 ? C.gold : prize > 0 ? C.si : C.no }}>
              {prize >= 10 ? `¡${score} CAÑOS!` : prize > 0 ? `+${prize} pts` : "Te estrellaste"}
            </div>
            <div style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>
              {prize > 0 ? `${prize} pts sumados` : "Ni un caño esta vez — los puntos se ganan pasando entre los pilares"}
              {tries > 0 ? ` · te ${tries === 1 ? "queda 1 vuelo" : `quedan ${tries} vuelos`}` : " · sin vuelos por hoy"}
            </div>
          </div>
          {tries > 0 ? (
            <button onClick={again} className="press" style={{
              width: "100%", border: "none", borderRadius: 18, padding: "17px", cursor: "pointer",
              fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.bg,
              background: `linear-gradient(90deg, ${C.gold}, #ffdd8f)`,
            }}>Volar de nuevo</button>
          ) : (
            <button onClick={onBack} className="press" style={{
              width: "100%", borderRadius: 18, padding: "17px", cursor: "pointer",
              fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.si,
              background: "transparent", border: `2px solid ${C.si}`,
            }}>A la Arena, a apostar lo ganado</button>
          )}
        </div>
      )}

      <p style={{ color: C.faint, fontSize: 11, marginTop: 4, lineHeight: 1.5, textAlign: "center" }}>
        3 vuelos por día. El límite y el premio los controla el server: mañana se renuevan.
      </p>
    </div>
  );
}
