"use client";

import { useEffect, useState, Fragment } from "react";

interface Category {
  id: string;
  title: string;
}
interface CampaignProductRef {
  productId: string;
  product: { id: string; name: string; sku: string; price?: number };
}
interface Campaign {
  id: string;
  name: string;
  discountType: string;
  discountValue: number;
  scope: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isCurrentlyActive: boolean;
  category?: { title: string } | null;
  products?: CampaignProductRef[];
}
interface AdminProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
}
interface PriceDecisionCandidate {
  source: "sale" | "campaign";
  label: string;
  campaignId: string | null;
  scope: string | null;
  resultingPrice: number;
  isWinner: boolean;
}
interface PriceDecisionExplanation {
  basePrice: number;
  winner: {
    finalPrice: number;
    discountSource: "campaign" | "sale" | "none";
    appliedCampaign: { id: string; name: string } | null;
  };
  candidates: PriceDecisionCandidate[];
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const SCOPE_LABELS: Record<string, string> = {
  GLOBAL: "Tüm ürünler",
  CATEGORY: "Kategori",
  PRODUCT: "Seçili ürünler",
};

export default function AdminCampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    discountType: "PERCENTAGE" as "PERCENTAGE" | "FIXED_AMOUNT",
    discountValue: "20",
    scope: "GLOBAL" as "GLOBAL" | "CATEGORY" | "PRODUCT",
    categoryId: "",
    startDate: toInputDate(new Date()),
    endDate: toInputDate(new Date(Date.now() + 10 * 86400000)),
    bannerText: "",
  });

  // PRODUCT kapsamı için: arama + çoklu seçim + temizle (Bölüm 16)
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<AdminProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<AdminProduct[]>([]);

  // Kampanya detay/ürün yönetimi satırı (var olan PRODUCT kapsamlı kampanyaya
  // sonradan ürün ekleme/çıkarma)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [manageSearch, setManageSearch] = useState("");
  const [manageResults, setManageResults] = useState<AdminProduct[]>([]);
  const [manageBusy, setManageBusy] = useState(false);

  // Bölüm 17 — Kampanya çakışma açıklaması aracı
  const [checkSearch, setCheckSearch] = useState("");
  const [checkResults, setCheckResults] = useState<AdminProduct[]>([]);
  const [checkProductId, setCheckProductId] = useState<string | null>(null);
  const [checkExplanation, setCheckExplanation] = useState<PriceDecisionExplanation | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);

  function load() {
    setLoading(true);
    fetch("/api/admin/campaigns")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.items ?? []));
  }, []);

  useEffect(() => {
    if (!productSearch.trim()) {
      setProductResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/products?search=${encodeURIComponent(productSearch)}&pageSize=20`)
        .then((r) => r.json())
        .then((d) => setProductResults(d.items ?? []));
    }, 250);
    return () => clearTimeout(t);
  }, [productSearch]);

  useEffect(() => {
    if (!manageSearch.trim()) {
      setManageResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/products?search=${encodeURIComponent(manageSearch)}&pageSize=20`)
        .then((r) => r.json())
        .then((d) => setManageResults(d.items ?? []));
    }, 250);
    return () => clearTimeout(t);
  }, [manageSearch]);

  useEffect(() => {
    if (!checkSearch.trim()) {
      setCheckResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/products?search=${encodeURIComponent(checkSearch)}&pageSize=20`)
        .then((r) => r.json())
        .then((d) => setCheckResults(d.items ?? []));
    }, 250);
    return () => clearTimeout(t);
  }, [checkSearch]);

  function toggleSelectProduct(p: AdminProduct) {
    setSelectedProducts((prev) => (prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.scope === "PRODUCT" && selectedProducts.length === 0) {
      setError("PRODUCT kapsamı için en az bir ürün seçmelisiniz");
      return;
    }
    const res = await fetch("/api/admin/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        scope: form.scope,
        categoryId: form.scope === "CATEGORY" ? form.categoryId : undefined,
        productIds: form.scope === "PRODUCT" ? selectedProducts.map((p) => p.id) : undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        bannerText: form.bannerText || undefined,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.message ?? JSON.stringify(d.details) ?? "Kampanya oluşturulamadı");
      return;
    }
    setForm({ ...form, name: "", bannerText: "" });
    setSelectedProducts([]);
    setProductSearch("");
    load();
  }

  async function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id);
    setManageSearch("");
    setManageResults([]);
  }

  async function addProductToCampaign(campaignId: string, productId: string) {
    setManageBusy(true);
    await fetch(`/api/admin/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ add: [productId] }),
    });
    setManageBusy(false);
    load();
  }

  async function removeProductFromCampaign(campaignId: string, productId: string) {
    setManageBusy(true);
    await fetch(`/api/admin/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remove: [productId] }),
    });
    setManageBusy(false);
    load();
  }

  async function runPriceCheck(productId: string) {
    setCheckProductId(productId);
    setCheckBusy(true);
    setCheckExplanation(null);
    const res = await fetch(`/api/admin/products/${productId}/price-explain`);
    setCheckBusy(false);
    if (res.ok) setCheckExplanation(await res.json());
  }

  return (
    <div className="admin-container">
      <div className="admin-card">
        <h2 style={{ marginBottom: 14, fontFamily: "var(--font-heading)" }}>Yeni Kampanya</h2>
        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="form-row" style={{ flex: 2, minWidth: 200 }}>
              <label>Kampanya Adı *</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Yaz Bahçe Fırsatları" />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
              <label>İndirim Tipi</label>
              <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as "PERCENTAGE" | "FIXED_AMOUNT" })}>
                <option value="PERCENTAGE">Yüzde (%)</option>
                <option value="FIXED_AMOUNT">Sabit Tutar (TL)</option>
              </select>
            </div>
            <div className="form-row" style={{ width: 100 }}>
              <label>Değer</label>
              <input type="number" min="0" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
              <label>Kapsam</label>
              <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as "GLOBAL" | "CATEGORY" | "PRODUCT" })}>
                <option value="GLOBAL">Tüm ürünler</option>
                <option value="CATEGORY">Belirli kategori (+ alt kategoriler)</option>
                <option value="PRODUCT">Seçili ürünler</option>
              </select>
            </div>
            {form.scope === "CATEGORY" && (
              <div className="form-row" style={{ flex: 1, minWidth: 180 }}>
                <label>Kategori</label>
                <select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Seçin…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
              <label>Başlangıç</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 140 }}>
              <label>Bitiş</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>

          {form.scope === "PRODUCT" && (
            <div className="form-row">
              <label>Ürünler *</label>
              <div className="filters-row">
                <input
                  placeholder="Ürün / SKU ara ve listeden ekleyin…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                {selectedProducts.length > 0 && (
                  <button type="button" className="admin-btn secondary" onClick={() => setSelectedProducts([])}>
                    Seçimi Temizle ({selectedProducts.length})
                  </button>
                )}
              </div>
              {productResults.length > 0 && (
                <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--gray-200)", borderRadius: 8, marginBottom: 8 }}>
                  {productResults.map((p) => (
                    <label key={p.id} style={{ display: "flex", gap: 8, padding: "6px 10px", alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={selectedProducts.some((x) => x.id === p.id)} onChange={() => toggleSelectProduct(p)} />
                      <span style={{ flex: 1 }}>{p.name}</span>
                      <span style={{ color: "var(--gray-600)", fontSize: "0.8rem" }}>{p.sku} · {p.price} TL</span>
                    </label>
                  ))}
                </div>
              )}
              {selectedProducts.length > 0 && (
                <p style={{ fontSize: "0.85rem", color: "var(--gray-800)" }}>Seçili: {selectedProducts.map((p) => p.name).join(", ")}</p>
              )}
            </div>
          )}

          <div className="form-row">
            <label>Banner Metni (opsiyonel)</label>
            <input value={form.bannerText} onChange={(e) => setForm({ ...form, bannerText: e.target.value })} placeholder="Yaz Bahçe Fırsatları — Seçili ürünlerde %20 indirim!" />
          </div>

          {error && <p style={{ color: "#c0392b", marginBottom: 10 }}>{error}</p>}
          <button type="submit" className="admin-btn">
            Kampanyayı Oluştur
          </button>
        </form>
      </div>

      <div className="admin-card">
        <h2 style={{ marginBottom: 14, fontFamily: "var(--font-heading)" }}>Fiyat Çakışma Kontrolü (Bölüm 17)</h2>
        <p style={{ fontSize: "0.85rem", color: "var(--gray-600)", marginBottom: 10 }}>
          Bir ürün için o an geçerli TÜM kampanyaları (global + kategori + ürün özel), hangisinin uygulandığını ve
          neden diğerlerinin kazanmadığını gösterir — böylece hiçbir ürün için belirsiz/çelişkili bir fiyat ortaya
          çıkmaz.
        </p>
        <input placeholder="Ürün / SKU ara…" value={checkSearch} onChange={(e) => setCheckSearch(e.target.value)} style={{ marginBottom: 10 }} />
        {checkResults.length > 0 && !checkExplanation && (
          <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--gray-200)", borderRadius: 8, marginBottom: 10 }}>
            {checkResults.map((p) => (
              <div
                key={p.id}
                onClick={() => runPriceCheck(p.id)}
                style={{ padding: "6px 10px", cursor: "pointer", display: "flex", justifyContent: "space-between" }}
                className="check-result-row"
              >
                <span>{p.name}</span>
                <span style={{ color: "var(--gray-600)", fontSize: "0.8rem" }}>{p.sku} · {p.price} TL</span>
              </div>
            ))}
          </div>
        )}
        {checkBusy && <p>Hesaplanıyor…</p>}
        {checkExplanation && checkProductId && (
          <div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <span className="badge badge-green">
                Uygulanan fiyat: {checkExplanation.winner.finalPrice} TL
                {checkExplanation.winner.appliedCampaign ? ` (${checkExplanation.winner.appliedCampaign.name})` : ""}
              </span>
              <button className="admin-btn secondary" onClick={() => { setCheckExplanation(null); setCheckProductId(null); setCheckSearch(""); }}>
                Kapat
              </button>
            </div>
            {checkExplanation.candidates.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--gray-600)" }}>
                Bu ürün için şu an geçerli hiçbir kampanya/indirim yok — normal fiyat ({checkExplanation.basePrice} TL) uygulanıyor.
              </p>
            ) : (
              <table className="admin-table price-decision-table">
                <thead>
                  <tr>
                    <th>Kaynak</th>
                    <th>Kapsam</th>
                    <th>Üretilen Fiyat</th>
                    <th>Sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  {checkExplanation.candidates.map((c, i) => (
                    <tr key={i} style={c.isWinner ? { background: "#DFF0D8" } : undefined}>
                      <td>{c.label}</td>
                      <td>{c.scope ? SCOPE_LABELS[c.scope] ?? c.scope : "—"}</td>
                      <td>{c.resultingPrice} TL</td>
                      <td>
                        {c.isWinner ? (
                          <span className="badge badge-green">✓ Kazandı</span>
                        ) : (
                          <span className="badge badge-gray">Uygulanmadı</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="admin-card">
        {loading ? (
          <p>Yükleniyor…</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Kampanya</th>
                <th>İndirim</th>
                <th>Kapsam</th>
                <th>Tarih Aralığı</th>
                <th>Durum</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <Fragment key={c.id}>
                  <tr>
                    <td>{c.name}</td>
                    <td>{c.discountType === "PERCENTAGE" ? `%${c.discountValue}` : `${c.discountValue} TL`}</td>
                    <td>
                      {SCOPE_LABELS[c.scope] ?? c.scope}
                      {c.scope === "CATEGORY" && c.category ? ` — ${c.category.title}` : ""}
                      {c.scope === "PRODUCT" ? ` (${c.products?.length ?? 0} ürün)` : ""}
                    </td>
                    <td>
                      {c.startDate.slice(0, 10)} → {c.endDate.slice(0, 10)}
                    </td>
                    <td>
                      {c.isCurrentlyActive ? (
                        <span className="badge badge-green">Şu an aktif</span>
                      ) : c.isActive ? (
                        <span className="badge badge-yellow">Tarih dışı</span>
                      ) : (
                        <span className="badge badge-red">Kapalı</span>
                      )}
                    </td>
                    <td>
                      {c.scope === "PRODUCT" && (
                        <button className="admin-btn secondary" onClick={() => toggleExpand(c.id)}>
                          {expandedId === c.id ? "Kapat" : "Ürünleri Yönet"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === c.id && (
                    <tr>
                      <td colSpan={6}>
                        <div style={{ padding: 10, background: "var(--gray-50)", borderRadius: 8 }}>
                          <p style={{ fontWeight: 700, marginBottom: 8 }}>Kampanyadaki Ürünler ({c.products?.length ?? 0})</p>
                          {(c.products ?? []).length === 0 ? (
                            <p style={{ fontSize: "0.85rem", color: "var(--gray-600)", marginBottom: 10 }}>Henüz ürün eklenmedi.</p>
                          ) : (
                            <ul style={{ listStyle: "none", marginBottom: 10 }}>
                              {(c.products ?? []).map((cp) => (
                                <li key={cp.productId} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                                  <span>{cp.product.name} ({cp.product.sku})</span>
                                  <button
                                    className="admin-btn danger"
                                    style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                                    disabled={manageBusy}
                                    onClick={() => removeProductFromCampaign(c.id, cp.productId)}
                                  >
                                    Çıkar
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                          <input
                            placeholder="Eklenecek ürün / SKU ara…"
                            value={manageSearch}
                            onChange={(e) => setManageSearch(e.target.value)}
                            style={{ marginBottom: 8 }}
                          />
                          {manageResults.length > 0 && (
                            <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--gray-200)", borderRadius: 8 }}>
                              {manageResults
                                .filter((p) => !(c.products ?? []).some((cp) => cp.productId === p.id))
                                .map((p) => (
                                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px" }}>
                                    <span>{p.name} ({p.sku})</span>
                                    <button
                                      className="admin-btn secondary"
                                      style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                                      disabled={manageBusy}
                                      onClick={() => addProductToCampaign(c.id, p.id)}
                                    >
                                      Ekle
                                    </button>
                                  </div>
                                ))}
                            </div>
                          )}
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
