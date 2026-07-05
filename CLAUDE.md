# BARDOOO — Plataforma de apuestas P2P parimutuel en blockchain

> **Este documento se lee junto con PLAN.md**, que contiene el plan de ejecución
> completo por fases (qué construir, en qué orden, criterios de salida y prompts).
> CLAUDE.md = decisiones y reglas. PLAN.md = hoja de ruta.


## Qué es este proyecto

Plataforma de apuestas peer-to-peer donde cualquiera crea una apuesta binaria (SÍ/NO)
sobre lo que sea, la gente apuesta a un lado, y al resolverse el pozo perdedor se
reparte proporcionalmente entre los ganadores. El creador y la plataforma cobran
comisión. Público objetivo: youtubers/influencers y sus audiencias (mobile-first).

**Modelo: parimutuel (pozo), NO order-book.** No es Polymarket: no hay cuotas, no hay
precio dinámico, no hay tokens negociables ni reventa de posiciones. La gente pone
plata en un pozo y se reparte al cierre. Esta decisión es DELIBERADA (simplicidad,
funciona sin liquidez ni market makers). No proponer migrar a order-book/CTF.

- Chain: **Polygon** (testnet: **Amoy**, chainId 80002)
- Token: **USDC (6 decimales)** — en testnet se usa `MockUSDC.sol`
- Gasless: **ERC-2771 meta-transacciones** (el contrato ya usa `_msgSender()` en todo)

## Estructura (monorepo pnpm — FASE 1 de PLAN.md hecha)

```
bardooo/
├── CLAUDE.md              ← este archivo
├── PLAN.md                ← plan de ejecución por fases
├── pnpm-workspace.yaml    ← workspaces: apps/*, packages/*
├── apps/
│   ├── web/               ← Vite + React: el prototipo migrado a componentes
│   │   └── src/
│   │       ├── App.jsx            ← orquestador (estado de sesión, toasts, vistas)
│   │       ├── theme.ts           ← paleta C + constantes de plataforma
│   │       ├── components/        ← Arena, Detail, Create, QuickModal, LaFicha,
│   │       │                        Mine, Profile, LinkModal, WalletSheet, ui/
│   │       ├── hooks/             ← useSound, useMusic
│   │       ├── lib/               ← format, sfx, music, math (re-export de core)
│   │       └── services/          ← BettingService.ts (interfaz) + mock actual;
│   │                                en fases 2-3 se enchufan API y on-chain
│   └── api/               ← placeholder (Fastify + Prisma, nace en fase 2)
├── packages/
│   └── core/              ← LA matemática (bigint 6 decimales, espejo del contrato,
│                            tests contra los números EXACTOS de test/Bet.t.sol)
├── foundry.toml           ← config Foundry (src = contracts)
├── remappings.txt
├── contracts/
│   ├── P2PBetting.sol     ← BetFactory + Bet (2 contratos en 1 archivo)
│   └── MockUSDC.sol       ← USDC de prueba, mint abierto. SOLO testnet.
├── test/
│   └── Bet.t.sol          ← suite Foundry completa (correr y hacer pasar)
├── script/
│   └── Deploy.s.sol       ← deploy a Amoy
├── frontend/
│   └── BardoApp.jsx       ← prototipo original en 1 archivo (REFERENCIA: ya migrado
│                            a apps/web, no editar acá)
└── docs/
    └── INTEGRATION.md     ← guía para cablear frontend ↔ contrato con wagmi
```

Comandos de la app: `pnpm install`, `pnpm dev` (levanta apps/web), `pnpm test`
(tests de core — sagrados: si divergen del contrato, todo lo demás está mal).

## Arquitectura de contratos

- **`BetFactory`** (se despliega UNA vez): guarda config de plataforma — token,
  treasury, `platformFeeBps`, `maxCreatorFeeBps` (techo de comisión del creador),
  `gracePeriod`. `createBet(cfg)` despliega un `Bet` nuevo y lo registra en `allBets`.
- **`Bet`** (uno por apuesta, lo crea la factory, NUNCA se despliega a mano): recibe
  stakes, resuelve, paga. La plata vive en cada Bet, nunca en la factory.

### Decisiones de diseño BLOQUEADAS (no cambiar sin consultar al dueño)

1. **Comisión sobre el TOTAL apostado, topeada al pozo perdedor:**
   `commission = min((platformBps + creatorBps) × total / 10000, pozoPerdedor)`.
   Garantiza matemáticamente que ningún ganador cobre menos que su stake.
   Cuando se topea, el reparto plataforma/creador es proporcional a sus bps.
2. **Reparto proporcional:** `payout = stake × neto / poteGanador`, siempre con
   `Math.mulDiv` (multiplicar antes de dividir, truncar hacia abajo). El "dust"
   (millonésimas) queda en el contrato → el contrato SIEMPRE es solvente.
3. **Pull-payment:** cada ganador llama `claim()`. Nunca pagar en loop.
4. **Un solo lado por usuario:** si ya tenés stake en una opción, apostar a otra
   revierte con `AlreadyOnOtherSide`. Sí se puede sumar al mismo lado.
5. **Sin oráculo, confianza en el creador:** `resolve(option)` solo el creador y solo
   después de `resolveTime`. Válvula de escape: `forceRefund()` — pasado
   `resolveTime + gracePeriod` sin resolver, CUALQUIERA gatilla la devolución total.
6. **`gracePeriod` y `platformFeeBps` son de PLATAFORMA** (viven en la factory, se
   inyectan a cada Bet). El creador NO los elige. El creador solo elige su
   `creatorFeeBps` (≤ `maxCreatorFeeBps`, hoy 10%).
7. **Anulación sin contraparte:** si al resolver hay dinero en menos de 2 opciones,
   la apuesta se cancela sola y todos recuperan su stake completo (sin comisión).
   Lo mismo si el creador llama `cancel()` (empate/evento suspendido).
8. **Modos de stake:** `Fixed` (todos el mismo monto), `Free` (libre ≥ minStake),
   `Capped` (libre hasta maxStake por usuario). Los 3 usan el MISMO reparto.
9. **Tope de apostadores (`maxBettors`)** es TOTAL (nunca por lado); al llenarse la
   apuesta pasa a `Locked`.
10. **Binario hoy, escalable a N:** pools indexados `poolByOption[i]`,
    `numOptions = 2`. Al escalar a N, agregar `require` de que la opción ganadora
    tenga pozo > 0 (con N>2 puede ganar una opción vacía → división por cero).

### Parámetros de referencia
- `platformFeeBps = 300` (3%), `gracePeriod = 14400` (4 h), `minStake` típico
  `5e6` (5 USDC).

### DECISIONES DEL DUEÑO (2026-07-05, fase 3) — reemplazan lo anterior
1. **Comisiones FIJAS, sin slider del creador**: normal = 3% plataforma + 7%
   creador; relámpago = 1% plataforma + 9% creador. Total al apostador SIEMPRE
   10% (regla inviolable, ahora con require en el contrato). Los cuatro bps son
   parámetros de plataforma (setters onlyOwner en la factory) — fijos para el
   usuario, ajustables como dial de crecimiento sin redeploy. `maxCreatorFeeBps`
   y `creatorFeeBps` del Config quedan OBSOLETOS; el Config gana `isFlash`.
2. **Grace period global corto: 4 h** (era 48 h). Vale para todas las apuestas;
   resolveTime ya codifica el fin del evento. El deadline duro de 30 min de los
   relámpagos lo sigue manejando el backend/indexer (la válvula on-chain de 4 h
   es el respaldo trustless).

## Estado actual (qué está hecho y qué falta)

HECHO:
- Contratos completos y compilando (verificado en Remix, solc 0.8.24).
- Lógica económica validada con fuzzing en Python: ~147k escenarios, 0 fallos en
  invariantes (ganador nunca cobra < stake; solvencia; dust ≥ 0; split exacto).
- Frontend React completo y funcional con capa blockchain SIMULADA (estado React).
- MockUSDC desplegado y minteado en Remix VM por el dueño (prueba manual a medias).
- **FASE 1 de PLAN.md (2026-07-04)**: monorepo pnpm; `packages/core` con la
  matemática en bigint 6 decimales y tests espejo del contrato (18 en verde:
  33_428_571 / 83_571_428 / dust 1 / tope 10e6 / split 3.9-9.1 / split flash);
  prototipo migrado a `apps/web` en componentes, mock detrás de la interfaz
  `BettingService`. `pnpm test` y `pnpm build` en verde. Criterio de salida
  verificado a mano por el dueño. Repo: github.com/Marceloarbiza/bardooo.
- **FASE 2 backend (2026-07-04)**: `apps/api` completo — Prisma schema (User/Bet/
  Stake/PointsLedger/Flight/Referral/Activity), liquidación de puntos ENTEROS con
  packages/core (test-first, números sagrados del contrato + fuzz), endpoints
  Fastify con TODAS las validaciones server-side, auth Privy (token verificado en
  cada request), privadas con codeHash sha256 (el código jamás viaja), La Ficha
  anti-trampa (3/día + score ≤15 + duración ≥1.2s/caño, todo server), referidos
  +25 diferido a primera acción real, ticker de Activity 24h, cron de relámpagos
  vencidos con devolución automática. 42 tests de api en verde.
  DECISIONES fase 2: (a) puntos son ENTEROS (granularidad 1 pt, dust absorbe, split
  floor → creador se lleva el resto, igual que el contrato); (b) al CANCELAR se
  devuelve automáticamente a todos en la misma transacción (en puntos no hay gas;
  /refund queda de red de seguridad); (c) el premio SÍ es pull (claim) para
  conservar el momento jackpot; (d) handle inmutable (el prototipo lo derivaba del
  nombre editable — la app real no); (e) tiempos de relámpago los fija el SERVER;
  (f) la comisión de plataforma en puntos es un sink auditable (ledger + dust).
- **FASE 2 front (2026-07-04)**: `apps/web` integrado — login real con Privy
  (@privy-io/react-auth, VITE_PRIVY_APP_ID en .env.local), `ApiBettingService`
  implementa la interfaz de fase 1 contra apps/api, multitud simulada BORRADA
  (el mock queda en services/mockBettingService.js como referencia, ya no se
  importa), ticker desde /activity y pozos por polling 5s con lastHit derivado
  de la diferencia de pools (el pulso late con actividad real), La Ficha vía
  /ficha/start+end (el server acredita), referidos con refCode real (el LinkModal
  también acepta links /i/{codigo}), privadas por /unlock. Wallet = sheet "pronto".
  El código de una privada propia se recuerda en memoria local para compartir
  (el server no lo devuelve NUNCA); tras recargar, la tarjeta muestra solo link.
  Prueba de fuego de dos navegadores verificada por el dueño el 2026-07-05.
- **DEPLOY (2026-07-05) — FASE 2 COMPLETA, en producción**:
  - Front: https://bardooo.vercel.app (Vercel, proyecto `bardooo`, deploy desde la
    raíz del repo con vercel.json; envs VITE_PRIVY_APP_ID + VITE_API_URL).
  - API: https://api-production-18b7.up.railway.app (Railway, proyecto `bardooo`,
    servicio `api` + Postgres del mismo proyecto; railway.json en la raíz; el
    start corre `prisma db push` idempotente; envs BARDOOO_DATABASE_URL (referencia
    ${{Postgres.DATABASE_URL}}), PRIVY_APP_ID/SECRET, CORS_ORIGIN=front).
  - Deploy manual por CLI (`railway up` / `vercel deploy --prod`); conectar los
    deploys automáticos por git es mejora pendiente.
- **FASE 3 contrato (2026-07-05)**: backlog crítico implementado y `forge test`
  24/24 en verde (Foundry 1.7.1 instalado, deps en lib/): comisiones fijas con
  invariante on-chain (FeeTotalsMismatch si normal≠flash; techo 20%), Config con
  `isFlash` (la factory inyecta el split 300/700 ó 100/900), el creador NO puede
  apostar en su pozo (CreatorCannotBet), `lockBetting()` del creador (cierra
  apuestas sin adelantar resolveTime), grace 4 h. Backend y front alineados al
  modelo fijo (slider eliminado; creatorBps deprecado e ignorado en la API;
  /config expone los 4 bps). Wallet de deployer Amoy generada
  (0x27E16bEF25fB93E393B8D60C589CA518229C0A0c, clave en .env raíz, SOLO testnet;
  treasury testnet = deployer).
- **DEPLOY AMOY (2026-07-05)** — direcciones en `packages/core/src/addresses.ts`:
  MockUSDC `0xb5e00AAD4523665636F5465c77D1D506C3A993D8`, BetFactory
  `0xa93D1967BbB16d219242Dd43Ee94a276f65494e6` (fees 300/700 y 100/900, grace
  14400 verificados on-chain con cast). El primer intento se quedó sin gas a
  mitad (faucets con muros anti-sybil): script/DeployFactory.s.sol existe para
  deployar solo la factory con gas afinado (tip mínimo 25 gwei de Amoy).
  Ambos contratos VERIFICADOS en Polygonscan Amoy (2026-07-05; la key de
  Etherscan vive en .env raíz).
- **FASE 3 cableado (2026-07-05)**: cadena ↔ app conectadas.
  - ABIs generadas con forge inspect en packages/core/src/abi.ts (+ AMOY.deployBlock).
  - INDEXER en apps/api (poller viem 5s, RPC dRPC — el oficial limita getLogs):
    BetCreated materializa el duelo usdc (montos en MICRO-unidades Int, tope
    testnet ~2147 USDC/stake — migrar a BigInt antes de mainnet) + crea el
    GEMELO pts si el creador es usuario vinculado; BetPlaced/Claimed → stakes y
    Activity (ticker late con la cadena); Resolved/Cancelled → estado + ESPEJO
    automático (systemResolveBet/systemCancelBet, sin chequeos de creador: la
    cadena es la autoridad). Idempotente vía tabla ChainEvent (txHash:logIndex).
  - Vincular wallet: POST /me/wallet con FIRMA verificada server-side (viem
    verifyMessage); mensaje "BARDOOO: vinculo la wallet <addr> a mi cuenta <handle>".
  - Front: wagmi v3 (injected/MetaMask, solo Amoy) + ChainBettingService: las
    ESCRITURAS usdc van a la cadena (approve exacto → placeBet, createBet por
    factory con ms→segundos, resolve/claim/refund) con pasos contados en toasts;
    las LECTURAS siguen saliendo de la API. WalletSheet real: conectar → firmar
    vínculo → faucet 500 mUSDC. feeBps viaja del server (fin del hardcodeo).
  - Duelos PRIVADOS con wallet siguen saliendo solo en puntos (la privacidad es
    de la app, no del contrato) — backlog.
  - Endpoints place/resolve/claim/refund rechazan bets usdc (CHAIN_ONLY).
  - Los apostadores on-chain necesitan POL para gas hasta la fase 4 (gasless).
  PENDIENTE fase 3: criterio de salida a mano (dos wallets reales, duelo USDC
  completo, gemelo pts auto-resuelto, montos exactos vs core).
  OJO ENTORNO LOCAL: la env var se llama BARDOOO_DATABASE_URL (no DATABASE_URL)
  porque el shell de la máquina exporta un DATABASE_URL global de otra infra.
  Tests de api corren contra bardooo_test (fijado en vitest.config.ts, NUNCA en
  el test: los imports ESM se ejecutan antes y Prisma captura la URL).

PENDIENTE (tu trabajo, en orden):
1. **Foundry**: `forge init` sobre esta estructura, instalar deps, hacer pasar
   `test/Bet.t.sol` completo. Si un test falla, el bug puede estar en el contrato:
   analizalo, no "arregles" el test para que pase.
2. **Deploy a Amoy**: `script/Deploy.s.sol` (MockUSDC + BetFactory), verificar en
   Polygonscan Amoy. Guardar direcciones en `frontend/src/config.ts`.
3. **Frontend real**: proyecto Vite + React + wagmi + viem + RainbowKit (o ConnectKit).
   Migrar `BardoApp.jsx` reemplazando SOLO la capa simulada (ver docs/INTEGRATION.md).
   El diseño visual NO se cambia sin pedido explícito.
4. **Gasless (fase 2, no bloquea lo anterior)**: forwarder ERC-2771 + relayer
   (OpenZeppelin Defender o custom). Mientras tanto la app funciona con gas normal.

## Comandos

```bash
# setup (una vez)
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts --no-commit

# ciclo de desarrollo
forge build
forge test -vvv
forge test --match-test test_EvenCase -vvvv   # un test puntual

# deploy a Amoy (necesita .env: PRIVATE_KEY, TREASURY; y POL de faucet en la wallet)
forge script script/Deploy.s.sol --rpc-url amoy --broadcast
# verificación (ETHERSCAN_API_KEY con soporte Amoy):
forge verify-contract <ADDR> contracts/P2PBetting.sol:BetFactory --chain 80002 ...
```

Faucet Amoy: https://faucet.polygon.technology (pedir POL para la wallet de deploy).

## Trampas conocidas de integración (leer antes de tocar el frontend)

- **ms vs segundos:** JS usa milisegundos; Solidity, segundos. Al llamar al contrato:
  `Math.floor(msTimestamp / 1000)`. Al leer del contrato: `× 1000`. Error clásico.
- **`PLATFORM_BPS` NO se hardcodea:** el frontend simulado tiene `PLATFORM_BPS = 300`
  como constante; en la app real se LEE de `factory.platformFeeBps()`.
- **`approve` antes de `placeBet`:** USDC es ERC20; sin approve, placeBet revierte.
  UX: botón de dos pasos (Aprobar → Apostar) o approve exacto por apuesta.
- **Unidades:** todo en unidades de 6 decimales (1 USDC = 1_000_000). El front
  convierte con `parseUnits(x, 6)` / `formatUnits(x, 6)`.
- **La regla de los 5 minutos** (cierre = inicio del evento − 5 min) vive en el
  FRONTEND, no en el contrato. Mantenerla al armar el `Config`.
- **Eventos para refrescar UI:** `BetCreated` (factory), `BetPlaced`, `Resolved`,
  `Cancelled`, `Claimed`, `Refunded`, `FeesWithdrawn` (Bet). Usar `watchContractEvent`.

## Reglas para vos (Claude Code)

- Idioma de la UI y los mensajes al usuario: **español rioplatense** (vos/tenés).
- No cambiar la matemática económica ni las decisiones bloqueadas de arriba.
- No desplegar a **mainnet** bajo ninguna circunstancia: este código NO está auditado.
  Testnet Amoy solamente. Decirlo explícitamente si el dueño lo pide.
- `MockUSDC` tiene mint abierto: JAMÁS va a mainnet.
- Mantener el espejo exacto entre la fórmula de payout del contrato y la del frontend
  (función `payoutFor` / `commission` en el JSX).
- Antes de marcar la fase de tests como terminada: `forge test` en verde COMPLETO.
- Si agregás dependencias al frontend, justificalas en el commit.

## Definición de "terminado" (para esta etapa)

1. `forge test` pasa completo con los tests de `test/Bet.t.sol`.
2. Factory + MockUSDC desplegados y verificados en Amoy, direcciones documentadas.
3. Frontend corriendo con `npm run dev`, conectando wallet real (MetaMask) en Amoy,
   y el flujo completo funciona on-chain: crear apuesta → apostar de 2 cuentas →
   resolver → claim → withdrawFees. Con estados de carga y de error de transacción.
4. README con instrucciones de setup reproducibles desde cero.

## Decisiones de producto v2 (acordadas con el dueño — implementadas en el prototipo)

### Economía de dos monedas: puntos BARDOOO + USDC
- **Los puntos viven OFF-CHAIN** (base de datos, no token). Jugar con puntos NO requiere
  wallet: login social/email. La wallet es la "graduación", no la puerta de entrada.
- **Pozos NUNCA mezclados**: cada duelo nace siendo de puntos o de USDC (campo
  `currency` en el prototipo). Mezclar permitiría apostar valor gratis contra dinero real.
- Los puntos NO se convierten a USDC ni se retiran. Sirven para: apostar en duelos de
  puntos, descuentos de comisión, acceso a apuestas exclusivas, rankings.
- **Fase de lanzamiento**: la plataforma puede lanzar SOLO con puntos (sin licencia de
  juego, valida producto). El contrato USDC queda listo para activarse después, donde
  y cuando lo legal lo permita. Esta secuencia es estratégica, no técnica.

### La Ficha (mini-juego Flappy — el anillo de BARDOOO girando entre pilares)
- Paga PUNTOS (1 pt por caño, tope 15 por vuelo), nunca USDC. Es onboarding (primera
  ficha gratis), retención diaria (3 vuelos/día) y contenido para creadores (rankings).
- En producción: límite diario y premio se validan en BACKEND (el cliente que reporta
  su propio score es trivialmente hackeable — verificar server-side o replay).

### Referidos
- Compartir la app da puntos (+25 por amigo en el prototipo, simulado).
- En producción: acreditar solo cuando el referido entra y juega, con anti-sybil
  (device/telefono/actividad mínima). Nunca acreditar al copiar el link.
- TODOS los links compartidos son de referido: tanto la invitación general (Mías)
  como el "Compartir" de cada apuesta llevan el código del usuario — compartir un
  duelo concreto convierte mejor que la invitación genérica. Misma recompensa (+25).

### Apuesta Relámpago (modo principal de creación)
- Flujo: (+) → escribe la pregunta → elige moneda (pts/USDC) → Libre o Fijo (+monto)
  → ventana de apuestas (2/5/10/15 min) → Lanzar. Un solo scroll, cero fechas.
- Mapping al contrato: `closeTime = lanzamiento + ventana`; `resolveTime = closeTime`
  (+1s por el require closeTime < resolveTime). El creador resuelve cuando quiera
  después del cierre.
- **Regla dura: máximo 2 h de vida total.** Si a las 2 h del lanzamiento no hay
  resultado, la apuesta se anula y todos recuperan (implementado en el prototipo).
  NOTA CONTRATO: el `gracePeriod` global (48 h) no honra este tope para relámpagos.
  Decisión pendiente para on-chain: (a) grace global corto (2-4 h es razonable porque
  `resolveTime` ya codifica el fin del evento), o (b) grace por apuesta acotado por
  un mín/máx de plataforma. Discutir con el dueño antes de implementar.
- La ventana de apuestas corta existe para evitar apostar con el resultado ya visto
  (ej.: apostar SÍ un segundo después del gol). No eliminarla.

### Simplificaciones de UI
- El modo "Capped" (con tope) SIGUE en el contrato (testeado, no tocar) pero está
  OCULTO en la UI de creación. Reactivable en el front si el piloto lo pide.
- Duelos de puntos llevan badge "⚡ PUNTOS" en carta y detalle; formateo vía
  `amt(currency, n)` — mantener al integrar.

### Doble confirmación al resolver (implementado en prototipo)
- Al tocar "Ganó el SÍ/NO" salta un modal de reconfirmación con la pregunta, el lado
  elegido y el aviso de irreversibilidad. Mantener SIEMPRE en la app real: resolver
  es la única acción sin vuelta atrás del creador. Complementa (no reemplaza) la
  ventana de disputa del backlog.

### Backlog de contrato (NO implementado — próximas iteraciones)
1. Prohibir que el creador apueste en su propio pozo (conflicto de interés directo).
2. Ventana de disputa: tras `resolve()`, claims habilitados a las 24 h; si N
   perdedores disputan, escala a arbitraje de plataforma.
3. Reputación de creador indexable (resoluciones a tiempo, disputas perdidas).
4. `lockBetting()` opcional del creador (cerrar apuestas manualmente antes de tiempo).
5. Clones EIP-1167 para abaratar creación (ya anotado en la factory).

### Juego responsable
- Sonidos de recompensa + música + juego diario = mecánicas de refuerzo deliberadas.
  En producción con dinero real: límites de depósito/apuesta, autoexclusión y avisos
  de juego responsable NO son opcionales. Incluir desde el día uno de la fase USDC.

## Backend y autenticación (NO implementado — el prototipo lo simula todo)

El prototipo simula: login social, puntos, límites de La Ficha, referidos, wallet.
Nada de eso existe aún. Para la fase puntos (lanzamiento) se necesita:

1. **Auth**: login con Google/Twitter/email. RECOMENDACIÓN: usar un proveedor que
   además cree wallets embebidas (ej. Privy; alternativas: Web3Auth, Dynamic), así
   el mismo login sirve para la fase puntos Y para la graduación a USDC sin migrar.
   Alternativa: auth clásico (Supabase/Clerk/Firebase) + wallet embebida aparte después.
2. **Backend + DB** (el corazón off-chain): usuarios, saldo de puntos, historial,
   duelos de puntos (los de puntos NO van a la blockchain: se liquidan en la DB con
   la MISMA matemática del contrato — comisión topeada, reparto proporcional),
   vuelos diarios de La Ficha (límite server-side), validación de score del juego,
   referidos con anti-sybil, y el feed de actividad real (reemplaza la multitud simulada).
3. **Regla de oro**: la matemática de reparto debe ser UNA sola, compartida o espejada
   con tests entre contrato (USDC) y backend (puntos). Divergencia = usuarios estafados.
4. La wallet embebida + depósito fiat (onramp) recién se integran en la fase USDC.

### Bonus relámpago (incentivo al creador — implementado en prototipo)
- En relámpagos, la plataforma CEDE 2pp de su comisión al creador (`FLASH_REBATE_BPS`=200):
  creador cobra efectivamente su fee + 2pp; BARDOOO cobra SOLO 1% en relámpagos.
  Es un dial de crecimiento: puede ajustarse (o cederse entero) en el lanzamiento.
  Edge case a decidir en contrato: con creatorFee=0, el creador igual cobra 2/3 de
  la comisión de plataforma en flash — ¿deseado o poner piso?
- Ventana de apuestas: stepper −5/+5 (5 a 60 min, default 15). Un solo control.
- Deadline de resolución FIJO: cierre + 30 min. Sin resultado → anulación y devolución.
  Ej.: lanzada 15:00 con 15 min → cierra 15:15 → resolver antes de 15:45.
- ESPEJO AUTOMÁTICO: toda apuesta creada por un usuario con wallet sale en USDC Y
  en puntos (dos pozos GEMELOS y SEPARADOS, jamás mezclados) — así toda la audiencia
  juega el mismo duelo. Sin wallet: solo puntos. Backend: resolver la de USDC debe
  resolver automáticamente su espejo de puntos. Futuro: opción de opt-out del espejo.
- REGLA INVIOLABLE: el total descontado del pozo NO cambia — el apostador paga
  exactamente lo mismo en relámpago que en anticipada. El incentivo lo financia la
  plataforma (margen), nunca la experiencia del apostador. No convertir esto en
  "el relámpago cobra más comisión total": mataría la confianza en el producto estrella.
- Anti-spam inherente: relámpagos sin contraparte se anulan sin comisión, así que
  disparar relámpagos basura no genera ingresos.
- Implicancia de contrato (fase USDC): la factory necesita distinguir el tipo
  (ej. `flashPlatformFeeBps` aparte, o flag `isFlash` en Config que ajuste el split
  en `withdrawFees`). En la fase puntos es solo config de backend.
- Comisión del creador en el relámpago: hoy fija en 7% (sin control en el modal).
  Mejora candidata: chips 0/7/10 con memoria de la última elección del creador.

### Apuestas privadas por link (implementado en prototipo)
- Toggle Pública/Privada en relámpago y modo completo. Las privadas NO aparecen en
  la Arena ni las toca la actividad pública: solo entra quien tiene el link
  (bardooo.app/bet/{id}). Entrada: "Abrir con link" en la Arena (deep link en la app real).
- Con wallet + espejo: los DOS gemelos (USDC y pts) heredan la privacidad.
- HONESTIDAD TÉCNICA: "privada" = NO LISTADA (como video oculto de YouTube), no
  secreta. On-chain todo es públicamente inspeccionable; la privacidad es de
  descubrimiento a nivel app/backend, no criptográfica. No prometer secreto al usuario.
- Código de acceso OPCIONAL por apuesta privada: gate al entrar por link (verificación
  case-insensitive). En la app real se valida SERVER-SIDE (nunca mandar el código al
  cliente para comparar). Es fricción social, no seguridad criptográfica.
- El creador de una privada ve una tarjeta de share protagonista en el detalle:
  link visible + chip del código + botón grande de copiar (el mensaje incluye el código).
- Backend real: el flag de visibilidad y el código viven en la DB/indexer; el contrato no cambia.

### Onramp: cómo el usuario consigue USDC (fase dinero real)
El sheet "Cargar USDC" debe ofrecer DOS caminos:
1. **Comprar con tarjeta** (onramp embebido vía el proveedor de wallet — Privy integra
   MoonPay/Transak/etc.): rápido, sin salir de la app; fees 3-6%, KYC del proveedor,
   aceptación de tarjetas irregular en UY/AR.
2. **"Ya tenés cripto: depositá"**: dirección + QR + aviso GRANDE "solo USDC por red
   Polygon". Público rioplatense usa Binance/Bybit/OKX (UY, vía transferencia BROU/
   Itaú/etc.) o Lemon/Ripio/Buenbit/SatoshiTango y Binance P2P (AR). Detección de
   depósito vía indexer → acreditar y notificar en la app.
Detalles críticos:
- USDT >> USDC en la región: alguien VA a mandar USDT. Decidir: aceptar+swap
  automático, o detectar y avisar. Nunca ignorar (soporte y plata "perdida").
- Polygon: usar USDC NATIVO (no USDC.e) en el deploy y decirlo en el aviso.
- Gasless (ERC-2771) ya resuelve el segundo muro: el usuario solo necesita USDC,
  jamás POL. Comunicarlo ("el gas lo paga BARDOOO").
- AML/KYC propios de BARDOOO en fase dinero real: tema del abogado, no solo del onramp.

### Perfil de usuario e identicon (implementado en prototipo)
- Cada usuario tiene nombre editable + handle (@nombre) + su ICONO propio: un
  "bicho BARDOOO" — un sprite PIXEL-ART (grilla 12x12 espejada, SVG crispEdges)
  generado determinísticamente de su semilla (hash de la wallet si tiene, sino del
  handle): silueta al azar simétrica, ojos con pupilas, boca (3), antenas/orejas/
  cuernos y paleta propia. Estética 8-bit coherente con La Ficha y el chiptune.
  Mismo usuario = mismo bicho en cualquier dispositivo, sin subir imágenes (cero
  moderación en fase 1). Avatares de creadores en cartas usan el mismo sistema.
  El anillo partido queda EXCLUSIVO de la marca (logo, puntos, La Ficha).
- Tarjeta de perfil en "Mías": anillo grande, nombre editable inline, dirección de
  wallet acortada con copiar (cuando está activa).
- Backend real: username ÚNICO en DB (validar colisiones), handle inmutable o con
  historial, identicon seed = dirección de la wallet embebida (estable). Subida de
  foto de perfil = fase posterior, requiere moderación de imágenes.
