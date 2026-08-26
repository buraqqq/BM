"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface OrderItemView {
  productId: string | null;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface OrderDetailView {
  orderNumber: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  paymentStatusLabel: string;
  deliveryMethod: string;
  deliveryMethodLabel: string;
  currency: string;
  subtotal: number;
  discount: number;
  shippingAmount: number;
  shippingComputed: boolean;
  shippingNote: string | null;
  total: number;
  createdAt: string;
  items: OrderItemView[];
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
}

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

// ==========================================================
// FAZ 4C — /siparis/[orderNumber]. Sipariş başarı/detay sayfası (müşteri).
// Checkout'tan sonra veya "Siparişlerim"den gelinir. Yalnızca KENDİ siparişi
// görür (sunucu tarafı IDOR koruması — burada yalnızca 404 "bulunamadı" gösterilir).
// ==========================================================
export function OrderDetailPage({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const { status } = useSession();
  const [order, setOrder] = useState<OrderDetailView | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/giris?next=/siparis/${orderNumber}`);
      return;
    }
    if (status !== "authenticated") return;
    fetch(`/api/orders/${orderNumber}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setOrder(data);
      })
      .catch(() => setNotFound(true));
  }, [status, orderNumber, router]);

  if (status !== "authenticated" || (!order && !notFound)) {
    return (
      <div className="account-shell">
        <p className="account-sub">Yükleniyor…</p>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="account-shell">
        <div className="account-card">
          <h2>Sipariş bulunamadı</h2>
          <p className="account-sub">Bu siparişe erişemiyorsunuz ya da sipariş mevcut değil.</p>
          <a className="btn btn-primary" href="/hesabim/siparislerim" style={{ marginTop: 14 }}>
            Siparişlerime Dön
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="account-shell wide">
      <div className="account-nav-links">
        <a href="/hesabim">Profilim</a>
        <a href="/hesabim/adresler">Adreslerim</a>
        <a className="active" href="/hesabim/siparislerim">Siparişlerim</a>
        <a href="/sepet">Sepetim</a>
      </div>

      <div className="account-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Sipariş #{order.orderNumber}</h2>
          <span className="account-sub" style={{ margin: 0 }}>{formatDate(order.createdAt)}</span>
        </div>

        <div className="account-info-row">
          <span>Sipariş Durumu</span>
          <span>{order.statusLabel}</span>
        </div>
        <div className="account-info-row">
          <span>Ödeme Durumu</span>
          <span>{order.paymentStatusLabel}</span>
        </div>
        <div className="account-info-row">
          <span>Teslimat Yöntemi</span>
          <span>{order.deliveryMethodLabel}</span>
        </div>
        {order.paymentStatus === "PENDING" && (
          <p className="account-sub" style={{ marginTop: 10 }}>
            Bu fazda online ödeme alınmamaktadır. Siparişiniz oluşturuldu; ödeme ve onay için sizinle iletişime geçilecektir.
          </p>
        )}
      </div>

      <div className="account-card" style={{ marginBottom: 20 }}>
        <h2>Ürünler</h2>
        {order.items.map((item, i) => (
          <div className="cart-line" key={i} style={{ gridTemplateColumns: "1fr auto" }}>
            <div>
              <div className="cart-line-name">{item.productName}</div>
              <div className="cart-line-sku">SKU: {item.sku} — Adet: {item.quantity}</div>
            </div>
            <div className="cart-line-price">
              {formatTL(item.lineTotal)} ₺
              <div className="cart-line-sku" style={{ textAlign: "right" }}>
                {formatTL(item.unitPrice)} ₺ / adet
              </div>
            </div>
          </div>
        ))}
      </div>

      {order.addressSnapshot && (
        <div className="account-card" style={{ marginBottom: 20 }}>
          <h2>Teslimat Adresi</h2>
          <p style={{ margin: 0 }}>
            {order.addressSnapshot.firstName} {order.addressSnapshot.lastName} — {order.addressSnapshot.phone}
            <br />
            {order.addressSnapshot.addressLine}
            <br />
            {order.addressSnapshot.neighborhood ? `${order.addressSnapshot.neighborhood}, ` : ""}
            {order.addressSnapshot.district}/{order.addressSnapshot.city} {order.addressSnapshot.postalCode ?? ""}
          </p>
        </div>
      )}

      <div className="account-card" style={{ marginBottom: 20 }}>
        <h2>Sipariş Özeti</h2>
        <div className="cart-summary-row">
          <span>Ara Toplam</span>
          <span>{formatTL(order.subtotal)} ₺</span>
        </div>
        <div className="cart-summary-row">
          <span>Kargo</span>
          <span>{order.shippingComputed ? `${formatTL(order.shippingAmount)} ₺` : order.shippingNote ?? "Henüz hesaplanmadı"}</span>
        </div>
        {order.discount > 0 && (
          <div className="cart-summary-row">
            <span>İndirim</span>
            <span>-{formatTL(order.discount)} ₺</span>
          </div>
        )}
        <div className="cart-summary-row total">
          <span>Genel Toplam</span>
          <span>{formatTL(order.total)} ₺</span>
        </div>
      </div>

      {order.statusHistory && order.statusHistory.length > 0 && (
        <div className="account-card">
          <h2>Durum Geçmişi</h2>
          {order.statusHistory.map((h, i) => (
            <div className="account-info-row" key={i}>
              <span>{h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus}</span>
              <span>{formatDate(h.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
