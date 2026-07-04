import { C } from "../../theme";

export const ghost = {
  display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
  color: C.dim, cursor: "pointer", fontSize: 14, fontWeight: 600, padding: "6px 0", fontFamily: "inherit",
};
export const stepBtn = (off) => ({
  width: 44, height: 40, borderRadius: 12, cursor: off ? "not-allowed" : "pointer",
  background: "transparent", border: `1.5px solid ${off ? C.line : C.gold}`,
  color: off ? C.faint : C.gold, fontFamily: "Syne", fontWeight: 800, fontSize: 16,
  opacity: off ? 0.5 : 1,
});
export const resolveBtn = (col) => ({
  flex: 1, padding: "14px 0", borderRadius: 14, border: `2px solid ${col}`, background: "transparent",
  color: col, fontFamily: "Syne", fontWeight: 800, fontSize: 16, cursor: "pointer",
});
