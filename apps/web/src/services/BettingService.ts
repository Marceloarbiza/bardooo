/*  BettingService — LA frontera entre la UI y "la cadena".
    En fase 1 la implementa el mock (useMockBettingService, estado React).
    En fase 2 se enchufa ApiBettingService (backend de puntos) y en fase 3
    ChainBettingService (wagmi/viem) SIN tocar los componentes: la UI solo
    conoce esta interfaz.                                                    */

export type Currency = "usdc" | "pts";
export type BetStatus = "open" | "locked" | "resolved" | "cancelled";
export type StakeMode = "free" | "fixed" | "capped";

export interface BetCreator {
  name: string;
  handle: string;
  hue?: string;
  mine?: boolean;
}

export interface Bet {
  id: number;
  creator: BetCreator;
  question: string;
  currency: Currency;
  pools: [number, number];          // [NO, SI] — mismo indexado que el contrato
  bettors: number;
  stakeMode: StakeMode;
  fixedAmount?: number;
  minStake: number;
  maxStake: number;
  maxBettors: number;
  creatorBps: number;
  closeTime: number;                // ms (¡el contrato usa segundos! ÷1000 en fase 3)
  resolveTime: number;              // ms
  status: BetStatus;
  winningOption: 0 | 1 | null;
  myStake: [number, number];
  claimed: boolean;
  isPrivate?: boolean;
  code?: string;                    // en la app real JAMÁS viaja al cliente (hash server-side)
  relampago?: boolean;
  launch?: number;
  deadline?: number;
  lastHit?: { side: 0 | 1; t: number };
}

export interface CreateBetForm {
  question: string;
  stakeMode: StakeMode;
  fixedAmount: number;
  maxStake: number;
  minStake: number;
  maxBettors: number;
  creatorBps: number;
  isPrivate: boolean;
  code: string;
  closeTime: number;
  resolveTime: number;
  relampago?: boolean;
  launch?: number;
  deadline?: number;
}

/** Contexto que el mock necesita para validar (en la app real lo valida el server/contrato). */
export interface PlaceBetCtx {
  walletOn: boolean;
  points: number;
  balance: number;
}

export type PlaceBetResult =
  | { ok: true; currency: Currency }
  | { ok: false; error: string; needWallet?: boolean }
  | null; // apuesta inexistente: silencio (igual que el prototipo)

export type ResolveResult =
  | { ok: true; cancelled: true }
  | { ok: true; cancelled: false; creatorCut: number; currency: Currency }
  | null;

export type ClaimResult =
  | { ok: true; pay: number; currency: Currency }
  | { ok: false; error: string }
  | null;

export type RefundResult = { ok: true; total: number; currency: Currency } | null;

export interface BettingService {
  bets: Bet[];
  list(): Bet[];
  placeBet(id: number, option: 0 | 1, amount: number, ctx: PlaceBetCtx): PlaceBetResult;
  createBet(form: CreateBetForm, creator: BetCreator, walletOn: boolean): number; // id de la apuesta activa
  resolve(id: number, option: 0 | 1): ResolveResult;
  claim(id: number): ClaimResult;
  refund(id: number): RefundResult;
  /** Apuesta de terceros (multitud simulada hoy; eventos BetPlaced mañana). */
  externalBet(id: number, side: 0 | 1, amount: number): void;
}
