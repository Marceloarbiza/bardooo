# BARDOOO — apuestas P2P parimutuel (Polygon)

Plataforma de apuestas peer-to-peer: cualquiera crea una apuesta SÍ/NO, la gente
apuesta a un lado, y el pozo perdedor se reparte entre los ganadores. Comisión para
el creador (tope 10%) y la plataforma (3%), sobre el total pero topeada al pozo
perdedor (un ganador nunca cobra menos que su stake).

**Leé `CLAUDE.md` y `PLAN.md` primero**: tienen el contexto completo, las decisiones
de diseño bloqueadas, el estado actual y el plan por fases. `docs/INTEGRATION.md`
tiene la guía de cableado frontend ↔ contratos.

## Quick start (app — fase 1)

```bash
# Node >= 20 y pnpm (corepack enable && corepack prepare pnpm@latest --activate)
pnpm install
pnpm test    # tests de packages/core (espejo del contrato) — deben estar en verde
pnpm dev     # levanta apps/web en http://localhost:5173
```

## Quick start (contratos)

```bash
# 1. Foundry (https://getfoundry.sh)
curl -L https://foundry.paradigm.xyz | bash && foundryup

# 2. Dependencias
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts --no-commit

# 3. Tests (deben pasar TODOS antes de seguir)
forge test -vvv

# 4. Deploy a Amoy (completar .env a partir de .env.example, cargar POL de faucet)
forge script script/Deploy.s.sol --rpc-url amoy --broadcast
```

## Contenido

- `apps/web/` — la app (Vite + React, mobile-first), componentes separados, con la
  blockchain simulada detrás de la interfaz `BettingService`
  (`src/services/BettingService.ts`). En fases 2-3 se enchufan API y on-chain sin
  tocar componentes.
- `apps/api/` — placeholder: backend de puntos (Fastify + Prisma), nace en fase 2.
- `packages/core/` — LA matemática del reparto (comisión topeada, payout
  proporcional, split de fees) en enteros de 6 decimales (bigint), espejo exacto de
  `P2PBetting.sol`, testeada contra los números de `test/Bet.t.sol`.
- `contracts/P2PBetting.sol` — `BetFactory` (se despliega 1 vez) + `Bet` (1 por
  apuesta, lo crea la factory vía `createBet`). ERC-2771 listo para gasless.
- `contracts/MockUSDC.sol` — USDC de prueba (6 decimales, mint abierto). SOLO testnet.
- `test/Bet.t.sol` — suite completa: reparto exacto, tope de comisión, regla de un
  solo lado, modos de stake, tiempos, anulación, cancelación, válvula de gracia,
  claim/refund, fees, y fuzz on-chain de solvencia.
- `script/Deploy.s.sol` — deploy de MockUSDC + BetFactory a Amoy.
- `frontend/BardoApp.jsx` — el prototipo original en un solo archivo (REFERENCIA
  histórica: ya está migrado a `apps/web`, no editar acá).

## Deploy (fase puntos)

- **API → Railway** (`railway.json` en la raíz): servicio Node + plugin Postgres.
  Variables: `BARDOOO_DATABASE_URL` (referencia al Postgres del proyecto),
  `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `CORS_ORIGIN` (URL del front).
  El start corre `prisma db push` (idempotente) antes de levantar.
- **Front → Vercel** (`vercel.json` en la raíz, deploy desde la raíz del repo):
  variables `VITE_PRIVY_APP_ID` y `VITE_API_URL` (URL pública de la API).
- **Privy**: agregar el dominio del front a los allowed origins de la app.

## Administración y disputas (fase beta)

Mientras no exista la ventana de disputa on-chain, **el arbitraje es manual**
(este es el "plan de arbitraje documentado" del checklist pre-mainnet):

1. Un usuario reporta un duelo mal resuelto → revisás con `pnpm admin bet <id>`
   (en `apps/api`; contra prod, exportar `BARDOOO_DATABASE_URL` con la
   `DATABASE_PUBLIC_URL` del Postgres de Railway).
2. Duelos de PUNTOS: `pnpm admin cancel <id> "motivo"` anula con devolución
   completa; `pnpm admin points @handle <delta> "motivo"` corrige saldos
   (todo queda auditado en el ledger con motivo).
3. Duelos USDC: la corrección es on-chain (cancel del creador o forceRefund
   tras el grace de 4 h) — el server nunca puede tocar fondos de la cadena.
4. Métricas del embudo: `pnpm admin funnel`.

## Deploys

Manuales por CLI: `railway up --service api --detach` (API) y
`vercel deploy --prod --yes` (front), ambos desde la raíz. Para deploy
automático en cada push: conectar el repo de GitHub desde los dashboards de
Railway (Settings → Source) y Vercel (Settings → Git) — requiere autorizar
la app de GitHub una sola vez.

## Seguridad

Código NO auditado. Solo testnet. Antes de cualquier mainnet con dinero real:
auditoría profesional del contrato y asesoría legal sobre plataformas de apuestas
en la jurisdicción correspondiente.
