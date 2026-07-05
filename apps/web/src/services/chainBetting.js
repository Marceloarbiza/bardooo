import { useCallback } from "react";
import {
  useAccount, useConnect, useSwitchChain, useSignMessage,
  useWriteContract, useReadContract, usePublicClient,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { decodeEventLog } from "viem";
import { AMOY, BET_FACTORY_ABI, BET_ABI, MOCK_USDC_ABI } from "@bardooo/core";

/* ===========================================================================
   ChainBettingService (fase 3): las ESCRITURAS de los duelos usdc van directo
   a la cadena desde la wallet del usuario; las lecturas siguen saliendo de la
   API (el indexer refleja la cadena en la DB). Trampas cubiertas:
   - approve exacto antes de placeBet (USDC es ERC20)
   - el contrato usa SEGUNDOS: ms ÷ 1000 al escribir
   - montos en micro-unidades: parseUnits(x, 6)
   - onStatus() va contando los pasos (firmá → confirmando → listo)
=========================================================================== */

const MODES = { fixed: 0, free: 1, capped: 2 }; // enum StakeMode del contrato
const toMicro = (x) => BigInt(Math.round(Number(x) * 1e6));

export function useChainBetting({ me, onStatus }) {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const { data: balMicro, refetch: refetchBalance } = useReadContract({
    address: AMOY.usdc,
    abi: MOCK_USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const linked = !!me?.walletAddr && !!address && me.walletAddr.toLowerCase() === address.toLowerCase();
  const balance = balMicro !== undefined ? Number(balMicro) / 1e6 : 0;

  const connect = useCallback(async () => {
    if (!isConnected) await connectAsync({ connector: injected() });
  }, [isConnected, connectAsync]);

  const ensureChain = useCallback(async () => {
    if (chainId !== AMOY.chainId) await switchChainAsync({ chainId: AMOY.chainId });
  }, [chainId, switchChainAsync]);

  /* firma + espera de confirmación, contando los pasos en la UI */
  const tx = useCallback(async (params, label) => {
    onStatus?.(label ?? "Firmá en tu wallet…");
    const hash = await writeContractAsync(params);
    onStatus?.("Confirmando en la cadena…");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    refetchBalance();
    return receipt;
  }, [writeContractAsync, publicClient, onStatus, refetchBalance]);

  /* ---- firmar el vínculo wallet ↔ cuenta (el server verifica la firma) ---- */
  const signLink = useCallback(async () => {
    const message = `BARDOOO: vinculo la wallet ${address.toLowerCase()} a mi cuenta ${me.handle}`;
    const signature = await signMessageAsync({ message });
    return { address, signature };
  }, [address, me, signMessageAsync]);

  /* ---- faucet de testnet: 500 mUSDC de mentira ---- */
  const faucet = useCallback(async () => {
    await ensureChain();
    await tx({
      address: AMOY.usdc, abi: MOCK_USDC_ABI, functionName: "mint",
      args: [address, 500_000_000n],
    }, "Firmá el mint de prueba…");
  }, [address, ensureChain, tx]);

  /* ---- apostar: approve EXACTO y despues placeBet ---- */
  const placeBet = useCallback(async (chainAddress, option, amount) => {
    await ensureChain();
    const micro = toMicro(amount);
    await tx({
      address: AMOY.usdc, abi: MOCK_USDC_ABI, functionName: "approve",
      args: [chainAddress, micro],
    }, "Paso 1 de 2: aprobá el USDC…");
    await tx({
      address: chainAddress, abi: BET_ABI, functionName: "placeBet",
      args: [option, micro],
    }, "Paso 2 de 2: confirmá la apuesta…");
  }, [ensureChain, tx]);

  /* ---- crear por la factory; devuelve la address del Bet nuevo ---- */
  const createBet = useCallback(async (form) => {
    await ensureChain();
    const nowSec = Math.floor(Date.now() / 1000);
    const closeTime = form.relampago
      ? nowSec + Math.trunc(form.windowMin) * 60
      : Math.floor(form.closeTime / 1000); // ¡ms → segundos!
    const resolveTime = form.relampago ? closeTime + 1 : Math.floor(form.resolveTime / 1000);

    const cfg = {
      description: form.question,
      numOptions: 2,
      stakeMode: MODES[form.stakeMode] ?? 1,
      fixedAmount: form.stakeMode === "fixed" ? toMicro(form.fixedAmount) : 0n,
      maxStake: form.stakeMode === "capped" ? toMicro(form.maxStake) : 0n,
      minStake: toMicro(Math.max(form.minStake || 5, 1)),
      maxBettors: BigInt(form.maxBettors || 0),
      closeTime: BigInt(closeTime),
      resolveTime: BigInt(resolveTime),
      isFlash: !!form.relampago,
    };
    const receipt = await tx({
      address: AMOY.betFactory, abi: BET_FACTORY_ABI, functionName: "createBet",
      args: [cfg],
    }, "Firmá el lanzamiento del duelo…");

    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: BET_FACTORY_ABI, data: log.data, topics: log.topics });
        if (ev.eventName === "BetCreated") return ev.args.bet;
      } catch {}
    }
    return null;
  }, [ensureChain, tx]);

  const resolve = useCallback(async (chainAddress, option) => {
    await ensureChain();
    await tx({ address: chainAddress, abi: BET_ABI, functionName: "resolve", args: [option] },
      "Firmá el resultado…");
  }, [ensureChain, tx]);

  const claim = useCallback(async (chainAddress) => {
    await ensureChain();
    await tx({ address: chainAddress, abi: BET_ABI, functionName: "claim" },
      "Firmá el cobro…");
  }, [ensureChain, tx]);

  const refund = useCallback(async (chainAddress) => {
    await ensureChain();
    await tx({ address: chainAddress, abi: BET_ABI, functionName: "refund" },
      "Firmá la devolución…");
  }, [ensureChain, tx]);

  return {
    address, isConnected, linked, balance,
    connect, ensureChain, signLink, faucet,
    placeBet, createBet, resolve, claim, refund,
    refetchBalance,
  };
}

/** Mensaje humano para errores de wallet/cadena. */
export function chainErrorMsg(e) {
  const s = e?.shortMessage || e?.message || "";
  if (/reject|denied|cancel/i.test(s)) return "Cancelaste la firma en tu wallet";
  if (/CreatorCannotBet/.test(s)) return "Sos el juez de este duelo: no podés apostar en tu propio pozo";
  if (/AlreadyOnOtherSide/.test(s)) return "Ya estás del otro lado en esta apuesta";
  if (/BettingClosed/.test(s)) return "Las apuestas ya cerraron";
  if (/insufficient funds/i.test(s)) return "Te falta POL para el gas (testnet)";
  if (/transfer amount exceeds balance|ERC20InsufficientBalance/i.test(s)) return "No te alcanza el USDC";
  return s.slice(0, 120) || "Falló la transacción";
}
