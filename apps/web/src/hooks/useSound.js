import { useCallback, useEffect, useRef, useState } from "react";
import { sfx } from "../lib/sfx";

/* Sonido de la app: `play(k)` dispara sfx[k] si el sonido está prendido.
   `play` es estable (lee un ref), así los efectos de larga vida (multitud,
   loop del juego) no arrastran closures viejos.                            */
export function useSound() {
  const [soundOn, setSoundOn] = useState(true);
  const soundOnRef = useRef(soundOn);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  const play = useCallback((k) => {
    if (!soundOnRef.current) return;
    try {
      if (sfx.ctx && sfx.ctx.state === "suspended") sfx.ctx.resume();
      sfx[k]();
    } catch (e) {}
  }, []);

  const toggleSound = async () => {
    if (!soundOnRef.current) { try { await sfx.ensure(); sfx.tick(); } catch (e) {} }
    setSoundOn((v) => !v);
  };

  return { soundOn, play, toggleSound };
}
