// ==========================================================
// SQLite native enum tipini desteklemediği için (bkz. prisma/schema.prisma
// yorumları), tüm "enum benzeri" alanlar veritabanında String olarak
// tutulur ve izin verilen değerler burada, tek bir yerde tanımlanır.
// API katmanı (zod) ve UI bu listeleri referans alır.
// ==========================================================

export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

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

export const INVENTORY_MOVEMENT_TYPES = [
  "RESTOCK",
  "SALE",
  "ADJUSTMENT",
  "MIGRATION",
] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const CAMPAIGN_DISCOUNT_TYPES = ["PERCENTAGE", "FIXED_AMOUNT"] as const;
export type CampaignDiscountType = (typeof CAMPAIGN_DISCOUNT_TYPES)[number];

export const CAMPAIGN_SCOPES = ["PRODUCT", "CATEGORY", "SUBCATEGORY", "GLOBAL"] as const;
export type CampaignScope = (typeof CAMPAIGN_SCOPES)[number];

// Audit log "action" değerleri (bkz. docs/security.md, bölüm 14 gereksinimleri)
export const AUDIT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "PRODUCT_CREATE",
  "PRODUCT_UPDATE",
  "PRODUCT_ARCHIVE",
  "PRODUCT_RESTORE",
  "PRICE_UPDATE",
  "BULK_PRICE_UPDATE",
  "INVENTORY_UPDATE",
  "CAMPAIGN_CREATE",
  "CAMPAIGN_UPDATE",
  "BANNER_CREATE",
  "BANNER_UPDATE",
  "CATEGORY_CREATE",
  "CATEGORY_UPDATE",
  "SETTINGS_UPDATE",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
