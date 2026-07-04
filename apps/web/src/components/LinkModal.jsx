import { useState } from "react";
import { Link2, Lock, X } from "lucide-react";
import { C } from "../theme";
import { ghost } from "./ui/styles";

/* =================== ABRIR APUESTA POR LINK (privadas) ===================
   Fase 2: el server decide. Se acepta bardooo.app/bet/{id} (código validado
   SERVER-SIDE, jamás viaja al cliente) y también bardooo.app/i/{codigo} para
   registrar una invitación.                                                 */
export function LinkModal({ onClose, onOpen, openByLink, useReferral, fire }) {
  const [txt, setTxt] = useState("");
  const [pendId, setPendId] = useState(null); // apuesta encontrada que pide codigo
  const [codeIn, setCodeIn] = useState("");
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (busy) return;
    const clean = txt.trim().replace(/\s*·.*$/, "");

    // ¿es un link de invitación? bardooo.app/i/{codigo}
    const inv = /\/i\/([A-Za-z0-9_-]+)\s*$/.exec(clean);
    if (inv) {
      setBusy(true);
      const r = await useReferral(inv[1]);
      setBusy(false);
      if (!r.ok) return fire(r.error, "err");
      onClose();
      return fire(r.registered
        ? "¡Invitación registrada! Tu amigo suma 25 pts cuando juegues"
        : "Esa invitación ya estaba registrada");
    }

    const m = /(\d+)\s*$/.exec(clean);
    if (!m) return fire("No encontramos esa apuesta. Revisá el link", "err");
    setBusy(true);
    const r = await openByLink(Number(m[1]));
    setBusy(false);
    if (r.ok) return onOpen(r.bet.id);
    if (r.needsCode) { setPendId(Number(m[1])); return; }
    fire(r.error, "err");
  };

  const unlock = async () => {
    if (busy) return;
    setBusy(true);
    const r = await openByLink(pendId, codeIn.trim());
    setBusy(false);
    if (r.ok) return onOpen(r.bet.id);
    fire(r.wrongCode ? "Código incorrecto" : r.error, "err");
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link2 size={17} color={C.si} />
            <span style={{ fontFamily: "Syne", fontWeight: 800, fontSize: 19 }}>Abrir con link</span>
          </div>
          <button onClick={onClose} className="press" style={{ ...ghost, padding: 6 }}><X size={20} /></button>
        </div>
        {pendId === null ? (<>
          <input value={txt} onChange={(e) => setTxt(e.target.value)} autoFocus
            onKeyDown={(e) => e.key === "Enter" && open()}
            placeholder="bardooo.app/bet/7 · bardooo.app/i/CODIGO" style={{
              width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.line}`,
              borderRadius: 14, padding: "13px 14px", color: C.text, fontSize: 16, outline: "none",
              fontFamily: "inherit", marginBottom: 12,
            }} />
          <button onClick={open} className="press" style={{
            width: "100%", border: "none", borderRadius: 16, padding: "15px", cursor: "pointer",
            fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.bg, opacity: busy ? 0.6 : 1,
            background: `linear-gradient(90deg, ${C.si}, #7cf7de)`,
          }}>{busy ? "Abriendo…" : "Abrir la apuesta"}</button>
        </>) : (<>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: C.gold }}>
            <Lock size={15} /> <span style={{ fontSize: 13.5, fontWeight: 700 }}>Esta apuesta pide código de acceso</span>
          </div>
          <input value={codeIn} onChange={(e) => setCodeIn(e.target.value.toUpperCase())} autoFocus maxLength={12}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
            placeholder="Código" style={{
              width: "100%", boxSizing: "border-box", background: C.bg3, border: `1px solid ${C.gold}55`,
              borderRadius: 14, padding: "13px 14px", color: C.gold, fontSize: 17, outline: "none",
              fontFamily: "inherit", fontWeight: 800, letterSpacing: 2, textAlign: "center", marginBottom: 12,
            }} />
          <button onClick={unlock} className="press" style={{
            width: "100%", border: "none", borderRadius: 16, padding: "15px", cursor: "pointer",
            fontFamily: "Syne", fontWeight: 800, fontSize: 16, color: C.bg, opacity: busy ? 0.6 : 1,
            background: `linear-gradient(90deg, ${C.gold}, #ffdd8f)`,
          }}>{busy ? "…" : "Entrar"}</button>
        </>)}
        <p style={{ color: C.faint, fontSize: 11, margin: "12px 0 0", textAlign: "center", lineHeight: 1.5 }}>
          Las privadas no aparecen en la Arena: solo entra quien tiene el link.
        </p>
      </div>
    </div>
  );
}
