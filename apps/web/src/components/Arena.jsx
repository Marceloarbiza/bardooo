import { useState } from "react";
import { ArrowRight, CircleDot, Flame, Link2, Sparkles, Users, Zap } from "lucide-react";
import { C, PLATFORM_BPS } from "../theme";
import { multFor } from "../lib/math";
import { Mark } from "./ui/brand";
import { Avatar } from "./ui/Identicon";
import { DuelBar } from "./ui/DuelBar";
import { MultTag, PrivBadge, PtsBadge } from "./ui/badges";
import { Timer } from "./ui/bits";
import { Amt } from "./ui/animated";
import { ghost } from "./ui/styles";

/* =============================== FEED =============================== */
/* Dos arenas separadas (pedido del dueño): los duelos de PUNTOS y los de
   PLATA no se mezclan en el listado — igual que sus pozos.               */
export function Feed({ bets, now, onOpen, tries, onGame, onLink, invitedBy, walletOn, onQuick, onWallet, loading, wide }) {
  // la de plata primero ES la arena (pedido del dueño)… salvo que esté vacía
  // y el usuario no tenga wallet: a ese lo recibe la arena de puntos con vida.
  const [choice, setChoice] = useState(null); // null = decidir solo
  const openBy = (cur) => bets.some((b) =>
    !b.isPrivate && (b.status === "open" || b.status === "locked") && b.currency === cur
  );
  const arena = choice ?? (walletOn || openBy("usdc") || !openBy("pts") ? "usdc" : "pts");
  const open = bets.filter((b) =>
    !b.isPrivate && (b.status === "open" || b.status === "locked") && b.currency === arena
  );
  return (
    <div style={{ paddingTop: 16 }}>
      {/* invitado con referido PENDIENTE: banner notorio hasta su primera jugada
          (el +25 al invitador se acredita recién ahí — que no sea magia) */}
      {invitedBy && (
        <div className="rise" style={{
          display: "flex", alignItems: "center", gap: 10,
          background: `linear-gradient(90deg, ${C.si}18, ${C.bg2})`,
          border: `1px solid ${C.si}66`, borderRadius: 18, padding: "13px 15px", marginBottom: 16,
        }}>
          <span style={{ fontSize: 20 }}>🎁</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 14 }}>
              Te invitó <span style={{ color: C.si }}>{invitedBy}</span>
            </div>
            <div style={{ color: C.dim, fontSize: 12 }}>
              Con tu primer vuelo de La Ficha o tu primera apuesta, le regalás 25 pts
            </div>
          </div>
        </div>
      )}
      <div onClick={tries > 0 ? onGame : undefined} className={tries > 0 ? "press rise" : "rise"} style={{
        display: "flex", alignItems: "center", gap: 12, cursor: tries > 0 ? "pointer" : "default",
        background: `linear-gradient(90deg, ${C.gold}1e, ${C.bg2})`,
        border: `1px solid ${C.gold}${tries > 0 ? "66" : "33"}`,
        borderRadius: 18, padding: "13px 15px", marginBottom: 16, opacity: tries > 0 ? 1 : 0.6,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 13, display: "grid", placeItems: "center",
          background: C.bg3, border: `1px solid ${C.gold}55`, boxShadow: `0 0 18px ${C.gold}33`, flexShrink: 0,
        }}>
          <Mark size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 15 }}>La Ficha · bonus diario</div>
          <div style={{ color: C.dim, fontSize: 12 }}>
            {tries > 0 ? `Volá entre pilares: 1 pt por caño, hasta 15 · ${tries} ${tries === 1 ? "vuelo" : "vuelos"}` : "Sin vuelos por hoy. Mañana hay más"}
          </div>
        </div>
        {tries > 0 && <ArrowRight size={16} color={C.gold} />}
      </div>

      <button onClick={onLink} className="press" style={{
        ...ghost, width: "100%", justifyContent: "center", gap: 6, marginBottom: 14, fontSize: 12.5,
        border: `1px dashed ${C.line}`, borderRadius: 12, padding: "9px 0",
      }}>
        <Link2 size={14} /> ¿Te pasaron una apuesta? Abrila con el link
      </button>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: C.faint }}>LA ARENA</div>
          <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 24 }}>Duelos abiertos</div>
        </div>
        <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.dim, fontSize: 12.5 }}>
          <Flame size={14} color={C.no} /> {open.length} calientes
        </span>
      </div>

      {/* el switch de arenas: pills discretas, plata primero */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <ArenaTab on={arena === "usdc"} col={C.gold} onClick={() => setChoice("usdc")}
          icon={<CircleDot size={11} />} label="De plata" />
        <ArenaTab on={arena === "pts"} col={C.si} onClick={() => setChoice("pts")}
          icon={<Zap size={11} fill={arena === "pts" ? C.bg : C.si} />} label="De puntos" />
      </div>

      <div style={wide ? {
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
        gap: 16, alignItems: "start",
      } : undefined}>
      {loading && open.length === 0 ? (
        // primer load: cartas fantasma en vez de un "no hay duelos" mentiroso
        [0, 1, 2].map((i) => <SkeletonCard key={i} delay={i * 90} />)
      ) : open.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.faint, gridColumn: "1 / -1" }}>
          <Sparkles size={28} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>
            {arena === "pts"
              ? "No hay duelos de puntos abiertos. El primero lo lanzás vos."
              : walletOn
                ? "No hay duelos de plata abiertos. El primero lo lanzás vos."
                : "No hay duelos de plata abiertos. Activá tu wallet y lanzá el primero."}
          </div>
          {arena === "usdc" && !walletOn ? (
            <button onClick={onWallet} className="press" style={{
              border: "none", borderRadius: 16, padding: "14px 26px", cursor: "pointer",
              fontFamily: "Syne", fontWeight: 800, fontSize: 15, color: C.bg,
              background: `linear-gradient(90deg, ${C.gold}, #ffdd8f)`, boxShadow: `0 10px 28px ${C.gold}33`,
            }}>Activar mi wallet</button>
          ) : (
            <button onClick={onQuick} className="press" style={{
              border: "none", borderRadius: 16, padding: "14px 26px", cursor: "pointer",
              fontFamily: "Syne", fontWeight: 800, fontSize: 15, color: C.bg,
              background: `linear-gradient(135deg, ${C.gold}, ${C.no})`, boxShadow: `0 10px 28px ${C.noGlow}`,
            }}>⚡ Lanzar el primero</button>
          )}
        </div>
      ) : open.map((b, i) => <BetCard key={b.id} b={b} now={now} onOpen={onOpen} delay={i * 70} />)}
      </div>
    </div>
  );
}

function SkeletonCard({ delay = 0 }) {
  const bar = (w, h = 12) => (
    <div style={{ width: w, height: h, borderRadius: 8, background: C.bg3 }} />
  );
  return (
    <div className="rise" style={{
      position: "relative", overflow: "hidden",
      background: `linear-gradient(160deg, ${C.bg2}, ${C.bg2}dd)`,
      border: `1px solid ${C.line}`, borderRadius: 22, padding: 16, marginBottom: 14,
      animationDelay: `${delay}ms`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: C.bg3 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{bar(90)}{bar(60, 9)}</div>
      </div>
      {bar("85%", 16)}
      <div style={{ height: 10 }} />
      <div style={{ height: 34, borderRadius: 13, background: C.bg3 }} />
      <div className="shine" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
    </div>
  );
}

/* pill chica y discreta: el protagonismo es de las cartas, no del filtro */
function ArenaTab({ on, col, onClick, icon, label }) {
  return (
    <button onClick={onClick} className="press" style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "5px 12px", borderRadius: 999, cursor: "pointer",
      fontWeight: 700, fontSize: 11.5,
      color: on ? C.bg : col,
      background: on ? col : `${col}10`,
      border: `1px solid ${on ? col : col + "44"}`,
      transition: "all .18s",
    }}>
      {icon} {label}
    </button>
  );
}

export function BetCard({ b, now, onOpen, delay = 0 }) {
  const left = b.closeTime - now;
  const closed = b.status !== "open" || left <= 0;
  const fee = b.feeBps ?? PLATFORM_BPS + b.creatorBps; // el server manda el total (10% fijo)
  const hitCol = b.lastHit && now - b.lastHit.t < 1500 ? (b.lastHit.side === 1 ? C.si : C.no) : null;
  return (
    <div onClick={() => onOpen(b.id)} className={"press rise" + (hitCol ? " hit" : "")} style={{
      "--hit": hitCol ? hitCol + "55" : "transparent",
      background: `linear-gradient(160deg, ${C.bg2}, ${C.bg2}dd)`,
      border: `1px solid ${hitCol ? hitCol + "88" : C.line}`, borderRadius: 22,
      padding: 16, marginBottom: 14, cursor: "pointer",
      animationDelay: `${delay}ms`, transition: "border-color .4s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
        <Avatar c={b.creator} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{b.creator.name}</div>
          <div style={{ color: C.faint, fontSize: 11.5 }}>{b.creator.handle}</div>
        </div>
        {b.isPrivate && <PrivBadge />}
        {b.currency === "pts" && <PtsBadge />}
        <Timer closed={closed} left={left} />
      </div>

      <div style={{ fontFamily: "Syne", fontWeight: 700, fontSize: 18.5, lineHeight: 1.22, marginBottom: 13 }}>
        {b.question}
      </div>

      <DuelBar pools={b.pools} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {b.pools[0] + b.pools[1] === 0 ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            border: `1px solid ${C.gold}44`, background: `${C.gold}10`,
            borderRadius: 999, padding: "3px 10px", fontSize: 11.5, fontWeight: 700, color: C.gold,
          }}>
            <Sparkles size={11} /> Recién lanzada — abrí el pozo
          </span>
        ) : (<>
        <MultTag side={1} m={multFor(b.pools, 1, fee)} />
        <MultTag side={0} m={multFor(b.pools, 0, fee)} />
        </>)}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, color: C.dim, fontSize: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Users size={12} /> {b.bettors}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, color: C.gold, fontWeight: 700 }}>
            <CircleDot size={12} /> <Amt cur={b.currency} v={b.pools[0] + b.pools[1]} />
          </span>
        </span>
      </div>
    </div>
  );
}
