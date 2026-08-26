// ==========================================================
// FAZ 4A — Bölüm 7: "Aynı anda yalnızca bir isDefault=true adres bulunmalı,
// bunu yalnızca frontend ile değil server-side garanti altına al."
//
// Bu dosya, "hangi adreslerin isDefault=false'a çekilmesi gerekiyor" kararını
// saf (DB'siz) bir fonksiyona ayırıyor — gerçek uygulama (transaction içinde
// updateMany) src/app/api/account/addresses/route.ts ve [id]/route.ts'te.
// Ayrım, price-sort.ts'teki "saf karar + ince DB katmanı" deseniyle tutarlı.
// ==========================================================

export interface AddressDefaultRef {
  id: string;
  isDefault: boolean;
}

/**
 * `keepId` dışında, şu an isDefault=true olan adreslerin id listesini döner
 * — bunlar transaction içinde isDefault=false'a çekilmeli. `keepId` zaten
 * tek başına default ise (veya listede yoksa) boş dizi döner (gereksiz
 * update yok).
 */
export function idsToUnsetDefault(addresses: AddressDefaultRef[], keepId: string): string[] {
  return addresses.filter((a) => a.id !== keepId && a.isDefault).map((a) => a.id);
}

/**
 * Bölüm 7 — bir kullanıcının HİÇ adresi yoksa, eklenen ilk adres girdide ne
 * denirse densin otomatik varsayılan olmalı (aksi halde kullanıcı hiçbir
 * default'u olmayan bir hesapla kalabilir — kötü UX ve Bölüm 22/23'teki
 * "sepet/checkout adres seçimi" için belirsiz durum yaratır).
 */
export function shouldForceDefault(existingAddressCount: number, requestedIsDefault: boolean | undefined): boolean {
  return existingAddressCount === 0 || requestedIsDefault === true;
}

/**
 * Bölüm 7 — bir adres SİLİNDİĞİNDE, eğer silinen adres default'sa ve başka
 * adres kaldıysa, "hiç default'u olmayan bir hesap" durumuna düşmemesi için
 * kalan adreslerden EN YENİ oluşturulanı (createdAt DESC ilk eleman)
 * otomatik default yapılır. Çağıran, `remaining`i zaten createdAt DESC
 * sıralı vermeli (bkz. route — Prisma orderBy).
 */
export function pickPromotedDefaultId(remaining: { id: string }[]): string | null {
  return remaining.length > 0 ? remaining[0].id : null;
}
