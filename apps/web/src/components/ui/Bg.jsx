import { C } from "../../theme";

export function Bg() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: -140, left: -120, width: 380, height: 380, borderRadius: "50%", background: `radial-gradient(circle, ${C.si}14, transparent 65%)` }} />
      <div style={{ position: "absolute", top: 120, right: -160, width: 420, height: 420, borderRadius: "50%", background: `radial-gradient(circle, ${C.no}12, transparent 65%)` }} />
      <div style={{ position: "absolute", bottom: -180, left: "20%", width: 460, height: 460, borderRadius: "50%", background: `radial-gradient(circle, #5B2EA810, transparent 65%)` }} />
    </div>
  );
}
