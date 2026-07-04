import { C } from "../../theme";

export function Style() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap');
      * { -webkit-tap-highlight-color: transparent; }
      input::placeholder, textarea::placeholder { color: ${C.faint}; }
      input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      .press { transition: transform .12s ease; }
      .press:active { transform: scale(.96); }
      .rise { animation: rise .5s cubic-bezier(.2,.8,.2,1) both; }
      @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      .toast { animation: tin .25s ease; }
      @keyframes tin { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translate(-50%, 0); } }
      .blink { animation: bl 1s ease-in-out infinite; }
      @keyframes bl { 50% { opacity: .5; } }
      .pop { animation: pp .18s ease; }
      @keyframes pp { from { transform: scale(1.14); } to { transform: none; } }
      .sheet { animation: up .28s cubic-bezier(.2,.8,.2,1); }
      @keyframes up { from { transform: translateY(100%); } to { transform: none; } }
      .sway { animation: sw 1.2s ease-in-out infinite; }
      @keyframes sw { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
      @keyframes fall { to { transform: translateY(112vh) rotate(720deg); opacity: .85; } }
      .hit { animation: hitp .9s ease; }
      @keyframes hitp { from { box-shadow: 0 0 0 0 var(--hit); } to { box-shadow: 0 0 0 22px transparent; } }
      .marquee { animation: mq 22s linear infinite; }
      @keyframes mq { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      .shine { background: linear-gradient(105deg, transparent 42%, rgba(255,255,255,.14) 50%, transparent 58%); background-size: 260% 100%; animation: sh 3.6s ease-in-out infinite; }
      @keyframes sh { 0% { background-position: 130% 0; } 55%, 100% { background-position: -130% 0; } }
      @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
    `}</style>
  );
}
