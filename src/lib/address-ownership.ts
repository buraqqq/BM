import { prisma } from "@/lib/prisma";

// ==========================================================
// FAZ 4A — Bölüm 8 (IDOR savunması) + FAZ 4B — Bölüm 17 ("Adresin var olup
// olmadığını dışarı sızdırma... FAZ 4A'daki authorization desenini yeniden
// kullan").
//
// Bu fonksiyon FAZ 4A'da src/app/api/account/addresses/[id]/route.ts
// içinde PRIVATE olarak tanımlanmıştı. FAZ 4B'nin checkout doğrulama
// ucu AYNI kontrole ihtiyaç duyduğu için — ve "aynı business logic'i ikinci
// kez oluşturma" ana kuralı gereği — buraya, PAYLAŞILAN tek bir yere
// taşındı. Artık hem /api/account/addresses/[id] hem de
// /api/checkout/validate bu TEK fonksiyonu import ediyor.
//
// Desen: adres önce id'ye göre bulunur, SONRA `userId === callerUserId`
// kontrol edilir; eşleşmezse — adres hiç yoksa da, BAŞKASINA aitse de —
// AYNI `null` döner. Çağıran kod bunu her zaman TEK bir NOT_FOUND'a çevirir
// (403 değil) — "bu id var ama sana ait değil" ile "bu id hiç yok"
// arasındaki farkı dışarı sızdırmaz.
// ==========================================================
export async function findOwnedAddress(id: string, userId: string) {
  const address = await prisma.address.findUnique({ where: { id } });
  if (!address || address.userId !== userId) return null;
  return address;
}
