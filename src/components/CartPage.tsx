"use client";

import { useEffect, useState } from "react";
import { notifyCartUpdated } from "@/components/CartBadge";

interface CartLine {
  id: string;
  productId: string;
  product: { id: string; slug: string; sku: string; name: string; image: { url: string; alt: string | null } | null };
  quantity: number;
  unitPriceAtAdd: number;
  currentFinalPrice: number;
  priceChanged: boolean;
  lineTotal: number;
  isActive: boolean;
  stock: { status: string; quantity: number | null };
  stockExceeded: boolean;
  maxAllowedQuantity: number;
}

interface CartResponse {
  cartId: string;
  items: CartLine[];
  totals: { itemCount: number; lineCount: number; subtotal: number };
}

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

// FAZ 4A — Bölüm 23: /sepet — guest DAHİL çalışır (GET /api/cart, cookie/
// oturum ne olursa olsun bir sepet döner, bkz. cart-session.ts). Bölüm
// 16/21/22: fiyat değişikliği + satıştan kalkma + stok aşımı uyarıları
// SUNUCUNUN döndürdüğü, ZATEN hesaplanmış alanlardan gösterilir — burada
// TEKRAR hesaplama yapılmaz.
export function CartPage() {
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/cart", { cache: "no-store" });
    if (res.ok) setCart(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function updateQuantity(id: string, quantity: number) {
    if (quantity < 1) return;
    setBusyId(id);
    const res = await fetch(`/api/cart/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
    if (res.ok) setCart(await res.json());
    setBusyId(null);
    notifyCartUpdated();
  }

  async function removeItem(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/cart/items/${id}`, { method: "DELETE" });
    if (res.ok) setCart(await res.json());
    setBusyId(null);
    notifyCartUpdated();
  }

  async function clearCart() {
    if (!confirm("Sepeti tamamen boşaltmak istediğinize emin misiniz?")) return;
    const res = await fetch("/api/cart", { method: "DELETE" });
    if (res.ok) setCart(await res.json());
    notifyCartUpdated();
  }

  if (!cart) {
    return (
      <div className="cart-shell">
        <p className="account-sub">Yükleniyor…</p>
      </div>
    );
  }

  if (cart.items.length === 0) {
    // Bölüm 27 — Empty state
    return (
      <div className="cart-shell">
        <div className="empty-state">
          <i className="fas fa-shopping-basket" />
          <h2>Sepetiniz boş.</h2>
          <p style={{ marginBottom: 20 }}>Aradığınız ürünleri keşfedin, sepetinize ekleyin.</p>
          <a href="/urunler" className="btn btn-primary">
            Ürünleri Keşfet
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-shell">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h1 style={{ fontFamily: "var(--font-heading)", color: "var(--cream)" }}>Sepetim</h1>
        <button
          type="button"
          onClick={clearCart}
          style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)", padding: "8px 16px", borderRadius: 50, cursor: "pointer", fontSize: "0.82rem" }}
        >
          Sepeti Boşalt
        </button>
      </div>

      <div className="account-card">
        {cart.items.map((line) => (
          <div className="cart-line" key={line.id}>
            {line.product.image ? (
              <img className="cart-line-img" src={line.product.image.url} alt={line.product.image.alt ?? line.product.name} />
            ) : (
              <div className="cart-line-img-fallback">
                <i className="fas fa-leaf" />
              </div>
            )}
            <div>
              <a className="cart-line-name" href={`/urun/${line.product.slug}`}>
                {line.product.name}
              </a>
              <div className="cart-line-sku">SKU: {line.product.sku}</div>

              {!line.isActive && <div className="cart-line-warning">Bu ürün artık satışta değil.</div>}
              {line.isActive && line.priceChanged && (
                <div className="cart-line-warning">
                  Bu ürünün fiyatı değişti: {formatTL(line.unitPriceAtAdd)} ₺ → {formatTL(line.currentFinalPrice)} ₺
                </div>
              )}
              {line.isActive && line.stockExceeded && (
                <div className="cart-line-warning">Stok yetersiz — yalnızca {line.stock.quantity} adet mevcut.</div>
              )}

              <div className="cart-qty" style={{ marginTop: 8 }}>
                <button type="button" disabled={busyId === line.id} onClick={() => updateQuantity(line.id, line.quantity - 1)}>
                  −
                </button>
                <span>{line.quantity}</span>
                <button type="button" disabled={busyId === line.id} onClick={() => updateQuantity(line.id, line.quantity + 1)}>
                  +
                </button>
              </div>
              <button className="cart-line-remove" type="button" onClick={() => removeItem(line.id)}>
                Sepetten Kaldır
              </button>
            </div>
            <div className="cart-line-price">
              {formatTL(line.currentFinalPrice)} ₺
              <span style={{ display: "block", fontWeight: 400, fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>
                x{line.quantity} = {formatTL(line.lineTotal)} ₺
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="cart-summary">
        <div className="cart-summary-row">
          <span>Ürün Adedi</span>
          <span>{cart.totals.itemCount}</span>
        </div>
        <div className="cart-summary-row">
          <span>Kargo</span>
          <span>—</span>
        </div>
        <div className="cart-summary-row total">
          <span>Ara Toplam</span>
          <span>{formatTL(cart.totals.subtotal)} ₺</span>
        </div>
        {/* FAZ 4B — Bölüm 1: checkout'a giriş noktası. Sepet boşken bu buton
            zaten render edilmiyor (yukarıdaki empty-state dalı). */}
        <a href="/checkout" className="btn btn-primary" style={{ display: "block", textAlign: "center", marginTop: 16 }}>
          Checkout&apos;a Geç
        </a>
        <p style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.4)", marginTop: 10 }}>
          Bu fazda ödeme işlemi bulunmuyor — mevcut siparişler WhatsApp üzerinden alınır.
        </p>
      </div>
    </div>
  );
}
