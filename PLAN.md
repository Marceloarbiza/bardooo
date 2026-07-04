# PLAN DE EJECUCIÓN — BARDOOO
## De prototipo a producto, con Claude Code

Este documento es el mapa de construcción completo. Se lee junto con CLAUDE.md
(que tiene las decisiones de producto y las reglas inviolables). CLAUDE.md dice
QUÉ es BARDOOO; este plan dice CÓMO y EN QUÉ ORDEN se construye.

**Principio rector**: cada fase termina en algo USABLE y VERIFICABLE. Nunca hay
más de una fase abierta. La fase de puntos (1-2) produce un producto lanzable
sin licencia de juego; la cadena (3-4) llega después y no la bloquea.

---

## FASE 0 — Preparación (esto lo hace Marcelo, no Claude Code)

Antes de la primera sesión de código, tener resuelto:

**Cuentas y servicios** (todos tienen tier gratis para empezar):
- [ ] Repositorio Git (GitHub) con el contenido de este zip como commit inicial
- [ ] Cuenta en **Privy** (dashboard.privy.io) → crear app, guardar App ID y App Secret.
      Habilitar login: Google, email, Twitter. (Elegido porque resuelve auth AHORA
      y wallets embebidas DESPUÉS, sin migrar de proveedor.)
- [ ] Base de datos Postgres: **Supabase** o **Neon** (guardar connection string)
- [ ] Hosting: **Vercel** (front) + **Railway/Render** (API) — o todo en Railway
- [ ] RPC de Polygon: cuenta en **Alchemy** (app para Amoy testnet y otra para mainnet futuro)
- [ ] Wallet de deployer (Metamask nueva, SOLO para deploys) + POL de faucet de Amoy

**Trámites en paralelo** (no bloquean el código, pero empezarlos YA):
- [ ] Dominio `bardooo.app` (o el que esté libre) + handles en redes
- [ ] Estudio de marca: agente de PI → búsqueda DNPI (UY) e INPI (AR), clases 41/9/42
- [ ] Primera consulta legal sobre la fase de dinero real (la fase puntos no la necesita)

**Decisiones que solo vos podés tomar** (Claude Code va a preguntar; mejor llegar decidido):
- [ ] Grace period de relámpagos on-chain: ¿grace global corto (2-4 h) o per-bet acotado?
      (ver CLAUDE.md — recomendación: global corto, porque resolveTime ya codifica el
      fin del evento; simplifica el contrato)
- [ ] ¿Creador con fee 0% cobra igual el bonus relámpago? (recomendación: sí, es incentivo)

---

## FASE 1 — Fundaciones: del artifact a un proyecto real

**Objetivo**: el prototipo corriendo en localhost, idéntico al artifact, pero con
arquitectura de producto: monorepo, componentes separados, matemática compartida.

**Estructura objetivo** (pnpm workspaces):
```
bardooo/
├── apps/web            # Vite + React (el frontend, hoy BardoApp.jsx)
├── apps/api            # Fastify + Prisma (vacío en fase 1, nace en fase 2)
├── packages/core       # LA matemática: commission(), payoutFor(), multFor() en TS
├── contracts/          # Foundry (ya existe: P2PBetting.sol, tests, deploy)
├── CLAUDE.md
└── PLAN.md
```

**Tareas**:
1. Scaffold del monorepo (pnpm + TypeScript + Vitest).
2. **packages/core primero, con tests primero**: portar `commission` y `payoutFor`
   a TS y verificar contra los NÚMEROS EXACTOS de contracts/test/Bet.t.sol
   (pareja 70/60 fee 10% → 33.428571 / 83.571428, dust 1; despareja 120/10 →
   comisión topeada a 10). Estos tests son sagrados: si core y contrato divergen,
   todo lo demás está mal. Enteros de 6 decimales (como USDC), no floats.
3. Migrar BardoApp.jsx a apps/web: separar en componentes/archivos (Arena, Detail,
   Create, QuickModal, LaFicha, Mine, Profile, ui/), un archivo theme.ts con la
   paleta C, hooks para sonido y música. SIN cambiar comportamiento ni diseño.
4. Encapsular el mock detrás de una interfaz `BettingService` (placeBet/createBet/
   resolve/claim/refund/list) — la implementación mock actual adentro. En fases 2-3
   se enchufan implementaciones API y on-chain SIN tocar componentes.
5. `pnpm dev` levanta el front; `pnpm test` corre core en verde.

**Criterio de salida** (verificar a mano): el flujo completo del prototipo funciona
igual — conectar, La Ficha, relámpago de puntos, privada con código, resolver con
doble check, cobrar con jackpot. Tests de core en verde.

**Prompt sugerido para Claude Code**:
> Leé CLAUDE.md y PLAN.md completos. Ejecutá la FASE 1: monorepo pnpm, packages/core
> con la matemática y sus tests espejo del contrato (tests primero), y migrá
> frontend/BardoApp.jsx a apps/web separado en componentes sin cambiar nada de
> comportamiento ni diseño. El mock queda detrás de una interfaz BettingService.

---

## FASE 2 — Backend de puntos + Auth (el producto lanzable)

**Objetivo**: BARDOOO real multi-usuario en fase puntos. Dos personas en dos
navegadores juegan el mismo duelo. Esto es lo que se lanza al público.

**Tareas**:

*Auth (Privy)*:
1. Login Google/email/Twitter en el front (SDK de Privy) reemplaza la pantalla
   de entrada demo. Verificación del token de Privy SERVER-SIDE en cada request.
2. Alta de usuario en primer login: name, handle único (validar colisión, sufijo
   numérico si choca), bicho = identicon del handle (misma función determinística
   del front, portada a core si el server la necesita).

*Datos (Prisma + Postgres)* — schema mínimo:
- `User` (id, privyId, name, handle único, walletAddr?, points, createdAt)
- `Bet` (todos los campos del prototipo + currency, isPrivate, **codeHash** —
  el código JAMÁS viaja al cliente, se compara hasheado en el server —, relampago,
  launch, deadline, mirrorOfId? para el gemelo)
- `Stake` (userId, betId, option, amount) — la regla de un-solo-lado se valida acá
- `PointsLedger` (userId, delta, motivo: ficha|referido|apuesta|premio|comision|refund,
  ref) — TODO movimiento de puntos pasa por acá, auditable
- `Flight` (userId, fecha, count, bestScore) — límite diario de La Ficha
- `Referral` (codigo, referrerId, referredId?, estado)
- `Activity` (evento público para ticker/feed)

*Endpoints (Fastify)*:
3. `me`, `profile.update`; `bets.list` (público, excluye privadas), `bets.get(id)`
   (privada con código → endpoint `bets.unlock(id, code)` compara hash server-side),
   `bets.create` (con **espejo automático**: si el user tiene walletAddr, crea el
   gemelo pts — en fase 2 sin cadena, el "USDC" queda deshabilitado con banner
   "pronto"; el espejo se activa de verdad en fase 3), `bets.place` (validaciones
   TODAS en server: lado único, mín/fijo, saldo, estado, ventana), `bets.resolve`
   (solo creador, después de closeTime, antes de deadline en relámpagos; resolver
   liquida con packages/core en UNA transacción de DB), `bets.claim`, `bets.refund`.
4. **La Ficha anti-trampa**: `ficha.start` → devuelve un flightToken con timestamp;
   `ficha.end(token, score)` → valida: tope 3/día (server), score ≤ 15, duración
   del vuelo plausible (≥ ~1.2 s por caño), rate limit. El cliente NUNCA acredita.
5. **Referidos**: link `/i/{codigo}`; acreditar +25 SOLO cuando el referido completa
   primer login + una acción (un vuelo o una apuesta). Anti-sybil básico: un referido
   por cuenta de Privy, rate limit por IP.
6. **Ticker/actividad real**: la multitud simulada del front SE BORRA; el ticker se
   alimenta de `Activity` (últimas 24 h — diseño "todavía somos pocos" del CLAUDE.md).
7. Job (cron cada minuto): anular relámpagos vencidos (deadline sin resolver) y
   generar refunds; estados open→locked se derivan por tiempo al leer.
8. Front: implementación `ApiBettingService` contra estos endpoints; websocket o
   polling corto (5 s) para pozos y ticker en vivo (el pulso y el odómetro ya
   están listos para recibirlo).

**Criterio de salida** (prueba de fuego): dos navegadores, dos cuentas de Google
distintas. A crea relámpago privado con código; B entra por link, mete el código,
apuesta al otro lado; A ve el pozo latir en vivo; cierra; A resuelve con doble
check; B cobra; los ledgers cuadran al centavo con packages/core. La Ficha rechaza
el 4to vuelo del día y un score imposible. **Con esto se puede salir a beta.**

**Prompt sugerido**:
> FASE 2 según PLAN.md. Empezá por el schema de Prisma y los tests de liquidación
> usando packages/core, después endpoints, después integración del front. El código
> de las privadas se guarda hasheado y se valida solo en el server. La Ficha valida
> score y límite diario en el server. Al final, borrá la multitud simulada y
> conectá el ticker a la actividad real.

---

## FASE 3 — La cadena: USDC en testnet (Polygon Amoy)

**Objetivo**: los duelos de plata funcionan de verdad en testnet, con el espejo
de puntos sincronizado. Nada de esto toca el lanzamiento de la fase puntos.

**Tareas**:
1. Contrato — completar el backlog crítico ANTES de congelar para auditoría:
   - Prohibir que el creador apueste en su propio pozo
   - `lockBetting()` opcional del creador
   - Split relámpago: `flashPlatformFeeBps` o flag `isFlash` en Config
   - Aplicar la decisión de grace de FASE 0
   - `forge test` en verde SIEMPRE (los tests existentes + nuevos para lo agregado)
2. Deploy en Amoy con el script existente (MockUSDC + BetFactory); addresses a
   un config compartido (`packages/core/addresses.ts`).
3. `ChainBettingService` en el front (wagmi + viem): approve → placeBet, createBet
   por factory, resolve, claim. Conversión ms→segundos (÷1000). PLATFORM_BPS se
   LEE de `factory.platformFeeBps()`, nunca hardcodeado.
4. **Indexer** (viem watchEvent o poller cada 5 s en la API): eventos BetCreated/
   BetPlaced/Resolved/Claimed → actualizan DB → alimentan feed, ticker, pozos y el
   **espejo**: resolver el bet USDC on-chain dispara automáticamente la resolución
   del gemelo de puntos en DB (la acción del creador es UNA sola en la UI).
5. Botón "Activar" del prototipo pasa a conectar wallet real (wagmi connectors);
   faucet de MockUSDC en la UI de testnet ("Cargá 500 USDC de prueba").

**Criterio de salida**: en Amoy, dos wallets reales juegan un duelo USDC completo;
el gemelo de puntos se resolvió solo; los montos cobrados coinciden EXACTO con
lo que predice packages/core; el ticker muestra los eventos de la cadena.

---

## FASE 4 — Gasless + wallet invisible (la graduación de verdad)

**Objetivo**: el usuario de Google llega a apostar USDC sin ver nunca una frase
semilla ni pagar gas. Es la promesa del sheet "Activá tu saldo".

**Tareas**:
1. **Wallets embebidas de Privy**: al tocar "Activar", Privy crea la wallet desde
   la sesión existente (sin extensión, sin seed phrase visible). `walletAddr` al
   perfil → el bicho cambia de semilla (momento "conocé a tu bicho definitivo").
2. **Relayer ERC-2771**: elegir proveedor (Gelato Relay / OpenZeppelin Defender /
   Biconomy), desplegar/configurar trusted forwarder, RE-desplegar factory con el
   forwarder correcto (el contrato ya es 2771-ready). El usuario firma, BARDOOO
   paga el gas. Presupuestar el costo de gas por apuesta (es marketing, medirlo).
3. **Onramp** (según CLAUDE.md): pestaña "Comprar con tarjeta" (funding de Privy /
   MoonPay) + pestaña "Depositar" (address + QR + aviso "solo USDC nativo por
   Polygon"). Detección de depósito por indexer → notificación en la app. Decidir
   e implementar el manejo de USDT entrante (detectar y avisar, mínimo).

**Criterio de salida**: cuenta nueva de Google → puntos → "Activar" (wallet nace
invisible) → faucet/depósito → apuesta USDC → cobra. Cero gas visible, cero
vocabulario cripto en pantalla.

---

## FASE 5 — Pulido, seguridad y beta con humanos

**Objetivo**: que no se rompa ni lastime cuando entra gente de verdad.

**Tareas**:
1. **Juego responsable**: en fase puntos, recordatorios suaves de tiempo de sesión;
   preparar (feature-flag) para fase USDC: límites de carga/apuesta configurables
   por el usuario, autoexclusión, links de ayuda. No es opcional en fase USDC.
2. Hardening: rate limits por endpoint, sanitización de handles y preguntas
   (longitud, sin HTML), CORS estricto, secrets fuera del repo, logs de auditoría
   sobre PointsLedger.
3. Panel mínimo de admin (puede ser CLI o página oculta): ver apuestas reportadas,
   anular manualmente, ajustar puntos con motivo — al principio, VOS sos la
   ventana de disputa.
4. Analytics del embudo (Posthog o similar): login → primer vuelo → primera
   apuesta → primer share → activación wallet. Son LAS métricas del proyecto.
5. Deep links reales `/bet/:id` (con gate de código) y `/i/:codigo`; PWA
   (manifest + installable) para que viva en el teléfono.
6. **La beta que valida todo** (esto es tuyo, no de Claude Code):
   - Un streamer mediano corriendo 5 relámpagos en un solo vivo
   - Tu grupo de amigos jugando una privada del asado
   - Medir: ¿volvieron al día siguiente? ¿La Ficha trajo gente sola?

**Checklist pre-mainnet** (NO desplegar dinero real sin TODOS):
- [ ] Auditoría profesional del contrato (después del backlog de fase 3)
- [ ] Luz verde legal para la jurisdicción de lanzamiento
- [ ] Ventana de disputa implementada (o plan de arbitraje manual documentado)
- [ ] Juego responsable activo
- [ ] AML/KYC según lo que diga el abogado

---

## Cómo trabajar con Claude Code (método)

1. **Una fase por vez, un objetivo por sesión.** Sesiones largas multipropósito
   producen deuda. "Hoy: schema + tests de liquidación" es una buena sesión.
2. **Siempre arranca igual**: "Leé CLAUDE.md y PLAN.md" — es contexto barato que
   evita que reinvente o 'mejore' reglas bloqueadas (comisión topeada, pozos
   separados, código server-side, total del apostador inmutable en relámpagos).
3. **Tests primero donde hay plata**: packages/core y la liquidación del backend
   se escriben test-first contra los números del contrato. Pedíselo explícito.
4. **Commits chicos y frecuentes**; que Claude Code corra `pnpm test` y
   `forge test` antes de cada commit. Si algo rojo, no se avanza.
5. **Vos verificás los criterios de salida a mano** — la prueba de dos navegadores
   de la fase 2 no la puede hacer solo; hacela vos con tu teléfono y tu compu.
6. Cuando Claude Code proponga desviarse del plan con buena razón, que lo anote
   en CLAUDE.md como decisión antes de implementar. El documento manda.

## Estimación honesta

Con sesiones dedicadas de Claude Code y tus verificaciones: **Fase 1** en 1-2
sesiones; **Fase 2** es la más grande, 1-2 semanas de sesiones (schema, endpoints,
integración, pruebas); **Fase 3** ~1 semana (el contrato ya existe, es cableado +
indexer); **Fase 4** días si Privy/relayer cooperan, más si hay fricción de
proveedores; **Fase 5** continua. El producto lanzable (fin de fase 2) está a
~2-3 semanas de trabajo enfocado. La cadena suma ~2 más. La beta con el streamer
puede (y debería) ocurrir con solo la fase 2 terminada.
