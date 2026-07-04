import { C } from "../../theme";

/* Identicon BARDOOO: cada usuario tiene su propio BICHO PIXELADO — sprite 8-bit
   generado deterministicamente de su semilla (wallet o handle) sobre una grilla
   espejada: el hash decide silueta, ojos, boca, antenas/orejas/cuernos y colores.
   Misma semilla = mismo bicho, siempre. */
export function hashStr(s) {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Identicon({ seed, size = 38 }) {
  const h = hashStr(seed || "bardooo");
  const rng = mulberry32(h);
  const W = 12, HH = 12, CELL = 4, OX = 8, OY = 8;
  const h1 = Math.floor(rng() * 360);
  const h2 = (h1 + 100 + Math.floor(rng() * 120)) % 360;
  const body = `hsl(${h1} 82% 58%)`;
  const shade = `hsl(${h1} 78% 40%)`;
  const acc = `hsl(${h2} 92% 60%)`;
  const top = Math.floor(rng() * 4);    // 0 antena · 1 orejas · 2 cuernos · 3 pelado
  const mouthT = Math.floor(rng() * 3); // 0 sonrisa · 1 abierta · 2 seria
  const eyeR = 4 + Math.floor(rng() * 2);
  const eyeC = 3 + Math.floor(rng() * 2);

  const cells = new Map();
  const put = (r, c, col) => { if (r >= 0 && r < HH && c >= 0 && c < W) cells.set(r + "," + c, col); };
  const putM = (r, c, col) => { put(r, c, col); put(r, W - 1 - c, col); };

  // cuerpo: mitad izquierda al azar, espejada (la simetria lo vuelve "bicho")
  for (let r = 1; r < HH; r++) {
    const rowF = r >= 2 && r <= 9 ? 1 : 0.45;
    for (let c = 0; c <= 5; c++) {
      if (rng() < (0.3 + 0.5 * (c / 5)) * rowF) {
        putM(r, c, hashStr(seed + r + ":" + c) % 6 === 0 ? shade : body);
      }
    }
  }
  // zona de la cara siempre maciza (que ojos y boca tengan donde vivir)
  for (let r = eyeR - 1; r <= Math.min(HH - 1, eyeR + 4); r++)
    for (let c = 2; c <= 5; c++) putM(r, c, body);

  // rasgos de arriba
  if (top === 0) { putM(1, 5, body); putM(0, 5, acc); }
  if (top === 1) { putM(1, 1, body); putM(1, 2, body); putM(0, 1, body); }
  if (top === 2) { putM(1, 2, acc); putM(0, 1, acc); }

  // ojos
  putM(eyeR, eyeC, "#FFFFFF");

  // boca
  const mr = eyeR + 3;
  if (mouthT === 0) { putM(mr, 4, "#1A1030"); put(mr + 1, 5, "#1A1030"); put(mr + 1, 6, "#1A1030"); }
  if (mouthT === 1) { put(mr, 5, "#1A1030"); put(mr, 6, "#1A1030"); put(mr + 1, 5, "#1A1030"); put(mr + 1, 6, "#1A1030"); }
  if (mouthT === 2) { for (let c = 4; c <= 7; c++) put(mr, c, "#1A1030"); }

  const rects = [];
  cells.forEach((col, key) => {
    const [r, c] = key.split(",").map(Number);
    rects.push(<rect key={key} x={OX + c * CELL} y={OY + r * CELL} width={CELL} height={CELL} fill={col} />);
  });
  const pupil = (c, k) => (
    <rect key={k} x={OX + c * CELL + 1} y={OY + eyeR * CELL + 1} width="2" height="2" fill="#1A1030" />
  );
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" shapeRendering="crispEdges" style={{ flexShrink: 0, display: "block" }}>
      <circle cx="32" cy="32" r="31" fill={C.bg3} stroke={C.line} strokeWidth="1.5" shapeRendering="auto" />
      {rects}
      {pupil(eyeC, "p1")}
      {pupil(W - 1 - eyeC, "p2")}
    </svg>
  );
}

export function Avatar({ c }) {
  return <Identicon seed={c.handle || c.name} size={38} />;
}
