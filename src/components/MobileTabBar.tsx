"use client";

import { useEffect, useState } from "react";
import { CART_UPDATED_EVENT } from "@/components/CartBadge";

/**
 * FAZ 3 — Bölüm 6: mobilde hızlı navigasyon için alt sabit sekme çubuğu.
 * Yalnızca public sayfalarda kullanılır (admin kendi navigasyonuna sahip —
 * bkz. src/components/AdminNav.tsx); bu yüzden ortak bir root layout'a
 * değil, her public sayfaya (SiteHeader ile aynı yerde) tek tek eklenir —
 * mevcut kod tabanının SiteHeader/footer için zaten kullandığı desenle
 * tutarlı (bkz. src/app/page.tsx, kategori/urun sayfaları).
 * CSS ile yalnızca @media (max-width: 768px) altında görünür.
 *
 * FAZ 4A — Bölüm 26: "mevcut MobileTabBar ile çakışma yaratma" — WhatsApp
 * sekmesi (tek gerçek sipariş yolu) KALDIRILMADI; bunun yerine "Sepet"
 * sekmesi eklenerek 4'ten 5 sekmeye çıkıldı (flex `justify-content:
 * space-around` zaten esnek — CSS grid sütun sayısı sabitlenmemişti,
 * yapısal bir değişiklik gerekmedi, bkz. globals.css .mobile-tabbar).
 * Client component'e çevrildi çünkü rozet sayısı için CartBadge ile aynı
 * `cart:updated` event'ini dinliyor.
 */
export function MobileTabBar({ whatsappNumber }: { whatsappNumber: string }) {
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/cart", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCartCount(data.totals?.itemCount ?? 0);
      } catch {
        // rozet göstergesi — sessizce yut
      }
    }
    refresh();
    window.addEventListener(CART_UPDATED_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(CART_UPDATED_EVENT, refresh);
    };
  }, []);

  return (
    <nav className="mobile-tabbar" aria-label="Hızlı gezinme">
      <a href="/">
        <i className="fas fa-home" />
        <span>Ana Sayfa</span>
      </a>
      <a href="/urunler">
        <i className="fas fa-th-large" />
        <span>Ürünler</span>
      </a>
      <a href="/arama">
        <i className="fas fa-search" />
        <span>Ara</span>
      </a>
      <a href="/sepet" style={{ position: "relative" }}>
        <i className="fas fa-shopping-basket" />
        {!!cartCount && <span className="cart-badge-count" style={{ position: "absolute", top: 0, right: 4 }}>{cartCount > 99 ? "99+" : cartCount}</span>}
        <span>Sepet</span>
      </a>
      <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer">
        <i className="fab fa-whatsapp" />
        <span>Sipariş</span>
      </a>
    </nav>
  );
}
