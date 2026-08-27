"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface OrderSummary {
  orderNumber: string;
  statusLabel: string;
  paymentStatusLabel: string;
  deliveryMethodLabel: string;
  total: number;
  createdAt: string;
}

interface OrderListResponse {
  items: OrderSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

// ==========================================================
// FAZ 4C — Bölüm J: /hesabim/siparislerim. Müşterinin KENDİ sipariş listesi.
// Sunucu zaten userId filtresi uygular; burada yalnızca listeyi çizip detay
// sayfasına (/siparis/[orderNumber]) yönlendirir.
// ==========================================================
export function OrderHistoryPage() {
  const router = useRouter();
  const { status } = useSession();
  const [data, setData] = useState<OrderListResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/giris?next=/hesabim/siparislerim");
      return;
    }
    if (status !== "authenticated") return;
    setLoading(true);
    fetch(`/api/orders?page=${page}&pageSize=10`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: OrderListResponse) => setData(d))
      .catch(() => router.push("/giris?next=/hesabim/siparislerim"))
      .finally(() => setLoading(false));
  }, [status, page, router]);

  if (status !== "authenticated" || (loading && !data)) {
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
        <a className="active" href="/hesabim/siparislerim">Siparişlerim</a>
        <a href="/hesabim/alarmlar">Alarmlarım</a>
        <a href="/sepet">Sepetim</a>
      </div>

      <div className="account-card">
        <h2>Siparişlerim</h2>

        {data && data.items.length === 0 && (
          <p className="account-sub">Henüz siparişiniz yok.</p>
        )}

        {data?.items.map((o) => (
          <a
            key={o.orderNumber}
            href={`/siparis/${o.orderNumber}`}
            style={{ display: "block", textDecoration: "none", color: "inherit", marginBottom: 12 }}
          >
            <div className="account-card" style={{ margin: 0, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <strong>#{o.orderNumber}</strong>
                <span className="account-sub">{formatDate(o.createdAt)}</span>
              </div>
              <div className="account-info-row">
                <span>Durum</span>
                <span>{o.statusLabel}</span>
              </div>
              <div className="account-info-row">
                <span>Teslimat</span>
                <span>{o.deliveryMethodLabel}</span>
              </div>
              <div className="account-info-row">
                <span>Toplam</span>
                <span>{formatTL(o.total)} ₺</span>
              </div>
            </div>
          </a>
        ))}

        {data && data.totalPages > 1 && (
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className="btn btn-primary"
                style={{ padding: "6px 12px", fontSize: "0.8rem", opacity: p === page ? 1 : 0.5 }}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}