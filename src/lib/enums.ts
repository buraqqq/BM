// ==========================================================
// SQLite native enum tipini desteklemediği için (bkz. prisma/schema.prisma
// yorumları), tüm "enum benzeri" alanlar veritabanında String olarak
// tutulur ve izin verilen değerler burada, tek bir yerde tanımlanır.
// API katmanı (zod) ve UI bu listeleri referans alır.
// ==========================================================

export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

// FAZ 2 — Bölüm 11: yeni bahçe ekosistemi kategorileri (hortum→metre, suni
// çim→m², tohum→paket, gübre→kg gibi) için birim listesi genişletildi.
export const PRODUCT_UNITS = [
  "KG",
  "ADET",
  "LITRE",
  "METREKARE",
  "METRE",
  "SET",
  "SISE",
  "TANE",
  "PAKET",
  "GRAM",
  "CIFT",
  "GRAM_100",
  "RULO",
  "TORBA",
  "KUTU",
  "MILILITRE",
] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const PRODUCT_UNIT_LABELS: Record<ProductUnit, string> = {
  KG: "TL/kg",
  ADET: "TL/adet",
  LITRE: "TL/L",
  METREKARE: "TL/m²",
  METRE: "TL/mt",
  SET: "TL/set",
  SISE: "TL/şişe",
  TANE: "TL/tane",
  PAKET: "TL/paket",
  GRAM: "TL/gr",
  CIFT: "TL/çift",
  GRAM_100: "TL/100gr",
  RULO: "TL/rulo",
  TORBA: "TL/torba",
  KUTU: "TL/kutu",
  MILILITRE: "TL/ml",
};

// Migrasyon script'i (prisma/seed.ts), eski products.js'teki serbest metin
// "unit" alanlarını ("TL/kg" gibi) bu enum'a çevirmek için kullanır.
export const LEGACY_UNIT_TO_ENUM: Record<string, ProductUnit> = {
  "TL/kg": "KG",
  "TL/tane": "TANE",
  "TL/set": "SET",
  "TL/L": "LITRE",
  "TL/şişe": "SISE",
  "TL/paket": "PAKET",
  "TL/çift": "CIFT",
  "TL/100gr": "GRAM_100",
  "TL/m²": "METREKARE",
  "TL/mt": "METRE",
  "TL/adet": "ADET",
  "TL/gr": "GRAM",
};

export const STOCK_STATUSES = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

// FAZ 2 — Bölüm 19: stok hareket nedenleri genişletildi (satın alma, sayım
// düzeltmesi, hasar, fire, satış, iade, manuel, diğer). Eski RESTOCK/SALE/
// ADJUSTMENT/MIGRATION değerleri (FAZ 1 verisinde zaten kullanılan) geriye
// dönük uyumluluk için korundu — hiçbir eski InventoryMovement kaydı
// anlamını kaybetmez.
export const INVENTORY_MOVEMENT_TYPES = [
  "RESTOCK", // satın alma / stok girişi
  "SALE", // satış
  "RETURN", // iade
  "DAMAGE", // hasar
  "WASTE", // fire
  "COUNT_ADJUSTMENT", // fiziksel sayım sonrası düzeltme (Bölüm 20)
  "ADJUSTMENT", // manuel düzeltme (FAZ 1'den korunan genel ad)
  "MIGRATION", // legacy veri taşıma (FAZ 1'den korunan)
  "OTHER",
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const INVENTORY_MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  RESTOCK: "Satın Alma / Stok Girişi",
  SALE: "Satış",
  RETURN: "İade",
  DAMAGE: "Hasar",
  WASTE: "Fire",
  COUNT_ADJUSTMENT: "Sayım Düzeltmesi",
  ADJUSTMENT: "Manuel Düzeltme",
  MIGRATION: "Sistem Aktarımı (Legacy)",
  OTHER: "Diğer",
};

// FAZ 3 — Bölüm 8: ticari altyapı hazırlığı (yalnızca şema, bkz.
// prisma/schema.prisma Cart modeli yorumu ve docs/commerce.md). Hiçbir kod
// şu an bu değerleri okumuyor/yazmıyor.
export const CART_STATUSES = ["ACTIVE", "CONVERTED", "ABANDONED"] as const;
export type CartStatus = (typeof CART_STATUSES)[number];

// FAZ 4B — Bölüm 6: teslimat yöntemi. Şimdilik iki değer (Gel-Al/Kargo) ama
// gelecekte genişletilebilir olacak şekilde (ör. EXPRESS_DELIVERY) ayrı bir
// liste olarak tutuluyor — henüz hiçbir Prisma modeline (Order yok) gömülü
// değil, yalnızca checkout API/UI bu listeyi referans alıyor.
export const DELIVERY_METHODS = ["PICKUP", "DELIVERY"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  PICKUP: "Mağazadan Gel-Al",
  DELIVERY: "Kargo ile Teslimat",
};

// FAZ 4C — Bölüm D: sipariş durumları. SQLite native enum desteklemediği
// için String olarak tutulur; izin verilen değerler burada tek kaynak olarak
// tanımlanır (bkz. prisma/schema.prisma Order modeli). Durum geçiş kuralları
// src/lib/order-logic.ts içinde SAF fonksiyon olarak tutulur (DB'den ayrı,
// birim testli) — burada yalnızca geçerli değerler ve UI etiketleri.
export const ORDER_STATUSES = ["PENDING", "CONFIRMED", "PREPARING", "READY", "SHIPPED", "COMPLETED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Beklemede",
  CONFIRMED: "Onaylandı",
  PREPARING: "Hazırlanıyor",
  READY: "Hazır",
  SHIPPED: "Kargoya Verildi",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal Edildi",
};

// FAZ 4C — Bölüm E: ödeme durumu. Gerçek ödeme sağlayıcısı BU FAZDA YOK —
// sipariş oluşturulduğunda başlangıç durumu her zaman PENDING'dir ("ödeme
// alındı" gibi sahte bir durum üretilmez). "CANCELLED" bilinçli olarak listede
// YOK: sipariş iptali Order.status tarafından temsil edilir; ödeme durumu
// PENDING/PAID/FAILED/REFUNDED ile sınırlıdır (gereksiz bir çift anlam
// önlenir, seçim gerekçesi docs/commerce.md'de).
export const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Ödeme Bekliyor",
  PAID: "Ödendi",
  FAILED: "Başarısız",
  REFUNDED: "İade Edildi",
};

// FAZ 4C — sipariş para birimi. Gerçek çoklu-para-birimi desteği yok; TRY
// sabit tutulur (ileride Setting tabanlı hale getirilebilir, şimdilik uydurma
// bir dönüşüm/para listesi eklenmedi).
export const ORDER_CURRENCY = "TRY";

export const CAMPAIGN_DISCOUNT_TYPES = ["PERCENTAGE", "FIXED_AMOUNT"] as const;
export type CampaignDiscountType = (typeof CAMPAIGN_DISCOUNT_TYPES)[number];

// FAZ 2: SUBCATEGORY kaldırıldı (bkz. prisma/schema.prisma yorumu) — CATEGORY
// artık seçilen kategori + tüm alt ağacını kapsar.
export const CAMPAIGN_SCOPES = ["PRODUCT", "CATEGORY", "GLOBAL"] as const;
export type CampaignScope = (typeof CAMPAIGN_SCOPES)[number];

// FAZ 2 — Bölüm 10: esnek ürün özellikleri (ProductAttributeDefinition.type)
export const PRODUCT_ATTRIBUTE_TYPES = ["TEXT", "NUMBER", "BOOLEAN", "SELECT"] as const;
export type ProductAttributeType = (typeof PRODUCT_ATTRIBUTE_TYPES)[number];

// FAZ 2 — Bölüm 23/38: CSV/Excel import işleri
export const IMPORT_JOB_STATUSES = ["PENDING", "VALIDATED", "IMPORTING", "COMPLETED", "FAILED"] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

// FAZ 2 — Bölüm 22: ürün toplu işlem tipleri
export const BULK_PRODUCT_ACTIONS = [
  "ACTIVATE",
  "DEACTIVATE",
  "ARCHIVE",
  "SET_CATEGORY",
  "SET_BRAND",
  "SET_FEATURED",
  "UNSET_FEATURED",
  "ADD_TO_CAMPAIGN",
  "REMOVE_FROM_CAMPAIGN",
] as const;
export type BulkProductAction = (typeof BULK_PRODUCT_ACTIONS)[number];

// Audit log "action" değerleri (bkz. docs/security.md, bölüm 14 gereksinimleri;
// FAZ 2 Bölüm 33 ile genişletildi — bulk işlemler, stok sayımı, import/export,
// kategori taşıma, kampanya ürün ataması dahil)
export const AUDIT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "PRODUCT_CREATE",
  "PRODUCT_UPDATE",
  "PRODUCT_ARCHIVE",
  "PRODUCT_RESTORE",
  "PRODUCT_BULK_ACTION",
  "PRICE_UPDATE",
  "BULK_PRICE_UPDATE",
  "INVENTORY_UPDATE",
  "INVENTORY_COUNT",
  "CAMPAIGN_CREATE",
  "CAMPAIGN_UPDATE",
  "CAMPAIGN_PRODUCT_ASSIGN",
  "BANNER_CREATE",
  "BANNER_UPDATE",
  "CATEGORY_CREATE",
  "CATEGORY_UPDATE",
  "CATEGORY_MOVE",
  "CATEGORY_ARCHIVE",
  "BRAND_CREATE",
  "BRAND_UPDATE",
  "ATTRIBUTE_DEFINITION_CREATE",
  "ATTRIBUTE_DEFINITION_UPDATE",
  "PRODUCT_IMPORT",
  "PRODUCT_EXPORT",
  "SETTINGS_UPDATE",
  // FAZ 4C — Bölüm L: sipariş yönetimi. Admin sipariş durumunu/ödeme durumunu
  // değiştirdiğinde AuditLog'a yazılır (transition order-logic ile doğrulanır).
  "ORDER_STATUS_UPDATE",
  "ORDER_PAYMENT_STATUS_UPDATE",
  "AFFILIATE_CLICK",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
