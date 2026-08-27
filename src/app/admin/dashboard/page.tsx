"use client";

import { useEffect, useState } from "react";
import { AffiliatePerformanceCard } from "@/components/AffiliatePerformanceCard";

interface DashboardData {
  products: { total: number; active: number; inactive: number };
  inventory: { lowStockCount: number; outOfStockCount: number; unverifiedInventoryCount: number };
  campaigns: { active: number; planned: number; total: number };
  banners: { active: number; total: number };
  catalog: { categories: number; brands: number };
  pendingImportJobs: number;
}

// Bölüm 38/45 — Katalog Operasyon Merkezi ana panosu. Tüm sayılar
// /api/admin/dashboard'dan, yani doğrudan canlı DB'den gelir; hiçbiri
// sabit/örnek veri değildir. "Legacy stoklar doğrulanmayı bekliyor" bandı
// unverifiedInventoryCount > 0 olduğu sürece HER ZAMAN görünür kalır.
export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, []);

  if (loading || !data) {
    return (
      <div className="admin-container">
        <p>Yükleniyor…</p>
      </div>
    );
  }

  return (
    <div className="admin-container">
      {data.inventory.unverifiedInventoryCount > 0 && (
        <div className="admin-card" style={{ background: "#FFF8E1", border: "1px solid #B8860B", marginBottom: 16 }}>
          <strong>⚠ Legacy stoklar doğrulanmayı bekliyor.</strong> Aktif ürünlerin{" "}
          <strong>{data.inventory.unverifiedInventoryCount}</strong> tanesinin stok sayısı hâlâ FAZ 1'den aktarılan
          tahmini bir başlangıç değeri — gerçek bir fiziksel sayıma dayanmıyor. Gerçek stok girmek için{" "}
          <a href="/admin/inventory" style={{ color: "#664D03", fontWeight: 700 }}>
            Stok
          </a>{" "}
          ekranındaki Sayım Modu'nu kullanın.
        </div>
      )}

      <div className="stat-cards">
        <div className="stat-card">
          <div className="num">{data.products.total}</div>
          <div className="label">Toplam Ürün</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: "#2E7D32" }}>
          <div className="num">{data.products.active}</div>
          <div className="label">Aktif Ürün</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: "#842029" }}>
          <div className="num">{data.products.inactive}</div>
          <div className="label">Pasif / Arşivli Ürün</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: "#664D03" }}>
          <div className="num">{data.inventory.unverifiedInventoryCount}</div>
          <div className="label">Doğrulanmayı Bekleyen Stok</div>
        </div>
      </div>

      <div className="stat-cards">
        <div className="stat-card" style={{ borderLeftColor: "#B8860B" }}>
          <div className="num">{data.inventory.lowStockCount}</div>
          <div className="label">Az Stok</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: "#842029" }}>
          <div className="num">{data.inventory.outOfStockCount}</div>
          <div className="label">Tükenen Ürün</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: "#2E7D32" }}>
          <div className="num">{data.campaigns.active}</div>
          <div className="label">Şu An Aktif Kampanya</div>
        </div>
        <div className="stat-card">
          <div className="num">{data.campaigns.planned}</div>
          <div className="label">Planlanan Kampanya</div>
        </div>
      </div>

      <div className="stat-cards">
        <div className="stat-card" style={{ borderLeftColor: "#2E7D32" }}>
          <div className="num">{data.banners.active}</div>
          <div className="label">Aktif Banner</div>
        </div>
        <div className="stat-card">
          <div className="num">{data.catalog.categories}</div>
          <div className="label">Aktif Kategori</div>
        </div>
        <div className="stat-card">
          <div className="num">{data.catalog.brands}</div>
          <div className="label">Aktif Marka</div>
        </div>
        {data.pendingImportJobs > 0 && (
          <div className="stat-card" style={{ borderLeftColor: "#664D03" }}>
            <div className="num">{data.pendingImportJobs}</div>
            <div className="label">Bekleyen İçe Aktarma İşi</div>
          </div>
        )}
      </div>

      {/* FAZ 8 — Affiliate & BOM eşleşme performansı kartı */}
      <AffiliatePerformanceCard />

      <div className="admin-card">
        <p style={{ fontSize: "0.85rem", color: "var(--gray-600)" }}>
          Hızlı erişim: <a href="/admin/products">Ürünler</a> · <a href="/admin/inventory">Stok</a> ·{" "}
          <a href="/admin/pricing">Fiyatlandırma</a> · <a href="/admin/campaigns">Kampanyalar</a> ·{" "}
          <a href="/admin/import-export">İçe/Dışa Aktar</a> · <a href="/admin/audit-log">Denetim Kaydı</a>
        </p>
      </div>
    </div>
  );
}
