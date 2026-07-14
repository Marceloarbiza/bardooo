import { useEffect, useState } from "react";

/*  Detecta el layout de escritorio (>= 960px). A diferencia de las media
    queries de CSS, acá cambia la ESTRUCTURA (sidebar vs bottom-nav, grilla vs
    columna), así que necesitamos el valor en JS. SSR-safe y reacciona al resize. */
const QUERY = "(min-width: 960px)";

export function useIsDesktop() {
  const [is, setIs] = useState(
    typeof window !== "undefined" ? window.matchMedia(QUERY).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setIs(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return is;
}
