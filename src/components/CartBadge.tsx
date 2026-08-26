"use client";

import { useEffect, useState } from "react";

// FAZ 4A — Bölüm 24: header'daki sepet ikonu + toplam adet rozeti.
// Guest dahil çalışır (GET /api/cart cookie/oturum ne olursa olsun bir
// sepet döner). Global bir state kütüphanesi (Redux/Zustand vb.)
// EKLENMEDİ — Bölüm 31'in "yeni harici servis ekleme" ruhuyla tutarlı,
// basit bir `window` custom event (`cart:updated`) ile diğer bileşenler
// (AddToCartButton, /sepet sayfası) rozetin yenilenmesini tetikliyor.
export const CART_UPDATED_EVENT = "bm:cart-updated";

export function notifyCartUpdated() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT));
}

export function CartBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/cart", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCount(data.totals?.itemCount ?? 0);
      } catch {
        // sessizce yut — rozet yalnızca bir gösterge, hata sayfayı bozmasın
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
    <a href="/sepet" className="cart-badge-link" aria-label="Sepetim">
      <i className="fas fa-shopping-basket" />
      {!!count && <span className="cart-badge-count">{count > 99 ? "99+" : count}</span>}
    </a>
  );
}
