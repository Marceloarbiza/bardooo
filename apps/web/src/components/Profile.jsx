import { useState } from "react";
import { Check, LogOut } from "lucide-react";
import { C } from "../theme";
import { Identicon } from "./ui/Identicon";
import { ghost } from "./ui/styles";

/* Tarjeta de perfil: anillo grande (el bicho), nombre editable inline.
   Fase 2: el nombre se guarda en el SERVER; el handle es INMUTABLE (CLAUDE.md)
   — el bicho sale del handle, así que tu bicho no cambia al renombrarte.      */
export function ProfileCard({ profile, onSaveName, onLogout }) {
  const [editing, setEditing] = useState(false);
  const [tmp, setTmp] = useState(profile.name);
  const save = () => {
    const name = tmp.trim();
    if (name && name !== profile.name) onSaveName(name);
    setEditing(false);
  };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 13, background: `linear-gradient(160deg, ${C.bg3}, ${C.bg2})`,
      border: `1px solid ${C.line}`, borderRadius: 18, padding: 14, marginBottom: 14,
    }}>
      <Identicon seed={profile.handle} size={52} />
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 5 }}>
          <span style={{ color: C.faint, fontSize: 11.5 }}>Tu bicho vive en tu handle</span>
          <button onClick={onLogout} className="press" style={{ ...ghost, gap: 4, padding: 0, fontSize: 11.5 }}>
            <LogOut size={11} /> salir
          </button>
        </div>
      </div>
    </div>
  );
}
