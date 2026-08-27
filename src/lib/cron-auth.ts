import { timingSafeEqual } from "crypto";

// ==========================================================
// FAZ 13 — Cron / servis-token doğrulaması.
//
// Harici cron servisleri (GitHub Actions, Vercel Cron, Netlify Scheduled
// Functions, uptime-ping) korumalı /api/cron/* uçlarına
// `Authorization: Bearer <CRON_SECRET>` başlığıyla istek atar. Bu saf fonksiyon
// o başlığı güvenli biçimde doğrular.
//
// GÜVENLİK:
// - CRON_SECRET env'i AYARLANMAMIŞSA her zaman false döner (fail-closed):
//   çağıran route 503 ile yanıt verir, açıkta bir cron ucu bırakılmaz.
// - Karşılaştırma `crypto.timingSafeEqual` ile yapılır (zamanlama saldırısına
//   karşı). Uzunluk farklıysa sabit false — timingSafeEqual farklı uzunlukta
//   buffer'larda throw ettiği için önce uzunluk kontrolü yapılır.
// ==========================================================

/** `Authorization: Bearer <token>` başlığındaki token'ı CRON_SECRET ile
 *  zamanlama-güvenli karşılaştırır. secret/token eksikse veya eşleşmezse false. */
export function verifyCronSecret(token: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length === 0) return false;
  if (!token) return false;

  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
