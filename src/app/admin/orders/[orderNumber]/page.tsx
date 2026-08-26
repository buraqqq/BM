"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/enums";

interface AdminOrderView {
  orderNumber: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  paymentStatusLabel: string;
  deliveryMethodLabel: string;
  subtotal: number;
  discount: number;
  shippingAmount: number;
  shippingComputed: boolean;
  shippingNote: string | null;
  total: number;
  createdAt: string;
  items: { productId: string | null; productName: string; sku: string; quantity: number; unitPrice: number; lineTotal: number }[];
  addressSnapshot: {
    firstName: string;
    lastName: string;
    phone: string;
    city: string;
    district: string;
    neighborhood: string | null;
    addressLine: string;
    postalCode: string | null;
    country: string;
  } | null;
  statusHistory?: { fromStatus: string | null; toStatus: string; createdAt: string }[];
  customer: { name: string | null; surname: string | null; email: string; phone: string | null };
  allowedStatusTransitions: string[];
}

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

// FAZ 4C — Bölüm L: /admin/orders/[orderNumber]. Sipariş detayı + durum/ödeme
// durumu yönetimi. Durum değişiklikleri sunucuda transition kurallarıyla
// doğrulanır (geçersiz geçiş 422 döner, burada hata gösterilir).
export default function AdminOrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = params?.orderNumber;

  const [order, setOrder] = useState<AdminOrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!orderNumber) return;
    fetch(`/api/admin/orders/${orderNumber}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setOrder(d))
      .catch(() => setError("Sipariş bulunamadı."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber]);

  async function update(payload: { status?: string; paymentStatus?: string }) {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setOrder(data);
        setMsg("Güncellendi.");
      } else {
        setError(data?.message ?? "Güncelleme başarısız.");
      }
    } catch {
      setError("Sunucuya ulaşılamadı.");
    } finally {
      setBusy(false);
    }
  }

  if (!order) {
    return (
      <div className="admin-container">
        <h2>Sipariş Detayı</h2>
        {error ? <p className="label">{error}</p> : <p className="label">Yükleniyor…</p>}
        <button className="admin-btn secondary" onClick={() => router.push("/admin/orders")} type="button" style={{ marginTop: 12 }}>
          ← Siparişlere Dön
        </button>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <h2>Sipariş #{order.orderNumber}</h2>
        <button className="admin-btn secondary" onClick={() => router.push("/admin/orders")} type="button">
          ← Siparişlere Dön
        </button>
      </div>

      {error && <p className="label" style={{ color: "var(--red, #d33)" }}>{error}</p>}
      {msg && <p className="label" style={{ color: "var(--green, #2a7) " }}>{msg}</p>}

      <div className="admin-card" style={{ padding: 16, marginBottom: 14 }}>
        <p className="label" style={{ marginBottom: 8 }}><strong>Müşteri:</strong> {order.customer.name ?? ""} {order.customer.surname ?? ""} · {order.customer.email} · {order.customer.phone ?? "-"}</p>
        <p className="label"><strong>Tarih:</strong> {formatDate(order.createdAt)}</p>
        <p className="label"><strong>Teslimat:</strong> {order.deliveryMethodLabel}</p>
      </div>

      <div className="admin-card" style={{ padding: 16, marginBottom: 14 }}>
        <h3>Durum Yönetimi</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          <div>
            <p className="label">Sipariş Durumu: <strong>{order.statusLabel}</strong></p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {order.allowedStatusTransitions.length === 0 ? (
                <span className="badge badge-gray">Terminal durum — geçiş yok</span>
              ) : (
                order.allowedStatusTransitions.map((s) => (
                  <button key={s} type="button" className="admin-btn" disabled={busy} onClick={() => update({ status: s })}>
                    → {ORDER_STATUS_LABELS[s as OrderStatus]}
                  </button>
                ))
              )}
            </div>
          </div>
          <div>
            <p className="label">Ödeme Durumu: <strong>{order.paymentStatusLabel}</strong></p>
            <select
              value={order.paymentStatus}
              disabled={busy}
              onChange={(e) => update({ paymentStatus: e.target.value })}
            >
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_STATUS_LABELS[s as PaymentStatus]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {order.addressSnapshot && (
        <div className="admin-card" style={{ padding: 16, marginBottom: 14 }}>
          <h3>Teslimat Adresi</h3>
          <p className="label">
            {order.addressSnapshot.firstName} {order.addressSnapshot.lastName} — {order.addressSnapshot.phone}
            <br />
            {order.addressSnapshot.addressLine}
            <br />
            {order.addressSnapshot.neighborhood ? `${order.addressSnapshot.neighborhood}, ` : ""}
            {order.addressSnapshot.district}/{order.addressSnapshot.city} {order.addressSnapshot.postalCode ?? ""}
          </p>
        </div>
      )}

      <div className="admin-card" style={{ padding: 16, marginBottom: 14 }}>
        <h3>Ürünler</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Ürün</th>
              <th>SKU</th>
              <th>Adet</th>
              <th>Birim Fiyat</th>
              <th>Satır Toplamı</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, i) => (
              <tr key={i}>
                <td>{it.productName}</td>
                <td>{it.sku}</td>
                <td>{it.quantity}</td>
                <td>{formatTL(it.unitPrice)} ₺</td>
                <td>{formatTL(it.lineTotal)} ₺</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="label" style={{ marginTop: 10 }}>
          Ara Toplam: {formatTL(order.subtotal)} ₺ · Kargo: {order.shippingComputed ? `${formatTL(order.shippingAmount)} ₺` : (order.shippingNote ?? "Henüz hesaplanmadı")} · Toplam: <strong>{formatTL(order.total)} ₺</strong>
        </p>
      </div>

      {order.statusHistory && order.statusHistory.length > 0 && (
        <div className="admin-card" style={{ padding: 16 }}>
          <h3>Durum Geçmişi</h3>
          {order.statusHistory.map((h, i) => (
            <p className="label" key={i}>
              {h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus} — {formatDate(h.createdAt)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
