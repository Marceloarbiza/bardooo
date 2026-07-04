import { useEffect, useRef, useState } from "react";
import { money, amt } from "../../lib/format";

/* ---- odometro: los montos ruedan hasta su valor nuevo ---- */
export function useAnimatedNumber(target, dur = 650) {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return val;
}

export function Money({ v }) {
  const a = useAnimatedNumber(v);
  return <>{money(a)}</>;
}
export function Num({ v }) {
  const a = useAnimatedNumber(v);
  return <>{Math.round(a).toLocaleString("es-UY")}</>;
}
export function Amt({ cur, v }) {
  const a = useAnimatedNumber(v);
  return <>{amt(cur, a)}</>;
}
