"use client";

import { useState } from "react";
import { notifyCartUpdated } from "@/components/CartBadge";

// FAZ 4A — Bölüm 12/14: ürün detay sayfasında miktar seçici + "Sepete Ekle".
// AddToCartButton.tsx (ProductCard'daki sabit miktar=1 versiyonu) ile aynı
// /api/cart/items ucunu kullanır, ayrı bir sepet mantığı İCAT EDİLMEDİ.
export function QuantityAddToCart({ productId, inStock }: { productId: string; inStock: boolean }) {
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleAdd() {
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
      <p className="account-error" style={{ display: "inline-block" }}>
        Bu ürün şu anda tükendi.
      </p>
    );
  }

  return (
    <div className="add-to-cart-box">
      <div className="cart-qty">
        <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Azalt">
          −
        </button>
        <span>{quantity}</span>
        <button type="button" onClick={() => setQuantity((q) => q + 1)} aria-label="Artır">
          +
        </button>
      </div>
      <button className="btn btn-primary" onClick={handleAdd} disabled={state === "loading"} type="button">
        {state === "loading" ? "Ekleniyor…" : state === "done" ? "Sepete Eklendi ✓" : "Sepete Ekle"}
      </button>
      {message && <span className="account-error" style={{ padding: "6px 10px" }}>{message}</span>}
    </div>
  );
}
