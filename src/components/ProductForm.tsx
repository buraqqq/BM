"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_UNITS, PRODUCT_UNIT_LABELS, type ProductUnit } from "@/lib/enums";

interface Category {
  id: string;
  title: string;
  depth: number;
}
interface Brand {
  id: string;
  name: string;
}
interface AttributeDefinition {
  id: string;
  key: string;
  name: string;
  type: string;
  unit: string | null;
  options: string[];
}
interface ProductImage {
  id: string;
  url: string;
  altText: string | null;
  isPrimary: boolean;
  isMobilePrimary: boolean;
  sortOrder: number;
}
interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  priceOverride: number | null;
  stock: number;
  isActive: boolean;
}

interface Props {
  productId?: string;
}

const TABS = [
  { key: "general", label: "Genel" },
  { key: "price", label: "Fiyat" },
  { key: "stock", label: "Stok" },
  { key: "images", label: "Görseller" },
  { key: "variants", label: "Varyantlar" },
  { key: "seo", label: "SEO" },
  { key: "attributes", label: "Özellikler" },
  { key: "visibility", label: "Satış / Görünürlük" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function ProductForm({ productId: initialProductId }: Props) {
  const router = useRouter();
  const [productId, setProductId] = useState<string | undefined>(initialProductId);
  const [tab, setTab] = useState<TabKey>("general");

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [attributeDefs, setAttributeDefs] = useState<AttributeDefinition[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: "",
    categoryId: "",
    brandId: "",
    shortDescription: "",
    description: "",
    unit: "ADET" as ProductUnit,
    price: "",
    compareAtPrice: "",
    salePrice: "",
    costPrice: "",
    taxRate: "20",
    stock: "0",
    minimumStock: "5",
    isActive: true,
    isFeatured: false,
    seoTitle: "",
    seoDescription: "",
  });
  const [attributeValues, setAttributeValues] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(!!initialProductId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.items ?? []));
    fetch("/api/admin/brands")
      .then((r) => r.json())
      .then((d) => setBrands(d.items ?? []));
  }, []);

  const loadAttributeDefs = useCallback((categoryId: string) => {
    if (!categoryId) {
      setAttributeDefs([]);
      return;
    }
    fetch(`/api/admin/attribute-definitions?categoryId=${categoryId}`)
      .then((r) => r.json())
      .then((d) => setAttributeDefs(d.items ?? []));
  }, []);

  const loadImages = useCallback((id: string) => {
    fetch(`/api/admin/products/${id}/images`)
      .then((r) => r.json())
      .then((d) => setImages(d.items ?? []));
  }, []);

  const loadVariants = useCallback((id: string) => {
    fetch(`/api/admin/products/${id}/variants`)
      .then((r) => r.json())
      .then((d) => setVariants(d.items ?? []));
  }, []);

  useEffect(() => {
    if (!productId) return;
    fetch(`/api/admin/products/${productId}`)
      .then((r) => r.json())
      .then((p) => {
        setForm({
          name: p.name,
          sku: p.sku,
          barcode: p.barcode ?? "",
          categoryId: p.categoryId,
          brandId: p.brandId ?? "",
          shortDescription: p.shortDescription ?? "",
          description: p.description ?? "",
          unit: p.unit,
          price: String(p.price),
          compareAtPrice: p.compareAtPrice != null ? String(p.compareAtPrice) : "",
          salePrice: p.salePrice != null ? String(p.salePrice) : "",
          costPrice: p.costPrice != null ? String(p.costPrice) : "",
          taxRate: String(p.taxRate ?? 20),
          stock: String(p.inventory?.quantity ?? 0),
          minimumStock: String(p.inventory?.lowStockThreshold ?? 5),
          isActive: p.isActive,
          isFeatured: p.isFeatured,
          seoTitle: p.seoTitle ?? "",
          seoDescription: p.seoDescription ?? "",
        });
        const av: Record<string, string> = {};
        (p.attributeValues ?? []).forEach((v: { attributeDefinitionId: string; value: string }) => {
          av[v.attributeDefinitionId] = v.value;
        });
        setAttributeValues(av);
        loadAttributeDefs(p.categoryId);
        setLoading(false);
      });
    loadImages(productId);
    loadVariants(productId);
  }, [productId, loadAttributeDefs, loadImages, loadVariants]);

  function onCategoryChange(categoryId: string) {
    setForm({ ...form, categoryId });
    loadAttributeDefs(categoryId);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setWarnings([]);

    const payload = {
      name: form.name,
      sku: form.sku || undefined,
      barcode: form.barcode || null,
      categoryId: form.categoryId,
      brandId: form.brandId || null,
      shortDescription: form.shortDescription || null,
      description: form.description || null,
      unit: form.unit,
      price: Number(form.price),
      compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
      salePrice: form.salePrice ? Number(form.salePrice) : null,
      costPrice: form.costPrice ? Number(form.costPrice) : null,
      taxRate: Number(form.taxRate),
      stock: Number(form.stock),
      minimumStock: Number(form.minimumStock),
      isActive: form.isActive,
      isFeatured: form.isFeatured,
      seoTitle: form.seoTitle || null,
      seoDescription: form.seoDescription || null,
      attributes: Object.entries(attributeValues)
        .filter(([, v]) => v !== "")
        .map(([attributeDefinitionId, value]) => ({ attributeDefinitionId, value })),
    };

    const res = await fetch(productId ? `/api/admin/products/${productId}` : "/api/admin/products", {
      method: productId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? "Kaydedilemedi. Alanları kontrol edin.");
      return;
    }
    const saved = await res.json();
    if (!productId) {
      // Yeni ürün: sayfadan ayrılmadan aynı formda devam et, Görseller/Varyantlar
      // sekmeleri artık kullanılabilir hale gelsin ve URL güncellensin.
      setProductId(saved.id);
      window.history.replaceState(null, "", `/admin/products/${saved.id}`);
    }
    if (saved.duplicateWarnings?.length > 0) {
      setWarnings(saved.duplicateWarnings.map((w: { message: string }) => w.message));
    }
    setNotice("Kaydedildi.");
    router.refresh();
  }

  async function uploadImage(file: File) {
    if (!productId) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", "products");
    const uploadRes = await fetch("/api/admin/upload", { method: "POST", body: fd });
    if (!uploadRes.ok) {
      alert("Görsel yüklenemedi");
      return;
    }
    const { url } = await uploadRes.json();
    await fetch(`/api/admin/products/${productId}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    loadImages(productId);
  }

  async function setPrimaryImage(imageId: string) {
    if (!productId) return;
    await fetch(`/api/admin/products/${productId}/images/${imageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPrimary: true }),
    });
    loadImages(productId);
  }

  async function setMobilePrimaryImage(imageId: string) {
    if (!productId) return;
    await fetch(`/api/admin/products/${productId}/images/${imageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isMobilePrimary: true }),
    });
    loadImages(productId);
  }

  async function updateImageAlt(imageId: string, altText: string) {
    if (!productId) return;
    await fetch(`/api/admin/products/${productId}/images/${imageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ altText: altText || null }),
    });
    loadImages(productId);
  }

  // Bölüm 28 — galeri sıralaması: komşu iki görselin sortOrder'ını takas
  // ederek yukarı/aşağı taşıma. Sunucudan gelen sıralama zaten sortOrder
  // asc olduğu için (bkz. GET /images), yalnızca komşu çift değişir.
  async function moveImage(index: number, direction: -1 | 1) {
    if (!productId) return;
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const a = images[index];
    const b = images[target];
    await Promise.all([
      fetch(`/api/admin/products/${productId}/images/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: b.sortOrder }),
      }),
      fetch(`/api/admin/products/${productId}/images/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: a.sortOrder }),
      }),
    ]);
    loadImages(productId);
  }

  async function deleteImage(imageId: string) {
    if (!productId) return;
    await fetch(`/api/admin/products/${productId}/images/${imageId}`, { method: "DELETE" });
    loadImages(productId);
  }

  async function addVariant() {
    if (!productId) return;
    const name = prompt("Varyant adı (ör. 1kg, Kırmızı):");
    if (!name) return;
    const sku = prompt("Varyant SKU:", `${form.sku}-${name.toUpperCase().replace(/\s+/g, "")}`);
    if (!sku) return;
    const res = await fetch(`/api/admin/products/${productId}/variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sku }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.message ?? "Varyant eklenemedi");
      return;
    }
    loadVariants(productId);
  }

  async function toggleVariant(v: ProductVariant) {
    if (!productId) return;
    await fetch(`/api/admin/products/${productId}/variants/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !v.isActive }),
    });
    loadVariants(productId);
  }

  if (loading) return <p>Yükleniyor…</p>;

  const priceNum = Number(form.price) || 0;
  const costNum = Number(form.costPrice) || 0;
  const margin = costNum > 0 && priceNum > 0 ? ((priceNum - costNum) / priceNum) * 100 : null;
  const marginAbs = costNum > 0 ? priceNum - costNum : null;

  return (
    <form className="admin-card" onSubmit={handleSubmit} style={{ maxWidth: 760 }}>
      <h2 style={{ marginBottom: 10, fontFamily: "var(--font-heading)" }}>{productId ? "Ürünü Düzenle" : "Yeni Ürün"}</h2>

      <div className="product-tabs">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            className={`product-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <div className="tab-panel">
          <div className="form-row">
            <label>Ürün Adı *</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-row" style={{ flex: 1 }}>
              <label>SKU (boş = otomatik)</label>
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} disabled={!!productId} />
            </div>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Barkod</label>
              <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Kategori *</label>
              <select required value={form.categoryId} onChange={(e) => onCategoryChange(e.target.value)}>
                <option value="">Seçin…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {"— ".repeat(c.depth)}
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Marka</label>
              <select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
                <option value="">— Marka yok —</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Birim</label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as ProductUnit })}>
                {PRODUCT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {PRODUCT_UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <label>Kısa Açıklama</label>
            <input value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Uzun Açıklama</label>
            <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
      )}

      {tab === "price" && (
        <div className="tab-panel">
          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Satış Fiyatı (TL) *</label>
              <input required type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Karşılaştırma Fiyatı (eski fiyat)</label>
              <input type="number" step="0.01" min="0" value={form.compareAtPrice} onChange={(e) => setForm({ ...form, compareAtPrice: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Kampanya Dışı Manuel İndirimli Fiyat</label>
              <input type="number" step="0.01" min="0" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: e.target.value })} />
            </div>
            <div className="form-row" style={{ flex: 1 }}>
              <label>KDV (%)</label>
              <input type="number" step="0.01" min="0" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
            </div>
          </div>
          <div className="form-row" style={{ maxWidth: 260 }}>
            <label>Maliyet Fiyatı (yalnızca admin görür)</label>
            <input type="number" step="0.01" min="0" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
          </div>
          {margin !== null && (
            <div className="margin-box">
              <div>
                Maliyet: <strong>{costNum.toLocaleString("tr-TR")} TL</strong>
              </div>
              <div>
                Satış: <strong>{priceNum.toLocaleString("tr-TR")} TL</strong>
              </div>
              <div>
                Brüt fark: <strong>{marginAbs?.toLocaleString("tr-TR")} TL</strong>
              </div>
              <div>
                Marj: <strong style={{ color: margin >= 0 ? "#2E7D32" : "#c0392b" }}>%{margin.toFixed(2)}</strong>
              </div>
              <small style={{ color: "#757575" }}>Bu bilgi yalnızca admin panelinde görünür, müşteri tarafında gösterilmez.</small>
            </div>
          )}
        </div>
      )}

      {tab === "stock" && (
        <div className="tab-panel">
          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Stok Miktarı{productId ? " (değişim için 'Stok' ekranını kullanın)" : ""}</label>
              <input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} disabled={!!productId} />
            </div>
            <div className="form-row" style={{ flex: 1 }}>
              <label>Minimum Stok (düşük stok uyarı eşiği)</label>
              <input type="number" min="0" value={form.minimumStock} onChange={(e) => setForm({ ...form, minimumStock: e.target.value })} />
            </div>
          </div>
          {!productId && (
            <small style={{ color: "#757575" }}>
              Bu, doğrulanması gereken bir başlangıç değeridir — kaydettikten sonra gerçek sayımı "Stok" ekranından girin.
            </small>
          )}
        </div>
      )}

      {tab === "images" && (
        <div className="tab-panel">
          {!productId ? (
            <p style={{ color: "#757575" }}>Görsel eklemek için önce ürünü "Genel" sekmesinden kaydedin.</p>
          ) : (
            <>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
              <p style={{ color: "#757575", fontSize: "0.8rem", marginTop: 6 }}>
                Ana görsel (masaüstü/varsayılan) ve mobil ana görsel ayrı ayrı işaretlenebilir — mobil için ayrı bir
                görsel yüklemek yerine, galerideki uygun bir görsel "Mobilde ana yap" ile seçilir.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14 }}>
                {images.map((img, idx) => (
                  <div key={img.id} className="image-tile">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.altText ?? ""} />
                    <div style={{ position: "absolute", top: 4, left: 4, display: "flex", gap: 4 }}>
                      {img.isPrimary && <span className="badge badge-green">Ana</span>}
                      {img.isMobilePrimary && <span className="badge badge-yellow">Mobil</span>}
                    </div>
                    <input
                      placeholder="Alt metin (SEO / erişilebilirlik)"
                      defaultValue={img.altText ?? ""}
                      onBlur={(e) => updateImageAlt(img.id, e.target.value)}
                      style={{ width: "100%", marginTop: 6, fontSize: "0.75rem", padding: "4px 6px" }}
                    />
                    <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                      <button type="button" className="admin-btn secondary" disabled={idx === 0} onClick={() => moveImage(idx, -1)} title="Yukarı taşı">
                        ↑
                      </button>
                      <button type="button" className="admin-btn secondary" disabled={idx === images.length - 1} onClick={() => moveImage(idx, 1)} title="Aşağı taşı">
                        ↓
                      </button>
                      {!img.isPrimary && (
                        <button type="button" className="admin-btn secondary" onClick={() => setPrimaryImage(img.id)}>
                          Ana yap
                        </button>
                      )}
                      {!img.isMobilePrimary && (
                        <button type="button" className="admin-btn secondary" onClick={() => setMobilePrimaryImage(img.id)}>
                          Mobilde ana yap
                        </button>
                      )}
                      <button type="button" className="admin-btn danger" onClick={() => deleteImage(img.id)}>
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
                {images.length === 0 && <p style={{ color: "#757575" }}>Henüz görsel yok.</p>}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "variants" && (
        <div className="tab-panel">
          {!productId ? (
            <p style={{ color: "#757575" }}>Varyant eklemek için önce ürünü "Genel" sekmesinden kaydedin.</p>
          ) : (
            <>
              <button type="button" className="admin-btn secondary" onClick={addVariant} style={{ marginBottom: 12 }}>
                + Varyant Ekle
              </button>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Ad</th>
                    <th>SKU</th>
                    <th>Fiyat Override</th>
                    <th>Stok</th>
                    <th>Durum</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v) => (
                    <tr key={v.id}>
                      <td>{v.name}</td>
                      <td>{v.sku}</td>
                      <td>{v.priceOverride ?? "—"}</td>
                      <td>{v.stock}</td>
                      <td>{v.isActive ? <span className="badge badge-green">Aktif</span> : <span className="badge badge-red">Pasif</span>}</td>
                      <td>
                        <button type="button" className="admin-btn secondary" onClick={() => toggleVariant(v)}>
                          {v.isActive ? "Pasifleştir" : "Aktifleştir"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {variants.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ color: "#757575" }}>
                        Henüz varyant yok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === "seo" && (
        <div className="tab-panel">
          <div className="form-row">
            <label>SEO Başlık</label>
            <input
              value={form.seoTitle}
              onChange={(e) => setForm({ ...form, seoTitle: e.target.value })}
              placeholder={form.name ? `${form.name} — B&M Vourla` : ""}
            />
          </div>
          <div className="form-row">
            <label>SEO Açıklama</label>
            <textarea
              rows={2}
              value={form.seoDescription}
              onChange={(e) => setForm({ ...form, seoDescription: e.target.value })}
              placeholder={form.shortDescription || "Boş bırakılırsa kısa açıklama kullanılır"}
            />
          </div>
          <small style={{ color: "#757575" }}>
            Boş alanlar otomatik olarak ürün adı/kısa açıklamadan türetilir (Bölüm 29 — öneri gösterilir ama otomatik
            kaydedilmez, siz onaylamadan bu alanlar boş kalır).
          </small>
        </div>
      )}

      {tab === "attributes" && (
        <div className="tab-panel">
          {!form.categoryId ? (
            <p style={{ color: "#757575" }}>Önce "Genel" sekmesinden bir kategori seçin.</p>
          ) : attributeDefs.length === 0 ? (
            <p style={{ color: "#757575" }}>
              Bu kategori için tanımlı özellik yok. "Özellikler" admin sayfasından ekleyebilirsiniz.
            </p>
          ) : (
            attributeDefs.map((def) => (
              <div className="form-row" key={def.id}>
                <label>
                  {def.name} {def.unit ? `(${def.unit})` : ""}
                </label>
                {def.type === "SELECT" ? (
                  <select
                    value={attributeValues[def.id] ?? ""}
                    onChange={(e) => setAttributeValues({ ...attributeValues, [def.id]: e.target.value })}
                  >
                    <option value="">Seçin…</option>
                    {def.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : def.type === "BOOLEAN" ? (
                  <select
                    value={attributeValues[def.id] ?? ""}
                    onChange={(e) => setAttributeValues({ ...attributeValues, [def.id]: e.target.value })}
                  >
                    <option value="">—</option>
                    <option value="true">Evet</option>
                    <option value="false">Hayır</option>
                  </select>
                ) : (
                  <input
                    type={def.type === "NUMBER" ? "number" : "text"}
                    value={attributeValues[def.id] ?? ""}
                    onChange={(e) => setAttributeValues({ ...attributeValues, [def.id]: e.target.value })}
                  />
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "visibility" && (
        <div className="tab-panel">
          <div style={{ display: "flex", gap: 20, marginBottom: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Aktif (sitede görünür)
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
              <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })} />
              Öne çıkan
            </label>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="margin-box" style={{ borderColor: "#FFF3CD" }}>
          <strong style={{ color: "#664D03" }}>Benzer ürün uyarısı (engelleyici değil):</strong>
          {warnings.map((w, i) => (
            <p key={i} style={{ fontSize: "0.8rem", margin: "4px 0" }}>
              {w}
            </p>
          ))}
        </div>
      )}
      {notice && <p style={{ color: "#2E7D32", fontSize: "0.85rem", marginTop: 10 }}>{notice}</p>}
      {error && <p style={{ color: "#c0392b", marginTop: 10 }}>{error}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button type="submit" className="admin-btn" disabled={saving}>
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <a href="/admin/products" className="admin-btn secondary">
          Listeye Dön
        </a>
      </div>
    </form>
  );
}
