"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type AlertType = "STOCK_RESTOCK" | "PRICE_DROP" | "BACK_IN_STOCK";

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  STOCK_RESTOCK: "Stok yenilenince",
  PRICE_DROP: "Fiyat düşünce",
  BACK_IN_STOCK: "Stoğa gelince",
};

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

// ==========================================================
// FAZ 9 — ürün detay sayfasında alarm butonları.
//
// Kullanıcı, stoğu tükenmiş bir ürün için "Stok Gelince Haber Ver", fiyatı
// olan herhangi bir ürün için "Fiyatı Düşünce Haber Ver" alarmı kurabilir.
// Giriş yapmamış kullanıcı /giris'e yönlendirilir (alarm userId gerektirir).
// Tüm yazma işlemleri POST /api/alerts üzerinden yapılır.
// ==========================================================
export function ProductAlertButtons({ productId, inStock, currentPrice }: { productId: string; inStock: boolean; currentPrice: number }) {
  const router = useRouter();
  const { status } = useSession();

  const [priceOpen, setPriceOpen] = useState(false);
  const [targetPrice, setTargetPrice] = useState("");
  const [busy, setBusy] = useState<AlertType | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function ensureAuth(): boolean {
    if (status !== "authenticated") {
      router.push(`/giris?next=${encodeURIComponent(window.location.pathname)}`);
      return false;
    }
    return true;
  }

  async function createAlert(alertType: AlertType, target?: number) {
    if (!ensureAuth()) return;
    setBusy(alertType);
    setMsg(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, alertType, targetPrice: target }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMsg({ type: "err", text: data?.message ?? "Alarm kurulamadı." });
        return;
      }
      setMsg({ type: "ok", text: `${ALERT_TYPE_LABELS[alertType]} bildirimi aktif.` });
      setPriceOpen(false);
      setTargetPrice("");
    } catch {
      setMsg({ type: "err", text: "Bağlantı hatası, tekrar deneyin." });
    } finally {
      setBusy(null);
    }
  }

  async function submitPrice() {
    const price = Number.parseFloat(targetPrice.replace(",", "."));
    if (!Number.isFinite(price) || price <= 0) {
      setMsg({ type: "err", text: "Geçerli bir hedef fiyat girin." });
      return;
    }
    await createAlert("PRICE_DROP", price);
  }

  return (
    <div style={{ marginTop: 4, marginBottom: 20 }}>
      {msg && <p className={msg.type === "ok" ? "account-success" : "account-error"} style={{ margin: "0 0 8px" }}>{msg.text}</p>}

      {/* Fiyat alarmı — fiyatı olan her ürün için */}
      {!priceOpen ? (
        <button type="button" className="btn btn-white" onClick={() => (ensureAuth() ? setPriceOpen(true) : null)} disabled={busy !== null} style={{ marginRight: 8, marginBottom: 8 }}>
          <i className="fas fa-bell" /> Fiyatı Düşünce Haber Ver
        </button>
      ) : (
        <div className="account-card" style={{ padding: 14, marginBottom: 8 }}>
          <label className="account-sub" style={{ display: "block", marginBottom: 6 }}>
            Şu anki fiyat: <strong>{formatTL(currentPrice)} ₺</strong>. Hangi fiyata düşünce haber vereyim?
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input type="number" min="0" step="0.01" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} placeholder="Ör. 250" style={{ maxWidth: 160 }} />
            <button type="button" className="btn btn-primary" onClick={submitPrice} disabled={busy !== null}>
              {busy === "PRICE_DROP" ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button type="button" className="btn btn-white" onClick={() => { setPriceOpen(false); setTargetPrice(""); }} disabled={busy !== null}>
              Vazgeç
            </button>
          </div>
        </div>
      )}

      {/* Stok alarmı — yalnızca ürün tükendiyse */}
      {!inStock && (
        <button type="button" className="btn btn-white" onClick={() => createAlert("BACK_IN_STOCK")} disabled={busy !== null} style={{ marginBottom: 8 }}>
          <i className="fas fa-box-open" /> Stok Gelince Haber Ver
        </button>
      )}
    </div>
  );
}
