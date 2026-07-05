import { createWalletClient, createPublicClient, http, getAddress, slice, defineChain } from "viem";
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

  const { wallet, pub } = clients();
  const hash = await wallet.writeContract({
    address: AMOY.forwarder as `0x${string}`,
    abi: FORWARDER_ABI,
    functionName: "execute",
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
