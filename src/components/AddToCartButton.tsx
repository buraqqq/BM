"use client";

import { useState } from "react";
import { notifyCartUpdated } from "@/components/CartBadge";

// FAZ 4A — Bölüm 12/25: "Sepete Ekle" ikincil aksiyonu. Ürünün TEK gerçek
// sipariş yolu hâlâ WhatsApp'tır (bkz. ProductCard.tsx, docs/commerce.md) —
// bu buton onu DEĞİŞTİRMİYOR, sepetin gerçekten çalıştığını (ekle/miktar/
// sepete git) gösteren, isteğe bağlı ikinci bir aksiyon ekliyor.
export function AddToCartButton({ productId, inStock, quantity = 1 }: { productId: string; inStock: boolean; quantity?: number }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    if (!inStock || state === "loading") return;
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setState("error");
        setMessage(data?.message ?? "Sepete eklenemedi.");
        return;
      }
      setState("done");
      notifyCartUpdated();
      setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("error");
      setMessage("Bağlantı hatası, tekrar deneyin.");
    }
  }

  if (!inStock) {
    return (
      <button className="product-card-secondary-cta" disabled type="button">
        <i className="fas fa-ban" /> Tükendi
      </button>
    );
  }

  return (
    <button className="product-card-secondary-cta" onClick={handleClick} disabled={state === "loading"} type="button">
      {state === "loading" ? (
        <>
          <i className="fas fa-spinner fa-spin" /> Ekleniyor…
        </>
      ) : state === "done" ? (
        <>
          <i className="fas fa-check" /> Sepete Eklendi
        </>
      ) : state === "error" ? (
        <>
          <i className="fas fa-exclamation-triangle" /> {message ?? "Hata"}
        </>
      ) : (
        <>
          <i className="fas fa-cart-plus" /> Sepete Ekle
        </>
      )}
    </button>
  );
}
