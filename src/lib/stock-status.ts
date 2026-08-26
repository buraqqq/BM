import type { StockStatus } from "@/lib/enums";

// ==========================================================
// Bölüm 18/20/41 — Stok durumu türetme kuralı.
// Daha önce bu mantık hem /api/admin/inventory/[productId] (delta güncelleme)
// hem /api/admin/inventory/[productId]/count (sayım modu) uçlarında ayrı
// ayrı, birebir aynı satırla tekrarlanıyordu — tek kaynağa çıkarıldı ki iki
// yer birbirinden sessizce sapmasın ve birim testle doğrulanabilsin.
// Kural: 0 -> OUT_OF_STOCK; lowStockThreshold'a eşit veya altında ->
// LOW_STOCK; aksi halde IN_STOCK.
// ==========================================================
export function deriveStockStatus(quantity: number, lowStockThreshold: number): StockStatus {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity <= lowStockThreshold) return "LOW_STOCK";
  return "IN_STOCK";
}
