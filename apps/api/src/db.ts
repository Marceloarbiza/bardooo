import "dotenv/config";
import { PrismaClient } from "@prisma/client";

if (!process.env.BARDOOO_DATABASE_URL) {
  throw new Error("Falta BARDOOO_DATABASE_URL (ver apps/api/.env.example)");
}

export const prisma = new PrismaClient();

/** El tipo del cliente adentro de una transacción interactiva. */
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
