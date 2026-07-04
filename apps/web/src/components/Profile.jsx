import { useState } from "react";
import { Check, Wallet } from "lucide-react";
import { C } from "../theme";
import { Identicon } from "./ui/Identicon";
import { ghost } from "./ui/styles";

/* Tarjeta de perfil: anillo grande (el bicho), nombre editable inline,
   dirección de wallet acortada con copiar cuando está activa. */
export function ProfileCard({ profile, setProfile, walletOn, walletAddr, fire }) {
  const [editing, setEditing] = useState(false);
  const [tmp, setTmp] = useState(profile.name);
  const seed = walletOn ? walletAddr : profile.handle;
  const short = walletAddr.slice(0, 6) + "…" + walletAddr.slice(-4);
  const save = () => {
    const name = tmp.trim() || profile.name;
    setProfile({ name, handle: "@" + name.toLowerCase().replace(/\s+/g, "") });
    setEditing(false);
  };
  const copyAddr = () => {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(walletAddr).then(() => fire("Dirección copiada"));
  };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 13, background: `linear-gradient(160deg, ${C.bg3}, ${C.bg2})`,
      border: `1px solid ${C.line}`, borderRadius: 18, padding: 14, marginBottom: 14,
    }}>
      <Identicon seed={seed} size={52} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div style={{ display: "flex", gap: 8 }}>
            <input value={tmp} onChange={(e) => setTmp(e.target.value)} autoFocus maxLength={20}
              onKeyDown={(e) => e.key === "Enter" && save()} style={{
                flex: 1, minWidth: 0, background: C.bg, border: `1px solid ${C.si}55`, borderRadius: 10,
                padding: "7px 10px", color: C.text, fontSize: 15, fontWeight: 700, outline: "none", fontFamily: "inherit",
              }} />
            <button onClick={save} className="press" style={{
              border: "none", background: C.si, color: C.bg, borderRadius: 10, padding: "0 12px",
              fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            }}><Check size={16} /></button>
          </div>
        ) : (
          <div onClick={() => { setTmp(profile.name); setEditing(true); }} style={{ cursor: "pointer" }}>
            <div style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 17, display: "flex", alignItems: "center", gap: 7 }}>
              {profile.name}
              <span style={{ color: C.faint, fontSize: 11, fontWeight: 600 }}>editar</span>
            </div>
            <div style={{ color: C.dim, fontSize: 12.5 }}>{profile.handle}</div>
          </div>
        )}
        {walletOn ? (
          <button onClick={copyAddr} className="press" style={{
            ...ghost, gap: 5, marginTop: 5, fontSize: 12, padding: 0, color: C.gold,
          }}>
            <Wallet size={12} /> {short} · copiar
          </button>
        ) : (
          <div style={{ color: C.faint, fontSize: 11.5, marginTop: 5 }}>Tu bicho cambia al activar la wallet</div>
        )}
      </div>
    </div>
  );
}
