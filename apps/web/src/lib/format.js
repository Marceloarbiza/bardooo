/* ------------------------------ helpers de formato ------------------------------ */
export const money = (n) => "$" + Number(n).toLocaleString("es-UY", { maximumFractionDigits: 2 });
export const amt = (cur, n) => cur === "pts" ? Math.round(Number(n)).toLocaleString("es-UY") + " pts" : money(n);
export const mins = (m) => m * 60000;
export const pad2 = (n) => String(n).padStart(2, "0");
export const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const fmtDateTime = (ms) =>
  !ms || isNaN(ms) ? "—"
    : new Date(ms).toLocaleString("es-UY", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const fmtMult = (m) => (m == null ? "—" : "×" + (m >= 10 ? Math.round(m) : m.toFixed(2).replace(/0$/, "")));
