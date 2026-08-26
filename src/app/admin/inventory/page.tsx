"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { INVENTORY_MOVEMENT_TYPES, INVENTORY_MOVEMENT_TYPE_LABELS, type InventoryMovementType } from "@/lib/enums";

interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: { title: string };
  stock: number;
  minimumStock: number;
  stockStatus: string;
  verified: boolean;
}

interface Summary {
  lowStockCount: number;
  outOfStockCount: number;
  unverifiedInventoryCount: number;
}

// Bölüm 18/19/20/21/32/45 — Gerçek stok yönetimi ekranı.
// FAZ 1'in placeholder stok verisi ile gerçek (doğrulanmış) stok arasındaki
// farkı görsel olarak açıkça ayırır; hızlı düzeltme artık bir "neden" seçimi
// gerektirir; ayrıca fiziksel Sayım Modu (mutlak miktar + fark önizleme) sunar.
export default function AdminInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"" | "low" | "out" | "unverified">("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Hızlı düzeltme paneli durumu (satır bazında açılır)
  const [adjustRowId, setAdjustRowId] = useState<string | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("1");
  const [adjustSign, setAdjustSign] = useState<"+" | "-">("+");
  const [adjustType, setAdjustType] = useState<InventoryMovementType>("RESTOCK");
  const [adjustReason, setAdjustReason] = useState("");

  // Sayım modu satır durumu
  const [countRowId, setCountRowId] = useState<string | null>(null);
  const [countValue, setCountValue] = useState("");
  const [countReason, setCountReason] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filter) params.set("filter", filter);
    fetch(`/api/admin/inventory?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setSummary(d.summary ?? null);
        setLoading(false);
      });
  }, [search, filter]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  function openAdjust(id: string) {
    setCountRowId(null);
    setAdjustRowId(adjustRowId === id ? null : id);
    setAdjustDelta("1");
    setAdjustSign("+");
    setAdjustType("RESTOCK");
    setAdjustReason("");
  }

  function openCount(id: string, currentStock: number) {
    setAdjustRowId(null);
    setCountRowId(countRowId === id ? null : id);
    setCountValue(String(currentStock));
    setCountReason("");
  }

  async function submitAdjust(productId: string) {
    const n = Number(adjustDelta);
    if (!Number.isFinite(n) || n <= 0) {
      alert("Geçerli bir miktar girin");
      return;
    }
    const delta = adjustSign === "+" ? n : -n;
    setBusyId(productId);
    const res = await fetch(`/api/admin/inventory/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: delta, type: adjustType, reason: adjustReason || undefined }),
    });
    setBusyId(null);
    if (res.ok) {
      setAdjustRowId(null);
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.message ?? "İşlem başarısız");
    }
  }

  async function submitCount(productId: string) {
    const n = Number(countValue);
    if (!Number.isFinite(n) || n < 0) {
      alert("Geçerli bir sayım miktarı girin");
      return;
    }
    setBusyId(productId);
    const res = await fetch(`/api/admin/inventory/${productId}/count`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ countedQuantity: n, reason: countReason || undefined }),
    });
    setBusyId(null);
    if (res.ok) {
      setCountRowId(null);
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.message ?? "İşlem başarısız");
    }
  }

  return (
    <div className="admin-container">
      <div className="stat-cards">
        <div className="stat-card" style={{ borderLeftColor: "#664D03" }}>
          <div className="num">{summary?.unverifiedInventoryCount ?? "…"}</div>
          <div className="label">Doğrulanmayı Bekleyen Stok</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: "#B8860B" }}>
          <div className="num">{summary?.lowStockCount ?? "…"}</div>
          <div className="label">Az Stok</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: "#842029" }}>
          <div className="num">{summary?.outOfStockCount ?? "…"}</div>
          <div className="label">Tükenen Ürün</div>
        </div>
      </div>

      {(summary?.unverifiedInventoryCount ?? 0) > 0 && (
        <div className="admin-card" style={{ background: "#FFF8E1", border: "1px solid #B8860B", marginBottom: 16 }}>
          <strong>⚠ Legacy stoklar doğrulanmayı bekliyor.</strong> FAZ 1'de aktarılan stok sayıları gerçek fiziksel
          sayıma dayanmıyor — sadece eski sistemden aktarılan tahmini başlangıç değerleridir. Aşağıda sarı ile
          işaretli satırlar henüz bir gerçek stok hareketi (satın alma, satış, sayım vb.) görmemiştir. Bu ürünlerde
          "Sayım Modu" ile fiziksel sayım yapılana kadar gösterilen miktar kesin kabul edilmemelidir.
        </div>
      )}

      <div className="admin-card">
        <div className="filters-row">
          <input placeholder="Ürün / SKU / barkod ara…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="">Tüm ürünler</option>
            <option value="low">Az stok</option>
            <option value="out">Tükenen</option>
            <option value="unverified">Doğrulanmamış</option>
          </select>
        </div>
        {loading ? (
          <p>Yükleniyor…</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Ürün</th>
                <th>SKU</th>
                <th>Kategori</th>
                <th>Stok</th>
                <th>Min. Stok</th>
                <th>Durum</th>
                <th>Doğrulama</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <Fragment key={p.id}>
                  <tr className={!p.verified ? "unverified-row" : undefined}>
                    <td>{p.name}</td>
                    <td>{p.sku}</td>
                    <td>{p.category?.title}</td>
                    <td>{p.stock}</td>
                    <td>{p.minimumStock}</td>
                    <td>
                      {p.stockStatus === "IN_STOCK" && <span className="badge badge-green">Stokta</span>}
                      {p.stockStatus === "LOW_STOCK" && <span className="badge badge-yellow">Az</span>}
                      {p.stockStatus === "OUT_OF_STOCK" && <span className="badge badge-red">Tükendi</span>}
                    </td>
                    <td>
                      {p.verified ? (
                        <span className="badge badge-green">Doğrulandı</span>
                      ) : (
                        <span className="badge badge-gray">Bekliyor</span>
                      )}
                    </td>
                    <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="admin-btn secondary" disabled={busyId === p.id} onClick={() => openAdjust(p.id)}>
                        Hızlı Düzelt
                      </button>
                      <button className="admin-btn secondary" disabled={busyId === p.id} onClick={() => openCount(p.id, p.stock)}>
                        Sayım Modu
                      </button>
                    </td>
                  </tr>
                  {adjustRowId === p.id && (
                    <tr>
                      <td colSpan={8}>
                        <div className="count-mode-box">
                          <select value={adjustSign} onChange={(e) => setAdjustSign(e.target.value as "+" | "-")}>
                            <option value="+">Ekle (+)</option>
                            <option value="-">Çıkar (-)</option>
                          </select>
                          <input
                            type="number"
                            min={1}
                            style={{ width: 90 }}
                            value={adjustDelta}
                            onChange={(e) => setAdjustDelta(e.target.value)}
                          />
                          <select value={adjustType} onChange={(e) => setAdjustType(e.target.value as InventoryMovementType)}>
                            {INVENTORY_MOVEMENT_TYPES.filter((t) => t !== "MIGRATION").map((t) => (
                              <option key={t} value={t}>
                                {INVENTORY_MOVEMENT_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </select>
                          <input
                            placeholder="Açıklama (opsiyonel)"
                            style={{ flex: 1, minWidth: 160 }}
                            value={adjustReason}
                            onChange={(e) => setAdjustReason(e.target.value)}
                          />
                          <button className="admin-btn" disabled={busyId === p.id} onClick={() => submitAdjust(p.id)}>
                            Uygula
                          </button>
                          <button className="admin-btn secondary" onClick={() => setAdjustRowId(null)}>
                            İptal
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  {countRowId === p.id && (
                    <tr>
                      <td colSpan={8}>
                        <div className="count-mode-box">
                          <span>Sistem stoğu: <strong>{p.stock}</strong></span>
                          <span>→ Fiziksel sayım:</span>
                          <input
                            type="number"
                            min={0}
                            style={{ width: 100 }}
                            value={countValue}
                            onChange={(e) => setCountValue(e.target.value)}
                          />
                          {(() => {
                            const n = Number(countValue);
                            if (!Number.isFinite(n)) return null;
                            const diff = n - p.stock;
                            return (
                              <span className={diff > 0 ? "count-diff-pos" : diff < 0 ? "count-diff-neg" : "count-diff-zero"}>
                                Fark: {diff > 0 ? `+${diff}` : diff}
                              </span>
                            );
                          })()}
                          <input
                            placeholder="Sayım notu (opsiyonel)"
                            style={{ flex: 1, minWidth: 160 }}
                            value={countReason}
                            onChange={(e) => setCountReason(e.target.value)}
                          />
                          <button className="admin-btn" disabled={busyId === p.id} onClick={() => submitCount(p.id)}>
                            Sayımı Onayla
                          </button>
                          <button className="admin-btn secondary" onClick={() => setCountRowId(null)}>
                            İptal
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
