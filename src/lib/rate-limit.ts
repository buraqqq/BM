import { prisma } from "@/lib/prisma";

const MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
const WINDOW_MINUTES = Number(process.env.LOGIN_WINDOW_MINUTES ?? 15);

/**
 * Bölüm 21 — Brute-force koruması.
 * DB tabanlı (in-memory değil), böylece birden fazla süreç/instance arasında
 * da tutarlı çalışır. Aynı e-posta için son WINDOW_MINUTES içindeki başarısız
 * girişimleri sayar; MAX_ATTEMPTS'i aşarsa girişi reddeder.
 */
export async function isLoginRateLimited(email: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  const failedCount = await prisma.loginAttempt.count({
    where: { email: email.toLowerCase(), success: false, createdAt: { gte: since } },
  });
  return failedCount >= MAX_ATTEMPTS;
}

export async function recordLoginAttempt(params: {
  email: string;
  success: boolean;
  ipAddress: string | null;
  adminUserId?: string | null;
}) {
  await prisma.loginAttempt.create({
    data: {
      email: params.email.toLowerCase(),
      success: params.success,
      ipAddress: params.ipAddress,
      adminUserId: params.adminUserId ?? null,
    },
  });
}
