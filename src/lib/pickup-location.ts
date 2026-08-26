import { prisma } from "@/lib/prisma";

// ==========================================================
// FAZ 4B — Bölüm 7/29: "Gel-Al" (PICKUP) teslim alma noktası bilgisi.
//
// PickupLocationProvider soyutlaması: bu tek fonksiyon çağıranın (checkout
// route) tek bağımlılığı — ileride gerçek bir çoklu-şube sistemi eklenirse
// (ör. bir PickupLocation Prisma modeli) yalnızca BU dosyanın içi değişir,
// route.ts ve UI etkilenmez.
//
// Veri kaynağı: MEVCUT Setting tablosu, `contact_*` anahtarları — bunlar
// zaten FAZ 1'den beri gerçek işletme bilgisini tutuyor ve /api/settings
// public endpoint'i tarafından da kullanılıyor (bkz. o dosyanın PUBLIC_PREFIXES
// listesi). Burada YENİ bir "mağaza" veri kaynağı İCAT EDİLMEDİ, var olan
// gerçek veri yeniden okunuyor.
//
// "Tahmini hazırlık süresi" (Bölüm 7) için sistemde HİÇBİR gerçek veri
// (ayrı bir Setting anahtarı vb.) yok — bu tek alan için veri UYDURULMUYOR,
// bunun yerine görev tanımının kendi diliyle bir placeholder döndürülüyor.
// ==========================================================

export interface PickupLocationInfo {
  name: string;
  addressLine: string | null;
  phone: string | null;
  hours: string | null;
  mapsUrl: string | null;
  preparationTimeNote: string;
}

const SETTING_KEYS = ["site_name", "contact_address_line", "contact_phone", "contact_hours", "contact_maps_url"] as const;

export async function getPickupLocation(): Promise<PickupLocationInfo> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } });
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;

  const hasRealAddress = Boolean(map.contact_address_line);

  return {
    name: map.site_name ?? "B&M Vourla",
    addressLine: map.contact_address_line ?? null,
    phone: map.contact_phone ?? null,
    hours: map.contact_hours ?? null,
    mapsUrl: map.contact_maps_url ?? null,
    preparationTimeNote: hasRealAddress
      ? "Teslim alma noktası için tahmini hazırlık süresi bilgisi daha sonra yapılandırılacaktır."
      : "Teslim alma noktası bilgisi daha sonra yapılandırılacaktır.",
  };
}
