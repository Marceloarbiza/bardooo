import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, CircleDot, Lock, Share2, Trophy, Users } from "lucide-react";
import { C, PLATFORM_BPS } from "../theme";
import { amt } from "../lib/format";
import { payoutFor, multFor } from "../lib/math";
import { fmtMult } from "../lib/format";
import { Avatar } from "./ui/Identicon";
import { DuelBar } from "./ui/DuelBar";
import { MultTag, PrivBadge, PtsBadge } from "./ui/badges";
import { Banner, Chip, Stepper, Timer } from "./ui/bits";
import { Amt } from "./ui/animated";
import { ghost, resolveBtn } from "./ui/styles";

/* =============================== DETAIL =============================== */
export function Detail({ b, now, onBack, onBet, onResolve, onClaim, onRefund, fire }) {
  const lockedSide = b.myStake[1] > 0 ? 1 : b.myStake[0] > 0 ? 0 : null;
  const [option, setOption] = useState(lockedSide ?? 1);
  const [amount, setAmount] = useState(b.stakeMode === "fixed" ? b.fixedAmount : b.minStake);
  useEffect(() => { setOption(lockedSide ?? 1); }, [b.id]);

  const left = b.closeTime - now;
  const closed = b.status !== "open" || left <= 0;
  const canResolve = b.creator.mine && b.status === "locked";
  const fee = b.feeBps ?? PLATFORM_BPS + b.creatorBps; // el server manda el total (10% fijo)
  const total = b.pools[0] + b.pools[1];
  const pSi = total > 0 ? Math.round((b.pools[1] / total) * 100) : 50;
  const heroHit = b.lastHit && now - b.lastHit.t < 1500 ? (b.lastHit.side === 1 ? C.si : C.no) : null;

  const est = useMemo(() => {
    const pools = [...b.pools];
    if (!closed) pools[option] += Number(amount) || 0;
    return payoutFor(pools, option, (b.myStake[option] + (closed ? 0 : Number(amount) || 0)), fee);
  }, [b, option, amount, closed, fee]);

  const myPay = b.status === "resolved"
    ? payoutFor(b.pools, b.winningOption, b.myStake[b.winningOption], fee) : 0;

  const share = () => {
    const txt = `🔥 ${b.question} — ¿SÍ o NO? Entrá a BARDOOO y jugá: bardooo.app/bet/${b.id}${b.code ? ` · código: ${b.code}` : ""}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(() => fire("Link copiado · si alguien entra con tu link, sumás 25 pts"));
    else fire("No se pudo copiar", "err");
  };

  return (
    <div style={{ paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onBack} className="press" style={ghost}><ChevronLeft size={18} /> Volver</button>
        <button onClick={share} className="press" style={{ ...ghost, gap: 6 }}><Share2 size={15} /> Compartir</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 12px" }}>
        <Avatar c={b.creator} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{b.creator.name}</div>
          <div style={{ color: C.faint, fontSize: 11.5 }}>{b.creator.handle}</div>
        </div>
        {b.isPrivate && <PrivBadge />}
        {b.currency === "pts" && <PtsBadge />}
        <Timer closed={closed} left={left} />
      </div>

      <h2 style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 27, lineHeight: 1.12, margin: "0 0 16px", letterSpacing: -0.5 }}>
        {b.question}
      </h2>

      {/* hero del duelo */}
      <div className={heroHit ? "hit" : ""} style={{
        "--hit": heroHit ? heroHit + "55" : "transparent",
        background: `${C.bg2}cc`, border: `1px solid ${heroHit ? heroHit + "88" : C.line}`,
        borderRadius: 22, padding: 18, marginBottom: 16, transition: "border-color .4s",
      }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: C.si }}>SÍ</div>
            <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 44, lineHeight: 1, color: C.si, textShadow: `0 0 26px ${C.siGlow}` }}>
              {pSi}<span style={{ fontSize: 20 }}>%</span>
            </div>
            <div style={{ color: C.dim, fontSize: 12.5, marginTop: 3 }}><Amt cur={b.currency} v={b.pools[1]} /></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: C.no }}>NO</div>
            <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 44, lineHeight: 1, color: C.no, textShadow: `0 0 26px ${C.noGlow}` }}>
              {100 - pSi}<span style={{ fontSize: 20 }}>%</span>
            </div>
            <div style={{ color: C.dim, fontSize: 12.5, marginTop: 3 }}><Amt cur={b.currency} v={b.pools[0]} /></div>
          </div>
        </div>
        <div style={{ margin: "12px 0 12px" }}><DuelBar pools={b.pools} big /></div>
        <div style={{ display: "flex", gap: 14, color: C.dim, fontSize: 12.5 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Users size={13} /> {b.bettors} jugando</span>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: C.gold, fontWeight: 700 }}>
            <CircleDot size={13} /> <Amt cur={b.currency} v={total} /> en el pozo
          </span>
        </div>
      </div>

      {b.isPrivate && b.creator.mine && b.status !== "resolved" && b.status !== "cancelled" && (
        <div style={{
          background: `linear-gradient(160deg, ${C.gold}12, ${C.bg2})`,
          border: `1px solid ${C.gold}55`, borderRadius: 18, padding: 16, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, color: C.gold }}>
            <Lock size={14} /> <span style={{ fontWeight: 700, fontSize: 13 }}>Solo entra quien tiene el link</span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            background: `${C.bg}99`, border: `1px solid ${C.line}`, borderRadius: 12,
            padding: "9px 12px", marginBottom: 12, fontSize: 13.5,
          }}>
            <span style={{ color: C.dim }}>bardooo.app/bet/{b.id}</span>
            {b.code && (
              <span style={{
                marginLeft: "auto", border: `1px solid ${C.gold}55`, background: `${C.gold}14`,
                borderRadius: 8, padding: "2px 8px", color: C.gold, fontWeight: 800, fontSize: 12, letterSpacing: 1,
              }}>código: {b.code}</span>
            )}
          </div>
          <button onClick={share} className="press" style={{
            width: "100%", border: "none", borderRadius: 14, padding: "14px", cursor: "pointer",
            fontFamily: "Syne", fontWeight: 800, fontSize: 15, color: C.bg,
            background: `linear-gradient(90deg, ${C.gold}, #ffdd8f)`, boxShadow: `0 8px 24px ${C.gold}33`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            <Share2 size={17} /> Copiar link de invitación
          </button>
        </div>
      )}

      {b.status === "resolved" ? (
        <Resolved b={b} myPay={myPay} onClaim={onClaim} />
      ) : b.status === "cancelled" ? (
        (b.myStake[0] + b.myStake[1] > 0 && !b.claimed) ? (
          <button onClick={() => onRefund(b.id)} className="press" style={{
            width: "100%", borderRadius: 18, padding: "17px", cursor: "pointer",
            fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.si,
            background: "transparent", border: `2px solid ${C.si}`,
          }}>Recuperar {amt(b.currency, b.myStake[0] + b.myStake[1])}</button>
        ) : (
          <Banner color={C.no} text="Apuesta anulada — se devuelve lo apostado." />
        )
      ) : canResolve ? (
        <ResolvePanel b={b} onResolve={onResolve} />
      ) : closed ? (
        <Banner color={C.gold} text="Apuestas cerradas. El creador carga el resultado cuando termina el evento." />
      ) : (
        <BetPanel b={b} option={option} setOption={setOption} amount={amount} setAmount={setAmount}
          est={est} fee={fee} onBet={onBet} lockedSide={lockedSide} fire={fire} />
      )}

      {(b.myStake[0] > 0 || b.myStake[1] > 0) && (
        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          {b.myStake[1] > 0 && <Chip col={C.si} label="tu SÍ" v={amt(b.currency, b.myStake[1])} />}
          {b.myStake[0] > 0 && <Chip col={C.no} label="tu NO" v={amt(b.currency, b.myStake[0])} />}
        </div>
      )}
    </div>
  );
}

function BetPanel({ b, option, setOption, amount, setAmount, est, fee, onBet, lockedSide, fire }) {
  const pickSi = () => lockedSide === 0 ? fire("Ya estás del lado del NO en esta apuesta", "err") : setOption(1);
  const pickNo = () => lockedSide === 1 ? fire("Ya estás del lado del SÍ en esta apuesta", "err") : setOption(0);
  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <Choice on={option === 1} disabled={lockedSide === 0} col={C.si} glow={C.siGlow}
          label="SÍ" sub={subFor(b, 1, fee)} onClick={pickSi} />
        <Choice on={option === 0} disabled={lockedSide === 1} col={C.no} glow={C.noGlow}
          label="NO" sub={subFor(b, 0, fee)} onClick={pickNo} />
      </div>

      {b.stakeMode === "fixed" ? (
        <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 16, padding: 15, marginBottom: 14, textAlign: "center" }}>
          <div style={{ color: C.dim, fontSize: 12.5, marginBottom: 3 }}>Monto fijo de esta apuesta</div>
          <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 30, color: C.gold }}>{amt(b.currency, b.fixedAmount)}</div>
        </div>
      ) : (
        <>
          <Stepper label="Tu apuesta" value={Number(amount) || 0}
            prefix={b.currency === "usdc" ? "$" : undefined}
            suffix={b.currency === "pts" ? "pts" : undefined}
            steps={[-25, -5, 5, 25]}
            min={b.minStake} max={b.stakeMode === "capped" ? b.maxStake : undefined}
            onChange={setAmount} color={b.currency === "pts" ? C.si : C.gold} />
        </>
      )}

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: `linear-gradient(90deg, ${option === 1 ? C.si : C.no}10, transparent)`,
        border: `1px solid ${(option === 1 ? C.si : C.no)}33`,
        borderRadius: 14, padding: "13px 16px", marginBottom: 12,
      }}>
        <span style={{ color: C.dim, fontSize: 13 }}>Si ganás, cobrás ≈</span>
        <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 24, color: option === 1 ? C.si : C.no }}>{amt(b.currency, est)}</span>
      </div>
      <p style={{ color: C.faint, fontSize: 11.5, margin: "0 0 14px", lineHeight: 1.5 }}>
        Estimado: el pago final depende de cómo cierren los pozos. Comisión total {(fee / 100).toFixed(0)}% (creador + plataforma), sale del pozo y nunca cobrás menos de lo que pusiste.
      </p>

      <button onClick={() => onBet(b.id, option, Number(amount))} className="press" style={{
        width: "100%", border: "none", borderRadius: 18, padding: "18px", cursor: "pointer",
        fontFamily: "Syne", fontWeight: 800, fontSize: 17, color: C.bg,
        background: option === 1 ? `linear-gradient(90deg, ${C.si}, #7cf7de)` : `linear-gradient(90deg, ${C.no}, #ff7ab0)`,
        boxShadow: `0 10px 30px ${option === 1 ? C.siGlow : C.noGlow}`,
      }}>
        {b.myStake[option] > 0 ? "Sumar" : "Meter"} {amt(b.currency, Number(amount) || 0)} al {option === 1 ? "SÍ" : "NO"}
      </button>
    </div>
  );
}

function subFor(b, side, fee) {
  const m = multFor(b.pools, side, fee);
  if (m != null) return `paga ${fmtMult(m)}`;
  const total = b.pools[0] + b.pools[1];
  return total === 0 ? "abrí el pozo" : "¡sé el 1ro y llevate todo!";
}

function Choice({ on, col, label, glow, onClick, disabled, sub }) {
  return (
    <button onClick={onClick} className="press" style={{
      flex: 1, borderRadius: 20, padding: "16px 0 13px", cursor: disabled ? "not-allowed" : "pointer",
      background: on ? col : "transparent",
      border: `2px solid ${disabled ? C.line : col}`,
      opacity: disabled ? 0.45 : 1,
      boxShadow: on ? `0 10px 30px ${glow}` : "none",
      transition: "all .18s", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
    }}>
      <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 27, color: on ? C.bg : (disabled ? C.faint : col) }}>
        {label}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: on ? `${C.bg}cc` : C.dim }}>
        {sub}
      </span>
    </button>
  );
}

function ResolvePanel({ b, onResolve }) {
  const [confirm, setConfirm] = useState(null); // null | 0 | 1
  const col = confirm === 1 ? C.si : C.no;
  const lado = confirm === 1 ? "SÍ" : "NO";
  return (
    <>
      <div style={{ background: `linear-gradient(160deg, ${C.gold}14, ${C.bg2})`, border: `1px solid ${C.gold}55`, borderRadius: 20, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, color: C.gold }}>
          <Trophy size={16} /> <span style={{ fontWeight: 700, fontSize: 14 }}>Sos el creador</span>
        </div>
        <p style={{ color: C.dim, fontSize: 13, margin: "0 0 14px", lineHeight: 1.5 }}>
          La apuesta cerró. Cargá el resultado real: los ganadores cobran y vos recibís tu comisión.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={() => setConfirm(1)} className="press" style={resolveBtn(C.si)}>Ganó el SÍ</button>
          <button onClick={() => setConfirm(0)} className="press" style={resolveBtn(C.no)}>Ganó el NO</button>
        </div>
      </div>

      {confirm !== null && (
        <div onClick={() => setConfirm(null)} style={{
          position: "fixed", inset: 0, zIndex: 45, display: "grid", placeItems: "center",
          background: "rgba(6,3,12,.72)", backdropFilter: "blur(4px)", padding: 20,
        }}>
          <div onClick={(e) => e.stopPropagation()} className="rise" style={{
            width: "100%", maxWidth: 380, background: C.bg2, border: `1px solid ${col}66`,
            borderRadius: 22, padding: "22px 20px", boxSizing: "border-box", textAlign: "center",
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, color: C.dim, marginBottom: 8 }}>
              CONFIRMÁ EL RESULTADO
            </div>
            <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 32, color: col, textShadow: `0 0 26px ${col}55`, marginBottom: 10 }}>
              Ganó el {lado}
            </div>
            <p style={{ color: C.dim, fontSize: 13, lineHeight: 1.55, margin: "0 0 18px" }}>
              "{b.question}"<br />
              Los que apostaron al <b style={{ color: col }}>{lado}</b> cobran el pozo.
              <b style={{ color: C.text }}> Esto no se puede deshacer.</b>
            </p>
            <button onClick={() => { const o = confirm; setConfirm(null); onResolve(b.id, o); }} className="press" style={{
              width: "100%", border: "none", borderRadius: 16, padding: "16px", cursor: "pointer",
              fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.bg,
              background: col, boxShadow: `0 10px 28px ${col}44`,
            }}>Sí, ganó el {lado}</button>
            <button onClick={() => setConfirm(null)} className="press" style={{
              ...ghost, width: "100%", justifyContent: "center", marginTop: 10, fontSize: 14,
            }}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  );
}

function Resolved({ b, myPay, onClaim }) {
  const won = b.winningOption;
  const col = won === 1 ? C.si : C.no;
  const iWon = b.myStake[won] > 0;
  return (
    <div>
      <div style={{
        background: `linear-gradient(160deg, ${col}14, ${C.bg2})`, border: `1px solid ${col}66`,
        borderRadius: 20, padding: 20, marginBottom: 14, textAlign: "center",
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.5, color: C.dim, marginBottom: 6 }}>RESULTADO</div>
        <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 34, color: col, textShadow: `0 0 30px ${col}55` }}>
          Ganó el {won === 1 ? "SÍ" : "NO"}
        </div>
      </div>
      {iWon ? (
        b.claimed ? (
          <Banner color={C.si} text={`Ya cobraste ${amt(b.currency, myPay)}. ¡Bien jugado!`} />
        ) : (
          <button onClick={() => onClaim(b.id)} className="press" style={{
            width: "100%", border: "none", borderRadius: 18, padding: "18px", cursor: "pointer",
            fontFamily: "Syne", fontWeight: 800, fontSize: 18, color: C.bg,
            background: `linear-gradient(90deg, ${C.gold}, #ffdd8f)`, boxShadow: `0 10px 30px ${C.gold}44`,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}>
            <Trophy size={20} /> Cobrar {amt(b.currency, myPay)}
          </button>
        )
      ) : (
        <Banner color={C.faint} text="Esta vez no fue. La revancha se crea en un minuto." />
      )}
    </div>
  );
}
