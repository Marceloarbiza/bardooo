import { createWalletClient, createPublicClient, http, getAddress, slice, concat, defineChain, decodeErrorResult } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AMOY, FORWARDER_ABI, MOCK_USDC_ABI, BET_FACTORY_ABI, BET_ABI } from "@bardooo/core";
import { toFunctionSelector } from "viem";
import { prisma } from "./db";
import { ApiError } from "./errors";

/*  RELAYER (fase 4): "el gas lo paga BARDOOO".
    El usuario firma un ForwardRequest (EIP-712); esto lo ejecuta en el
    ERC2771Forwarder pagando el gas con la wallet de plataforma. Candados:
    - destino SOLO nuestra factory o un Bet conocido en la DB
    - selector SOLO del set permitido (nada de llamadas arbitrarias)
    - value = 0 y gas acotado
    - rate limit por usuario en la ruta (server.ts)
    Es marketing con presupuesto: medir el gasto por apuesta (CLAUDE.md).      */

const amoyChain = defineChain({
  id: AMOY.chainId,
  name: "Polygon Amoy",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: { default: { http: [process.env.AMOY_RPC_URL ?? AMOY.rpcUrl] } },
});

const MAX_GAS = 3_000_000n; // createBet despliega un Bet entero (~1.6M); el resto usa mucho menos

// selectores permitidos por tipo de destino
const FACTORY_FNS = ["createBet"];
const BET_FNS = ["placeBet", "placeBetWithPermit", "resolve", "claim", "refund", "lockBetting", "cancel"];

function selectorsOf(abi: readonly any[], names: string[]): Set<string> {
  const set = new Set<string>();
  for (const item of abi) {
    if (item.type === "function" && names.includes(item.name)) {
      set.add(toFunctionSelector(item));
    }
  }
  return set;
}
const factorySelectors = selectorsOf(BET_FACTORY_ABI, FACTORY_FNS);
const betSelectors = selectorsOf(BET_ABI, BET_FNS);

export function relayEnabled() {
  return !!process.env.RELAYER_PRIVATE_KEY && !!AMOY.forwarder;
}

export interface ForwardRequestIn {
  from: string;
  to: string;
  value: string; // "0"
  gas: string;
  deadline: number;
  data: string;
  signature: string;
}

/** Valida el pedido contra los candados. Tira ApiError si no pasa. */
export async function validateRelayRequest(req: ForwardRequestIn) {
  if (BigInt(req.value || "0") !== 0n)
    throw new ApiError(400, "RELAY_VALUE", "Las meta-transacciones no llevan POL");
  if (BigInt(req.gas) > MAX_GAS)
    throw new ApiError(400, "RELAY_GAS", "Pedido de gas demasiado grande");
  if (!/^0x[0-9a-fA-F]{8,}$/.test(req.data))
    throw new ApiError(400, "RELAY_DATA", "Calldata inválida");

  const to = getAddress(req.to);
  const selector = slice(req.data as `0x${string}`, 0, 4);

  if (to === getAddress(AMOY.betFactory)) {
    if (!factorySelectors.has(selector))
      throw new ApiError(400, "RELAY_FN", "Esa función no se relayea");
    return;
  }
  const bet = await prisma.bet.findUnique({ where: { chainAddress: to } });
  if (!bet) throw new ApiError(400, "RELAY_TO", "Destino desconocido: solo contratos de BARDOOO");
  if (!betSelectors.has(selector))
    throw new ApiError(400, "RELAY_FN", "Esa función no se relayea");
}

/* Traducción de los reverts del contrato a mensajes humanos: sin esto, el
   forwarder responde FailedCall() pelado y el usuario ve un 500 críptico
   (pasó en producción: el creador apostando en su propio pozo).            */
const FRIENDLY_REVERTS: Record<string, string> = {
  CreatorCannotBet: "Sos el juez de este duelo: no podés apostar en tu propio pozo",
  AlreadyOnOtherSide: "Ya estás del otro lado en esta apuesta",
  BettingClosed: "Las apuestas ya cerraron",
  BadState: "La apuesta no está en un estado válido para eso",
  WrongAmount: "El monto no coincide con el fijo de esta apuesta",
  BelowMin: "No llegás al mínimo de esta apuesta",
  OverCap: "Superás el tope por persona",
  InvalidOption: "Esa opción no existe",
  TooEarly: "Todavía no se puede resolver: esperá al cierre",
  NothingToClaim: "No tenés premio para cobrar acá",
  AlreadySettled: "Ya cobraste en esta apuesta",
  GraceNotOver: "Todavía no pasó el plazo de gracia",
  ERC20InsufficientBalance: "No te alcanza el USDC: cargá el faucet en Activar",
  ERC20InsufficientAllowance: "El permiso del USDC no alcanzó: probá de nuevo",
};

function findRevertData(e: any): `0x${string}` | null {
  let cur = e;
  for (let i = 0; i < 8 && cur; i++) {
    const d = cur.data?.data ?? cur.data;
    if (typeof d === "string" && d.startsWith("0x") && d.length >= 10) return d as `0x${string}`;
    cur = cur.cause;
  }
  return null;
}

/** Simula la llamada INTERNA como la haría el forwarder (calldata + sender
 *  al final, msg.sender = forwarder). Si revierte, tira un 400 con el motivo
 *  humano en vez de dejar que execute() falle con FailedCall() → 500. */
async function simulateInnerCall(req: ForwardRequestIn) {
  const { pub } = clients();
  try {
    await pub.call({
      to: getAddress(req.to),
      data: concat([req.data as `0x${string}`, getAddress(req.from)]),
      account: AMOY.forwarder as `0x${string}`,
      gas: BigInt(req.gas),
    });
  } catch (e: any) {
    const raw = findRevertData(e);
    if (raw) {
      try {
        const dec = decodeErrorResult({
          abi: [...BET_ABI, ...BET_FACTORY_ABI, ...MOCK_USDC_ABI] as any,
          data: raw,
        });
        const msg = FRIENDLY_REVERTS[dec.errorName] ?? `El contrato rechazó la operación (${dec.errorName})`;
        throw new ApiError(400, "CHAIN_REVERT", msg);
      } catch (inner) {
        if (inner instanceof ApiError) throw inner;
      }
    }
    throw new ApiError(400, "CHAIN_REVERT", "El contrato rechazó la operación");
  }
}

function clients() {
  const account = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as `0x${string}`);
  const wallet = createWalletClient({ account, chain: amoyChain, transport: http(amoyChain.rpcUrls.default.http[0]) });
  const pub = createPublicClient({ chain: amoyChain, transport: http(amoyChain.rpcUrls.default.http[0]) });
  return { account, wallet, pub };
}

/** Ejecuta la meta-tx en el forwarder pagando el gas. Devuelve el txHash. */
export async function relayExecute(req: ForwardRequestIn) {
  if (!relayEnabled())
    throw new ApiError(503, "RELAY_OFF", "El modo sin gas todavía no está activado");
  await validateRelayRequest(req);
  await simulateInnerCall(req); // revert del contrato → 400 con motivo humano

  const { wallet, pub } = clients();
  const hash = await wallet.writeContract({
    address: AMOY.forwarder as `0x${string}`,
    abi: FORWARDER_ABI,
    functionName: "execute",
    // gas al piso de Amoy (25 gwei): cada wei de más sale del POL del relayer
    maxPriorityFeePerGas: 25_000_000_000n,
    maxFeePerGas: 25_100_000_000n,
    args: [{
      from: getAddress(req.from),
      to: getAddress(req.to),
      value: 0n,
      gas: BigInt(req.gas),
      deadline: Number(req.deadline),
      data: req.data as `0x${string}`,
      signature: req.signature as `0x${string}`,
    }],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status };
}

/** Faucet gasless de testnet: la plataforma mintea 500 mUSDC directo. */
export async function faucetMint(to: string) {
  if (!process.env.RELAYER_PRIVATE_KEY)
    throw new ApiError(503, "RELAY_OFF", "El faucet del server no está activado");
  const { wallet, pub } = clients();
  const hash = await wallet.writeContract({
    address: AMOY.usdc as `0x${string}`,
    abi: MOCK_USDC_ABI,
    functionName: "mint",
    args: [getAddress(to), 500_000_000n],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status };
}
