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
export function Feed({ bets, now, onOpen, tries, onGame, onLink }) {
  const [arena, setArena] = useState("pts"); // pts | usdc
  const open = bets.filter((b) =>
    !b.isPrivate && (b.status === "open" || b.status === "locked") && b.currency === arena
  );
  return (
    <div style={{ paddingTop: 16 }}>
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

      {/* el switch de arenas: puntos y plata, cada una en su lugar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <ArenaTab on={arena === "pts"} col={C.si} onClick={() => setArena("pts")}
          icon={<Zap size={13} fill={arena === "pts" ? C.bg : C.si} />} label="De puntos" />
        <ArenaTab on={arena === "usdc"} col={C.gold} onClick={() => setArena("usdc")}
          icon={<CircleDot size={13} />} label="De plata" />
      </div>

      {open.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.faint }}>
          <Sparkles size={28} style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            {arena === "pts"
              ? "No hay duelos de puntos abiertos. ¡Lanzá el primero con el rayo!"
              : "No hay duelos de plata abiertos. Activá tu wallet y lanzá el primero."}
          </div>
        </div>
      ) : open.map((b, i) => <BetCard key={b.id} b={b} now={now} onOpen={onOpen} delay={i * 70} />)}
    </div>
  );
}

function ArenaTab({ on, col, onClick, icon, label }) {
  return (
    <button onClick={onClick} className="press" style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "10px 12px", borderRadius: 14, cursor: "pointer",
      fontFamily: "Syne", fontWeight: 800, fontSize: 13.5,
      color: on ? C.bg : col,
      background: on ? col : "transparent",
      border: `1.5px solid ${on ? col : col + "44"}`,
      boxShadow: on ? `0 8px 22px ${col}33` : "none",
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
