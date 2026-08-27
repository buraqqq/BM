"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface AlertItem {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  productPrice: number;
  alertType: string;
  targetPrice: number | null;
  isTriggered: boolean;
  createdAt: string;
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  STOCK_RESTOCK: "Stok Yenilenince",
  PRICE_DROP: "Fiyat Düşünce",
  BACK_IN_STOCK: "Stoğa Gelince",
};

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

// ==========================================================
// FAZ 9 — /hesabim/alarmlar. Kullanıcının aktif stok/fiyat alarmlarını listeler,
// iptal etmesini sağlar (DELETE /api/alerts/[id]). Tetiklenmiş alarmlar gri
// rozetle gösterilir.
// ==========================================================
export function MyAlerts() {
  const router = useRouter();
  const { status } = useSession();
  const [items, setItems] = useState<AlertItem[] | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAlerts() {
    const res = await fetch("/api/alerts", { cache: "no-store" });
    if (!res.ok) {
      router.push("/giris?next=/hesabim/alarmlar");
      return;
    }
    const data = await res.json();
    setItems(data.items);
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/giris?next=/hesabim/alarmlar");
      return;
    }
    if (status === "authenticated") loadAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleDelete(id: string) {
    if (!confirm("Bu alarmı iptal etmek istediğinize emin misiniz?")) return;
    setDeletingId(id);
    setError(null);
    const res = await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      setError("Alarm iptal edilemedi.");
      return;
    }
    loadAlerts();
  }

  if (status === "loading" || items === null) {
    return (
      <div className="account-shell">
        <p className="account-sub">Yükleniyor…</p>
      </div>
    );
  }

  return (
    <div className="account-shell wide">
      <div className="account-nav-links">
        <a href="/hesabim">Profilim</a>
        <a href="/hesabim/adresler">Adreslerim</a>
        <a href="/hesabim/siparislerim">Siparişlerim</a>
        <a className="active" href="/hesabim/alarmlar">Alarmlarım</a>
        <a href="/sepet">Sepetim</a>
      </div>

      <div className="account-card">
        <h2>Alarmlarım</h2>
        <p className="account-sub" style={{ marginTop: 4 }}>
          Fiyat düşüşü ve stoğa geliş bildirimleriniz. Bildirimler tetiklendiğinde bu listede işaretlenir.
        </p>

        {error && <p className="account-error">{error}</p>}

        {items.length === 0 ? (
          <p className="account-sub" style={{ marginTop: 16 }}>
            Henüz aktif alarmınız yok. Ürün sayfasından &quot;Fiyatı Düşünce Haber Ver&quot; veya &quot;Stok Gelince Haber Ver&quot; ile alarm kurabilirsiniz.
          </p>
        ) : (
          <div style={{ marginTop: 12 }}>
            {items.map((a) => (
              <div className="account-info-row" key={a.id} style={{ flexWrap: "wrap", gap: 8 }}>
                <div style={{ minWidth: 200 }}>
                  <a href={`/urun/${a.productSlug}`} style={{ fontWeight: 600 }}>
                    {a.productName}
                  </a>
                  <div className="account-sub" style={{ marginTop: 2 }}>
                    {ALERT_TYPE_LABELS[a.alertType] ?? a.alertType}
                    {a.alertType === "PRICE_DROP" && a.targetPrice !== null ? ` · hedef ${formatTL(a.targetPrice)} ₺` : ""}
                    {a.alertType !== "PRICE_DROP" && <span> · şu an {formatTL(a.productPrice)} ₺</span>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {a.isTriggered ? (
                    <span className="badge badge-green">Tetiklendi</span>
                  ) : (
                    <span className="badge">Bekliyor</span>
                  )}
                  <button type="button" className="btn btn-white" style={{ padding: "6px 14px", fontSize: "0.8rem" }} onClick={() => handleDelete(a.id)} disabled={deletingId === a.id}>
                    {deletingId === a.id ? "İptal ediliyor…" : "İptal Et"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
