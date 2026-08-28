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

/**
 * Kayıt (registration) denemeleri için — aynı e-posta VEYA aynı IP ile kısa
 * sürede çok sayıda deneme yapılmasını engeller (hesap spam'i ve e-posta
 * keşfi/enumeration). Login'den farklı olarak BAŞARILI girişimleri de sayar:
 * kayıt yanıtı "bu e-posta zaten kayıtlı / kaydedildi" ayrımını sızdırdığı
 * için, keşfi sınırlamak amacıyla tüm denemeler sayılır.
 */
export async function isRegistrationRateLimited(email: string, ip: string | null): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  const byEmail = await prisma.loginAttempt.count({
    where: { email: email.toLowerCase(), createdAt: { gte: since } },
  });
  if (byEmail >= MAX_ATTEMPTS) return true;
  if (ip) {
    const byIp = await prisma.loginAttempt.count({
      where: { ipAddress: ip, createdAt: { gte: since } },
    });
    if (byIp >= MAX_ATTEMPTS) return true;
  }
  return false;
}

/**
 * Genel IP-tabanlı rate limit — belirli bir aksiyon (AuditLog.action) için
 * son window içindeki istek sayısını AuditLog üzerinden sayar. AI tasarım
 * gibi maliyetli/yoğun public uçlarda kötüye kullanımı (LLM maliyet DoS'i)
 * sınırlamak için kullanılır. IP yoksa (ör. yerel test) kısıtlama uygulanmaz.
 */
export async function isRateLimitedByAction(
  ip: string | null,
  action: string,
  max: number,
  windowMinutes: number
): Promise<boolean> {
  if (!ip) return false;
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);
  const count = await prisma.auditLog.count({
    where: { action, ipAddress: ip, createdAt: { gte: since } },
  });
  return count >= max;
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
