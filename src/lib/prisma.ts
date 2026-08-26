import { PrismaClient } from "@prisma/client";

// Next.js dev modunda hot-reload sırasında birden fazla PrismaClient
// örneği oluşmasını önlemek için global cache kullanılır.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
