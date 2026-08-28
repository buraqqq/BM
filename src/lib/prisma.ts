import { PrismaClient } from "@prisma/client";

// Next.js dev modunda hot-reload sırasında birden fazla PrismaClient
// örneği oluşmasını önlemek için global cache kullanılır.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Vercel serverless + Supabase: transaction pooler (6543) bağlantıları
// PgBouncer üzerinden çoğullar ve eşzamanlı isteklerde Supabase bağlantı
// limitinin tükenmesini (aralıklı 500'ler) önler. POOLED_DATABASE_URL
// tanımlı değilse session pooler'a (DATABASE_URL) düşülür — böylece yeni
// env değeri eklenmeden de deploy çalışmaya devam eder.
const datasourceUrl = process.env.POOLED_DATABASE_URL || process.env.DATABASE_URL || "";

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: datasourceUrl,
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
