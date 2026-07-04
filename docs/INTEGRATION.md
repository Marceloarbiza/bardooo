# Integración frontend ↔ contratos (wagmi/viem)

Objetivo: `frontend/BardoApp.jsx` ya tiene TODA la UI y la lógica de producto
funcionando contra una capa blockchain simulada en estado de React. La migración
consiste en reemplazar ESA capa por llamadas reales, sin tocar el diseño.

## Setup del proyecto

```bash
npm create vite@latest bardo-app -- --template react
cd bardo-app
npm i wagmi viem @tanstack/react-query @rainbow-me/rainbowkit lucide-react
```

Config de chain: Polygon Amoy (chainId 80002, RPC https://rpc-amoy.polygon.technology,
explorer https://amoy.polygonscan.com). Crear `src/config.ts` con las direcciones
que imprime el script de deploy:

```ts
export const FACTORY_ADDRESS = "0x...";
export const USDC_ADDRESS    = "0x...";
```

ABIs: tras `forge build`, copiar `abi` desde `out/P2PBetting.sol/BetFactory.json`,
`out/P2PBetting.sol/Bet.json` y `out/MockUSDC.sol/MockUSDC.json` a `src/abi/`.

## Mapa de reemplazos (mock → real)

La capa simulada vive en el componente `App` de `BardoApp.jsx`. Cada función tiene
su equivalente on-chain:

| Mock (React state)          | Real (contrato)                                          |
|-----------------------------|----------------------------------------------------------|
| `connected` / `setConnected`| RainbowKit `ConnectButton` + `useAccount()`               |
| `balance`                   | `useReadContract` → `usdc.balanceOf(address)`             |
| `bets` (array seed)         | `factory.totalBets()` + `factory.allBets(i)` + multicall de vistas de cada Bet (`config`, `poolByOption(0/1)`, `status`, `winningOption`, `totalBettors`, `stakeOf(user,0/1)`, `settled(user)`) |
| `placeBet(id, option, amt)` | `usdc.approve(bet, amt)` y luego `bet.placeBet(option, amt)` |
| `createBet(form)`           | `factory.createBet(cfg)`                                  |
| `resolve(id, option)`       | `bet.resolve(option)` (y ofrecer `withdrawFees()` después) |
| `claim(id)`                 | `bet.claim()` — y `bet.refund()` si `status = Cancelled`   |

Refresco de UI: suscribirse con `useWatchContractEvent` a `BetCreated` (factory) y
`BetPlaced` / `Resolved` / `Cancelled` / `Claimed` (Bet activo) e invalidar queries.

## El struct Config en JS

Orden EXACTO (ver `Bet.Config` en el contrato):

```ts
const cfg = {
  description: form.question,
  numOptions: 2,
  stakeMode: { free: 1, fixed: 0, capped: 2 }[form.stakeMode], // enum: Fixed=0, Free=1, Capped=2
  fixedAmount: parseUnits(form.fixedAmount ?? "0", 6),
  maxStake:    parseUnits(form.maxStake ?? "0", 6),
  minStake:    parseUnits(form.minStake, 6),
  maxBettors:  BigInt(form.maxBettors),
  closeTime:   BigInt(Math.floor(form.closeTime / 1000)),   // ¡ms → segundos!
  resolveTime: BigInt(Math.floor(form.resolveTime / 1000)), // ¡ms → segundos!
  creatorFeeBps: form.creatorBps,
};
```

OJO: el enum en el JSX simulado usa strings ("free"/"fixed"/"capped"); el contrato
usa el enum StakeMode con Fixed=0, Free=1, Capped=2. No confundir el mapeo.

## Trampas (repetidas a propósito, son las que muerden)

1. **ms → segundos** en `closeTime`/`resolveTime` al escribir; **× 1000** al leer
   para los contadores de la UI.
2. **`PLATFORM_BPS`**: eliminar la constante del JSX; leer `factory.platformFeeBps()`
   una vez al cargar y pasarla por contexto/prop.
3. **Approve primero**: patrón de 2 transacciones. UX sugerida: un solo botón
   "Apostar" que primero manda `approve` (mostrando "Aprobando USDC… 1/2") y
   después `placeBet` ("Confirmando apuesta… 2/2"). Manejar rechazo en cada paso.
4. **Unidades**: `parseUnits(str, 6)` para escribir, `formatUnits(bigint, 6)` para
   mostrar. Nunca floats en montos que van al contrato.
5. **Estados de transacción**: cada acción necesita loading (`isPending` +
   `useWaitForTransactionReceipt`), éxito (toast existente) y error (toast "err"
   con mensaje corto; decodificar los custom errors del ABI para mensajes útiles,
   p. ej. `AlreadyOnOtherSide` → "Ya estás del lado del SÍ en esta apuesta").
6. **La regla de −5 min** del cierre se aplica en el front al armar `closeTime`
   (ya está implementada en la pantalla Crear del JSX; conservarla).
7. **Gasless**: fase 2. Mientras el forwarder sea address(0), los usuarios pagan
   su gas en POL de faucet. No bloquear la integración por esto.

## Checklist de aceptación

- [ ] Conectar MetaMask en Amoy y ver el saldo real de mUSDC en el header.
- [ ] Crear una apuesta desde la UI y verla aparecer (evento `BetCreated`).
- [ ] Apostar desde 2 cuentas distintas a lados opuestos (approve + placeBet).
- [ ] Intentar apostar al lado contrario → error legible (AlreadyOnOtherSide).
- [ ] Esperar/ajustar tiempos, resolver desde la cuenta creadora, `withdrawFees`.
- [ ] `claim()` del ganador actualiza saldo; doble claim da error legible.
- [ ] Botón de faucet/mint de mUSDC en la UI (solo testnet) para onboarding rápido.
