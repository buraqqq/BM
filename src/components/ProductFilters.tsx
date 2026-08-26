"use client";

import { useRef } from "react";

export interface FilterBrandOption {
  slug: string;
  name: string;
  productCount?: number;
}

export interface FilterCategoryOption {
  slug: string;
  title: string;
  productCount?: number;
}

export interface ProductFiltersProps {
  /** Formun GET ile submit edileceği path (ör. "/urunler", "/kategori/baharat", "/arama"). */
  action: string;
  /** Bu sayfada URL'de sabit kalması gereken, kullanıcıya görünmeyen alanlar (ör. arama sayfasında "q"). */
  hiddenParams?: Record<string, string | undefined>;
  /** "Filtreleri Temizle" linkinin gideceği URL. */
  clearHref: string;
  hasActiveFilters: boolean;
  brands: FilterBrandOption[];
  sort: string;
  brand?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: boolean;
  /** Yalnızca /urunler gibi kategoriye özel olmayan sayfalarda geçilir — /kategori/:slug zaten tek bir kategoriye kilitli. */
  categories?: FilterCategoryOption[];
  category?: string;
}

/**
 * FAZ 3 — Bölüm 2/3: sıralama + marka/fiyat/stok filtresi. Bilinçli olarak
 * bir GET <form> — JS olmadan da (native submit ile) çalışır; select'lerde
 * `requestSubmit()` yalnızca "seçince otomatik uygulansın" UX'i için bir
 * gelişmedir (kademeli iyileştirme — progressive enhancement), zorunlu
 * değildir. Bkz. src/lib/search.ts (sunucu tarafı sorgu mantığı).
 */
export function ProductFilters({
  action,
  hiddenParams = {},
  clearHref,
  hasActiveFilters,
  brands,
  sort,
  brand,
  minPrice,
  maxPrice,
  inStock,
  categories,
  category,
}: ProductFiltersProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} method="GET" action={action} className="filters-bar" aria-label="Ürün filtreleri">
      {Object.entries(hiddenParams).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null
      )}

      {categories && categories.length > 0 && (
        <div className="filter-field">
          <label htmlFor="category-select">Kategori</label>
          <select id="category-select" name="category" defaultValue={category ?? ""} onChange={() => formRef.current?.requestSubmit()}>
            <option value="">Tüm Kategoriler</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.title}
                {c.productCount !== undefined ? ` (${c.productCount})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="filter-field">
        <label htmlFor="sort-select">Sırala</label>
        <select id="sort-select" name="sort" defaultValue={sort} onChange={() => formRef.current?.requestSubmit()}>
          <option value="relevance">Önerilen</option>
          <option value="newest">En Yeni</option>
          <option value="price_asc">Fiyat: Düşükten Yükseğe</option>
          <option value="price_desc">Fiyat: Yüksekten Düşüğe</option>
          <option value="name_asc">İsim (A-Z)</option>
        </select>
      </div>

      {brands.length > 0 && (
        <div className="filter-field">
          <label htmlFor="brand-select">Marka</label>
          <select id="brand-select" name="brand" defaultValue={brand ?? ""} onChange={() => formRef.current?.requestSubmit()}>
            <option value="">Tüm Markalar</option>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
                {b.productCount !== undefined ? ` (${b.productCount})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="filter-field filter-price">
        <label htmlFor="minPrice-input">Fiyat Aralığı (₺)</label>
        <div className="filter-price-inputs">
          <input id="minPrice-input" type="number" inputMode="decimal" name="minPrice" placeholder="Min" defaultValue={minPrice ?? ""} min={0} />
          <span>–</span>
          <input type="number" inputMode="decimal" name="maxPrice" placeholder="Max" defaultValue={maxPrice ?? ""} min={0} />
        </div>
      </div>

      <label className="filter-checkbox">
        <input type="checkbox" name="inStock" value="1" defaultChecked={inStock} />
        Yalnızca stokta olanlar
      </label>

      <div className="filter-actions">
        <button type="submit" className="btn btn-primary">
          Filtrele
        </button>
        {hasActiveFilters && (
          <a href={clearHref} className="filter-clear">
            Filtreleri Temizle
          </a>
        )}
      </div>
    </form>
  );
}
