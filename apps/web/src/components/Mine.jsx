import { ArrowRight, Hourglass, Share2, Sparkles, TrendingUp, Users } from "lucide-react";
import { C } from "../theme";
import { amt } from "../lib/format";
import { BetCard } from "./Arena";
import { Empty } from "./ui/bits";
import { ProfileCard } from "./Profile";

/* =============================== MINE =============================== */
export function Mine({ bets, now, onOpen, earned, onInvite, profile, onSaveName, onLogout, walletOn, walletAddr, fire, refStats }) {
  const mine = bets.filter((b) => b.creator.mine || b.myStake[0] > 0 || b.myStake[1] > 0);
  const created = bets.filter((b) => b.creator.mine);
  const pending = created.filter((b) => b.status === "locked");
  const playing = mine.filter((b) => b.status === "open" || b.status === "locked");
  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: C.faint, marginBottom: 2 }}>TU RINCÓN</div>
      <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 24, marginBottom: 14 }}>Mis apuestas</div>

      <ProfileCard profile={profile} onSaveName={onSaveName} onLogout={onLogout} />

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <Stat icon={<Sparkles size={13} />} label="Creadas" v={created.length} />
        <Stat icon={<Users size={13} />} label="Jugando" v={playing.length} />
        <Stat icon={<TrendingUp size={13} />} label="Comisiones" v={amt("pts", earned)} col={C.gold} />
      </div>

      <div onClick={onInvite} className="press" style={{
        display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
        background: `linear-gradient(90deg, ${C.si}14, transparent)`,
        border: `1px solid ${C.si}55`, borderRadius: 16, padding: "13px 14px", marginBottom: 14,
      }}>
        <Share2 size={17} color={C.si} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Invitá amigos, ganá 25 pts por cada uno</div>
          <div style={{ color: C.dim, fontSize: 12 }}>
            {refStats && (refStats.pending > 0 || refStats.accredited > 0)
              ? <>
                  {refStats.accredited > 0 && <span style={{ color: C.si }}>{refStats.accredited} ya te {refStats.accredited === 1 ? "pagó" : "pagaron"} · </span>}
                  {refStats.pending > 0 && <span style={{ color: C.gold }}>{refStats.pending} {refStats.pending === 1 ? "espera" : "esperan"} su primera jugada (+25 al jugar)</span>}
                </>
              : "El premio cae cuando tu amigo entra y juega su primera"}
          </div>
        </div>
        <ArrowRight size={16} color={C.si} />
      </div>

      {pending.length > 0 && (
        <div onClick={() => onOpen(pending[0].id)} className="press" style={{
          display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
          background: `linear-gradient(90deg, ${C.gold}20, transparent)`,
          border: `1px solid ${C.gold}66`, borderRadius: 16, padding: "13px 14px", marginBottom: 14,
        }}>
          <Hourglass size={18} color={C.gold} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>
              {pending.length === 1 ? "1 apuesta espera tu resultado" : `${pending.length} apuestas esperan tu resultado`}
            </div>
            <div style={{ color: C.dim, fontSize: 12 }}>La gente no puede cobrar hasta que lo cargues</div>
          </div>
          <ArrowRight size={16} color={C.gold} />
        </div>
      )}

      {mine.length === 0 ? (
        <Empty />
      ) : mine.map((b, i) => <BetCard key={b.id} b={b} now={now} onOpen={onOpen} delay={i * 70} />)}
    </div>
  );
}

function Stat({ icon, label, v, col }) {
  return (
    <div style={{ flex: 1, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 14, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, color: col || C.dim, fontSize: 11, fontWeight: 700 }}>
        {icon} {label}
      </div>
      <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 18, marginTop: 2, color: col || C.text }}>{v}</div>
    </div>
  );
}
