"use client";

import { useEffect, useState } from "react";

interface AffiliateMetrics {
  totalClicks: number;
  topMerchant: string;
  matchSuccessRate: number | null;
  clicksByDay: { date: string; count: number }[];
}

const RANGES = [
  { label: "Son 7 Gün", days: 7 },
  { label: "Son 30 Gün", days: 30 },
  { label: "Son 90 Gün", days: 90 },
];

// ==========================================================
// FAZ 8 — "Affiliate & BOM Eşleşme Performansı" kartı.
// GET /api/admin/affiliate-analytics tüketir; tüm sayılar canlı AuditLog'dan
// gelir (örnek/sabit veri YOK). Günlük trend, bağımlılıksız basit CSS çubuk
// grafik + liste olarak gösterilir.
// ==========================================================
export function AffiliatePerformanceCard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AffiliateMetrics | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/affiliate-analytics?days=${days}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: AffiliateMetrics) => {
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
  }, [days]);

  const maxCount = data?.clicksByDay.reduce((m, d) => Math.max(m, d.count), 0) ?? 0;

  return (
    <div className="admin-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Affiliate &amp; BOM Eşleşme Performansı</h3>
        <div style={{ display: "flex", gap: 6 }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              className="admin-btn secondary"
              style={{ opacity: days === r.days ? 1 : 0.55, padding: "4px 10px", fontSize: "0.78rem" }}
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="label">Performans verisi alınamadı.</p>
      ) : !data ? (
        <p className="label">Yükleniyor…</p>
      ) : (
        <>
          <div className="stat-cards">
            <div className="stat-card" style={{ borderLeftColor: "#E65100" }}>
              <div className="num">{data.totalClicks}</div>
              <div className="label">Toplam Tıklama</div>
            </div>
            <div className="stat-card" style={{ borderLeftColor: "#2E7D32" }}>
              <div className="num" style={{ fontSize: data.topMerchant.length > 14 ? "1rem" : undefined }}>{data.topMerchant}</div>
              <div className="label">En Çok Tercih Edilen Satıcı</div>
            </div>
            <div className="stat-card" style={{ borderLeftColor: "#1565C0" }}>
              <div className="num">{data.matchSuccessRate === null ? "—" : `%${data.matchSuccessRate}`}</div>
              <div className="label">BOM Eşleşme Başarı Oranı</div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="label" style={{ marginBottom: 8 }}>Günlük Tıklama Trendi</div>
            {data.clicksByDay.length === 0 ? (
              <p className="label">Bu aralıkta tıklama kaydı yok.</p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 90, marginBottom: 8 }}>
                  {data.clicksByDay.map((d) => (
                    <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }} title={`${d.date}: ${d.count} tıklama`}>
                      <div style={{ width: "100%", maxWidth: 28, background: "#E65100", borderRadius: "3px 3px 0 0", height: maxCount > 0 ? Math.max(4, Math.round((d.count / maxCount) * 80)) : 0 }} />
                    </div>
                  ))}
                </div>
                <div style={{ maxHeight: 120, overflowY: "auto" }}>
                  {data.clicksByDay.map((d) => (
                    <div key={d.date} className="label" style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                      <span>{d.date}</span>
                      <span>{d.count} tıklama</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
