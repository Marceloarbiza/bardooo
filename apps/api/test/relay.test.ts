/*  Tests de los CANDADOS del relayer (fase 4): la plataforma paga el gas,
    así que el endpoint valida duro qué se puede relayear: solo nuestra
    factory y Bets conocidos, solo funciones del set permitido, sin value,
    gas acotado. Sin cadena: se testea la validación pura + DB.              */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encodeFunctionData } from "viem";
import { AMOY, BET_FACTORY_ABI, BET_ABI, MOCK_USDC_ABI } from "@bardooo/core";
import { prisma } from "../src/db";
import { validateRelayRequest } from "../src/relay";

const BET_ADDR = "0x1111111111111111111111111111111111111111";
const base = {
  from: "0x27E16bEF25fB93E393B8D60C589CA518229C0A0c",
  value: "0",
  gas: "500000",
  deadline: Math.floor(Date.now() / 1000) + 3600,
  signature: "0x" + "ab".repeat(65),
};

beforeAll(async () => {
  await prisma.chainEvent.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.flight.deleteMany();
  await prisma.pointsLedger.deleteMany();
  await prisma.stake.deleteMany();
  await prisma.bet.deleteMany();
  await prisma.user.deleteMany();

  const u = await prisma.user.create({
    data: { privyId: "test:relay", name: "r", handle: "@relay" },
  });
  await prisma.bet.create({
    data: {
      creatorId: u.id, question: "¿Relay?", currency: "usdc", stakeMode: "free",
      minStake: 5_000_000, creatorBps: 700,
      closeTime: new Date(Date.now() + 60000), resolveTime: new Date(Date.now() + 120000),
      chainAddress: BET_ADDR,
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const placeBetData = encodeFunctionData({ abi: BET_ABI, functionName: "placeBet", args: [1, 5_000_000n] });
const createBetData = encodeFunctionData({
  abi: BET_FACTORY_ABI, functionName: "createBet",
  args: [{
    description: "x", numOptions: 2, stakeMode: 1, fixedAmount: 0n, maxStake: 0n,
    minStake: 5_000_000n, maxBettors: 0n,
    closeTime: BigInt(Math.floor(Date.now() / 1000) + 600),
    resolveTime: BigInt(Math.floor(Date.now() / 1000) + 601),
    isFlash: false,
  }],
});

describe("candados del relayer", () => {
  it("createBet hacia la factory: pasa", async () => {
    await expect(validateRelayRequest({ ...base, to: AMOY.betFactory, data: createBetData })).resolves.toBeUndefined();
  });

  it("placeBet hacia un Bet conocido: pasa", async () => {
    await expect(validateRelayRequest({ ...base, to: BET_ADDR, data: placeBetData })).resolves.toBeUndefined();
  });

  it("destino desconocido: rechazado", async () => {
    await expect(validateRelayRequest({
      ...base, to: "0x2222222222222222222222222222222222222222", data: placeBetData,
    })).rejects.toMatchObject({ code: "RELAY_TO" });
  });

  it("función fuera del set (mint del USDC): rechazada aunque el destino sea un Bet", async () => {
    const mintData = encodeFunctionData({ abi: MOCK_USDC_ABI, functionName: "mint", args: [base.from, 1n] });
    await expect(validateRelayRequest({ ...base, to: BET_ADDR, data: mintData }))
      .rejects.toMatchObject({ code: "RELAY_FN" });
  });

  it("placeBet hacia la factory: rechazado (selector no permitido ahí)", async () => {
    await expect(validateRelayRequest({ ...base, to: AMOY.betFactory, data: placeBetData }))
      .rejects.toMatchObject({ code: "RELAY_FN" });
  });

  it("con value: rechazado", async () => {
    await expect(validateRelayRequest({ ...base, to: BET_ADDR, data: placeBetData, value: "1" }))
      .rejects.toMatchObject({ code: "RELAY_VALUE" });
  });

  it("gas desmedido: rechazado", async () => {
    await expect(validateRelayRequest({ ...base, to: BET_ADDR, data: placeBetData, gas: "5000000" }))
      .rejects.toMatchObject({ code: "RELAY_GAS" });
  });
});
