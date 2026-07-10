import { useCallback, useEffect } from "react";
import {
  useAccount, useSignMessage, useSignTypedData,
  useWriteContract, useReadContract, usePublicClient,
} from "wagmi";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { decodeEventLog, encodeFunctionData, parseSignature } from "viem";
import { AMOY, BET_FACTORY_ABI, BET_ABI, MOCK_USDC_ABI, FORWARDER_ABI } from "@bardooo/core";

/* ===========================================================================
   ChainBettingService — fase 4: wallet invisible + gasless.
   - Las wallets vienen de PRIVY: la embebida (nace del login, sin extensión ni
     frase semilla) o una externa (MetaMask). Ambas entran a wagmi igual.
   - Con el relayer prendido, el usuario solo FIRMA (permit EIP-2612 + meta-tx
     ERC-2771) y BARDOOO paga el gas. Sin relayer, fallback a tx directas.
   - Trampas cubiertas: approve exacto / permit, ms ÷ 1000, parseUnits(x, 6).
=========================================================================== */

const MODES = { fixed: 0, free: 1, capped: 2 }; // enum StakeMode del contrato
const toMicro = (x) => BigInt(Math.round(Number(x) * 1e6));
const nowSec = () => Math.floor(Date.now() / 1000);

const FORWARD_REQUEST_TYPES = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
    { name: "data", type: "bytes" },
  ],
};

const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

export function useChainBetting({ me, onStatus, gasless }) {
  const { address, isConnected, chainId } = useAccount();
  const { createWallet, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  /* apenas hay una wallet de Privy (recién creada o conectada), se vuelve la
     activa de wagmi — la embebida tiene prioridad (es LA wallet BARDOOO) */
  useEffect(() => {
    if (address || wallets.length === 0) return;
    const embedded = wallets.find((w) => w.walletClientType === "privy");
    setActiveWallet(embedded ?? wallets[0]);
  }, [address, wallets, setActiveWallet]);

  const { data: balMicro, refetch: refetchBalance } = useReadContract({
    address: AMOY.usdc,
    abi: MOCK_USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const linked = !!me?.walletAddr && !!address && me.walletAddr.toLowerCase() === address.toLowerCase();
  const balance = balMicro !== undefined ? Number(balMicro) / 1e6 : 0;
  const isEmbedded = wallets.some((w) => w.walletClientType === "privy" && w.address?.toLowerCase() === address?.toLowerCase());
  const gaslessOn = !!gasless?.enabled && !!AMOY.forwarder;

  /* ---- alta de wallet: embebida (recomendada) o externa ---- */
  const createEmbedded = useCallback(async () => {
    await createWallet(); // Privy la crea desde la sesión: sin extensión ni seed visible
  }, [createWallet]);

  const connectExternal = useCallback(async () => {
    connectWallet(); // modal de Privy para MetaMask y compañía
  }, [connectWallet]);

  /* ---- tx directa (con gas del usuario) — fallback sin relayer ---- */
  const tx = useCallback(async (params, label) => {
    onStatus?.(label ?? "Firmá en tu wallet…");
    const hash = await writeContractAsync({ ...params, chainId: AMOY.chainId });
    onStatus?.("Confirmando en la cadena…");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    refetchBalance();
    return receipt;
  }, [writeContractAsync, publicClient, onStatus, refetchBalance]);

  /* ---- meta-tx (fase 4): el usuario firma, BARDOOO paga el gas ---- */
  const gaslessTx = useCallback(async (to, data, gasLimit, label) => {
    onStatus?.(label ?? "Firmá (sin gas)…");
    const nonce = await publicClient.readContract({
      address: AMOY.forwarder, abi: FORWARDER_ABI, functionName: "nonces", args: [address],
    });
    const deadline = nowSec() + 3600;
    const signature = await signTypedDataAsync({
      domain: { name: "BardoooForwarder", version: "1", chainId: AMOY.chainId, verifyingContract: AMOY.forwarder },
      types: FORWARD_REQUEST_TYPES,
      primaryType: "ForwardRequest",
      message: { from: address, to, value: 0n, gas: BigInt(gasLimit), nonce, deadline, data },
    });
    onStatus?.("BARDOOO está pagando el gas…");
    const r = await gasless.relay({
      from: address, to, value: "0", gas: String(gasLimit), deadline, data, signature,
    });
    if (r.status !== "success") throw new Error("La transacción sin gas falló");
    refetchBalance();
    return r;
  }, [address, publicClient, signTypedDataAsync, gasless, onStatus, refetchBalance]);

  /* ---- permit EIP-2612: aprobar USDC con una firma (sin tx) ---- */
  const signPermit = useCallback(async (spender, micro, deadline) => {
    const nonce = await publicClient.readContract({
      address: AMOY.usdc, abi: MOCK_USDC_ABI, functionName: "nonces", args: [address],
    });
    const sig = await signTypedDataAsync({
      domain: { name: "Mock USDC", version: "1", chainId: AMOY.chainId, verifyingContract: AMOY.usdc },
      types: PERMIT_TYPES,
      primaryType: "Permit",
      message: { owner: address, spender, value: micro, nonce, deadline: BigInt(deadline) },
    });
    const { r, s, v, yParity } = parseSignature(sig);
    return { v: Number(v ?? (yParity === 0 ? 27 : 28)), r, s };
  }, [address, publicClient, signTypedDataAsync]);

  /* ---- vincular wallet ↔ cuenta (el server verifica la firma) ---- */
  const signLink = useCallback(async () => {
    const message = `BARDOOO: vinculo la wallet ${address.toLowerCase()} a mi cuenta ${me.handle}`;
    const signature = await signMessageAsync({ message });
    return { address, signature };
  }, [address, me, signMessageAsync]);

  /* ---- faucet: si hay relayer, mintea el SERVER (cero gas, cero POL) ---- */
  const faucet = useCallback(async () => {
    if (gasless?.faucetServer) {
      try {
        onStatus?.("Cargando saldo de prueba…");
        await gasless.faucetServer(address);
        refetchBalance();
        return;
      } catch (e) {
        if (!isConnected) throw e; // sin fallback posible
      }
    }
    await tx({
      address: AMOY.usdc, abi: MOCK_USDC_ABI, functionName: "mint",
      args: [address, 500_000_000n],
    }, "Firmá el mint de prueba…");
  }, [address, gasless, isConnected, tx, onStatus, refetchBalance]);

  /* ---- apostar ---- */
  const placeBet = useCallback(async (chainAddress, option, amount) => {
    const micro = toMicro(amount);
    if (gaslessOn) {
      try {
        const deadline = nowSec() + 3600;
        onStatus?.("Firma 1 de 2: el permiso del USDC…");
        const { v, r, s } = await signPermit(chainAddress, micro, deadline);
        const data = encodeFunctionData({
          abi: BET_ABI, functionName: "placeBetWithPermit",
          args: [option, micro, BigInt(deadline), v, r, s],
        });
        await gaslessTx(chainAddress, data, 600_000, "Firma 2 de 2: la apuesta…");
        return;
      } catch (e) {
        if (e?.code !== "RELAY_BUSY") throw e; // el fusible saltó → tx directa
        onStatus?.("Modo sin gas saturado: va con tu gas…");
      }
    }
    await tx({
      address: AMOY.usdc, abi: MOCK_USDC_ABI, functionName: "approve",
      args: [chainAddress, micro],
    }, "Paso 1 de 2: aprobá el USDC…");
    await tx({
      address: chainAddress, abi: BET_ABI, functionName: "placeBet",
      args: [option, micro],
    }, "Paso 2 de 2: confirmá la apuesta…");
  }, [gaslessOn, signPermit, gaslessTx, tx, onStatus]);

  /* ---- crear por la factory ---- */
  const createBet = useCallback(async (form) => {
    const closeTime = form.relampago
      ? nowSec() + Math.trunc(form.windowMin) * 60
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

    if (gaslessOn) {
      try {
        const data = encodeFunctionData({ abi: BET_FACTORY_ABI, functionName: "createBet", args: [cfg] });
        await gaslessTx(AMOY.betFactory, data, 2_500_000, "Firmá el lanzamiento (sin gas)…");
        return null; // el indexer lo materializa en segundos
      } catch (e) {
        if (e?.code !== "RELAY_BUSY") throw e; // el fusible saltó → tx directa
        onStatus?.("Modo sin gas saturado: va con tu gas…");
      }
    }
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
  }, [gaslessOn, gaslessTx, tx]);

  const simpleCall = useCallback(async (chainAddress, fn, args, label) => {
    if (gaslessOn) {
      try {
        const data = encodeFunctionData({ abi: BET_ABI, functionName: fn, args });
        await gaslessTx(chainAddress, data, 400_000, label + " (sin gas)…");
        return;
      } catch (e) {
        if (e?.code !== "RELAY_BUSY") throw e; // el fusible saltó → tx directa
        onStatus?.("Modo sin gas saturado: va con tu gas…");
      }
    }
    await tx({ address: chainAddress, abi: BET_ABI, functionName: fn, args }, label + "…");
  }, [gaslessOn, gaslessTx, tx, onStatus]);

  const resolve = useCallback((a, option) => simpleCall(a, "resolve", [option], "Firmá el resultado"), [simpleCall]);
  const claim = useCallback((a) => simpleCall(a, "claim", [], "Firmá el cobro"), [simpleCall]);
  const refund = useCallback((a) => simpleCall(a, "refund", [], "Firmá la devolución"), [simpleCall]);

  return {
    address, isConnected, chainId, linked, balance, isEmbedded, gaslessOn,
    createEmbedded, connectExternal, signLink, faucet,
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
