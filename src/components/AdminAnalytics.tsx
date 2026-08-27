"use client";

import { useEffect, useState } from "react";

interface AlertTypeCounts {
  STOCK_RESTOCK: number;
  PRICE_DROP: number;
  BACK_IN_STOCK: number;
}

interface AlertStatusCounts {
  pending: number;
  triggered: number;
  cancelled: number;
}

interface AlertStats {
  total: number;
  byType: AlertTypeCounts;
  byStatus: AlertStatusCounts;
}

interface TopAlertedProduct {
  productId: string;
  productName: string;
  productSlug: string;
  alertCount: number;
}

interface NotificationStats {
  delivered: number;
  failed: number;
  successRate: number | null;
}

interface AdminAnalyticsData {
  alerts: AlertStats;
  topAlertedProducts: TopAlertedProduct[];
  notifications: NotificationStats;
}

const ALERT_TYPE_LABELS: Record<keyof AlertTypeCounts, string> = {
  STOCK_RESTOCK: "Stok Yenilenince",
  PRICE_DROP: "Fiyat Düşünce",
  BACK_IN_STOCK: "Stoğa Gelince",
};

// ==========================================================
// FAZ 11 — "Analitik & Performans" kartı.
// GET /api/admin/analytics tüketir; tüm sayılar canlı ProductAlert +
// AuditLog'dan gelir (örnek/sabit veri YOK). Alarm dağılımı, en çok alarm
// kurulan ürünler ve e-posta teslimat başarı oranını gösterir.
// ==========================================================
export function AdminAnalytics() {
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/analytics", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: AdminAnalyticsData) => {
        if (!cancelled) {
          setData(d);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="admin-card" style={{ marginBottom: 16 }}>
      <h3 style={{ margin: 0, marginBottom: 12 }}>Analitik &amp; Performans</h3>

      {error ? (
        <p className="label">Analitik verisi alınamadı.</p>
      ) : !data ? (
        <p className="label">Yükleniyor…</p>
      ) : (
        <>
          {/* Üst özet kartları */}
          <div className="stat-cards">
            <div className="stat-card" style={{ borderLeftColor: "#1565C0" }}>
              <div className="num">{data.alerts.total}</div>
              <div className="label">Toplam Alarm</div>
            </div>
            <div className="stat-card" style={{ borderLeftColor: "#2E7D32" }}>
              <div className="num">{data.alerts.byStatus.pending}</div>
              <div className="label">Bekleyen Alarm</div>
            </div>
            <div className="stat-card" style={{ borderLeftColor: "#E65100" }}>
              <div className="num">{data.alerts.byStatus.triggered}</div>
              <div className="label">Tetiklenen Alarm</div>
            </div>
            <div className="stat-card" style={{ borderLeftColor: "#842029" }}>
              <div className="num">{data.alerts.byStatus.cancelled}</div>
              <div className="label">İptal Edilen Alarm</div>
            </div>
            <div className="stat-card" style={{ borderLeftColor: "#1565C0" }}>
              <div className="num">{data.notifications.successRate === null ? "—" : `%${data.notifications.successRate}`}</div>
              <div className="label">E-posta Teslimat Başarısı</div>
            </div>
          </div>

          {/* Alarm tipi dağılımı */}
          <div style={{ marginTop: 14 }}>
            <div className="label" style={{ marginBottom: 8 }}>Alarm Tipi Dağılımı</div>
            <div className="stat-cards">
              {(["STOCK_RESTOCK", "PRICE_DROP", "BACK_IN_STOCK"] as const).map((type) => (
                <div key={type} className="stat-card">
                  <div className="num">{data.alerts.byType[type]}</div>
                  <div className="label">{ALERT_TYPE_LABELS[type]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bildirim teslimat detayı */}
          <div style={{ marginTop: 14 }}>
            <div className="label" style={{ marginBottom: 8 }}>E-posta Bildirim Teslimatı</div>
            <div className="stat-cards">
              <div className="stat-card" style={{ borderLeftColor: "#2E7D32" }}>
                <div className="num">{data.notifications.delivered}</div>
                <div className="label">Başarılı (delivered:true)</div>
              </div>
              <div className="stat-card" style={{ borderLeftColor: "#842029" }}>
                <div className="num">{data.notifications.failed}</div>
                <div className="label">Başarısız (delivered:false)</div>
              </div>
            </div>
          </div>

          {/* En çok alarm kurulan ürünler */}
          <div style={{ marginTop: 14 }}>
            <div className="label" style={{ marginBottom: 8 }}>En Çok Alarm Kurulan Ürünler</div>
            {data.topAlertedProducts.length === 0 ? (
              <p className="label">Henüz alarm kurulmuş ürün yok.</p>
            ) : (
              <div>
                {data.topAlertedProducts.map((p) => (
                  <div key={p.productId} className="label" style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--gray-200)" }}>
                    <a href={`/admin/products/${p.productId}`} style={{ color: "inherit" }}>
                      {p.productName}
                    </a>
                    <span>{p.alertCount} alarm</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
