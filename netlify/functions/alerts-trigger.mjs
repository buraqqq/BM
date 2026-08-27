// ==========================================================
// Netlify Scheduled Function — alarm taraması (FAZ 13).
//
// `checkAndTriggerAlerts()` uygulama içinde gerçek bir scheduler YOKTUR; bu
// background function her 15 dakikada bir korumalı `/api/cron/alerts` ucunu
// kimlik doğrulamalı olarak çağırır. CRON_SECRET env'i (Netlify UI → Environment
// variables) ayarlanmalıdır; `/api/cron/alerts` bu değeri `Authorization: Bearer`
// başlığında bekler (bkz. src/lib/cron-auth.ts + DEPLOYMENT.md Bölüm 5).
//
// Alternatif: Bu dosya yerine GitHub Actions / cron-job.org / uptime-ping ile
// aynı uca `Authorization: Bearer <CRON_SECRET>` başlığıyla GET isteği atılabilir.
// ==========================================================

export default async function handler() {
  const base = process.env.URL; // Netlify, site URL'ini URL env'inde sağlar
  const cronSecret = process.env.CRON_SECRET;

  if (!base || !cronSecret) {
    // eslint-disable-next-line no-console
    console.error("[alerts-trigger] URL veya CRON_SECRET env'i ayarlanmamış");
    return { statusCode: 500, body: "URL veya CRON_SECRET ayarlanmamış" };
  }

  const res = await fetch(`${base}/api/cron/alerts`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });

  const body = await res.text();
  // eslint-disable-next-line no-console
  console.log(`[alerts-trigger] HTTP ${res.status}: ${body}`);
  return { statusCode: res.status, body };
}

// Netlify Scheduled Function: her 15 dakikada bir çalışır.
export const config = {
  schedule: "*/15 * * * *",
};
