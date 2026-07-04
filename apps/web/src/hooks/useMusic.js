import { useEffect, useState } from "react";
import { sfx } from "../lib/sfx";
import { music } from "../lib/music";

/* Música chiptune de fondo. Arranca recién con el gesto de conectar
   (startIfOn), porque el navegador exige interacción para habilitar audio. */
export function useMusic() {
  const [musicOn, setMusicOn] = useState(true);

  const toggleMusic = async () => {
    if (!musicOn) {
      try { await sfx.ensure(); music.start(); setMusicOn(true); } catch (e) {}
    } else {
      music.stop(); setMusicOn(false);
    }
  };

  const startIfOn = () => { if (musicOn) music.start(); };

  useEffect(() => () => music.stop(), []); // corta la musica al desmontar

  return { musicOn, toggleMusic, startIfOn };
}
