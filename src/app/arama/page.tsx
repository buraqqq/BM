import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileTabBar } from "@/components/MobileTabBar";
import { Breadcrumb } from "@/components/Breadcrumb";
import { SearchBar } from "@/components/SearchBar";
import { ProductCard, type ProductCardProduct } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";
import { Pagination } from "@/components/Pagination";
import { apiGet } from "@/lib/api-base";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface ProductsResponse {
  items: ProductCardProduct[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
interface BrandsResponse {
  items: { slug: string; name: string; productCount?: number }[];
}
type Settings = Record<string, string>;
type SearchParams = { [key: string]: string | string[] | undefined };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// FAZ 3 — Bölüm 5: ürün adı, SKU, marka, kategori üzerinde arama. Sorgu
// mantığı src/lib/search.ts'te (buildProductSearchWhere) — bu sayfa yalnızca
// o modülün ürettiği /api/products sonucunu render eder. AI destekli aramaya
// geçiş, bu route değişmeden, yalnızca search.ts içindeki where üretimi
// (veya sonrasına eklenecek bir yeniden-sıralama adımı) değiştirilerek
// yapılabilir (bkz. search.ts başlık yorumu).
function buildApiQuery(sp: SearchParams): string {
  const usp = new URLSearchParams();
  const q = first(sp.q);
  const brand = first(sp.brand);
  const minPrice = first(sp.minPrice);
  const maxPrice = first(sp.maxPrice);
  const inStock = first(sp.inStock);
  const sort = first(sp.sort);
  const page = first(sp.page);
  if (q) usp.set("search", q);
  if (brand) usp.set("brand", brand);
  if (minPrice) usp.set("minPrice", minPrice);
  if (maxPrice) usp.set("maxPrice", maxPrice);
  if (inStock === "1") usp.set("inStock", "1");
  if (sort) usp.set("sort", sort);
  usp.set("page", page ?? "1");
  usp.set("pageSize", "24");
  return usp.toString();
}

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  const q = first(searchParams.q);
  const title = q ? `"${q}" için arama sonuçları | B&M Vourla` : "Ürün Ara | B&M Vourla";
  return {
    title,
    description: "B&M Vourla kataloğunda ürün adı, SKU, marka veya kategoriye göre arama yapın.",
    alternates: { canonical: absoluteUrl("/arama") },
    robots: { index: false, follow: true }, // arama sonucu sayfaları indexlenmez — Bölüm 7 sitemap notu
  };
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const q = first(searchParams.q) ?? "";
  const apiQuery = buildApiQuery(searchParams);
  const [productsRes, brandsRes, settings] = await Promise.all([
    q ? apiGet<ProductsResponse>(`/api/products?${apiQuery}`) : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 24, totalPages: 0 }),
    apiGet<BrandsResponse>("/api/brands"),
    apiGet<Settings>("/api/settings"),
  ]);
  const whatsappNumber = settings.contact_whatsapp ?? "905060557530";

  const brand = first(searchParams.brand);
  const minPrice = first(searchParams.minPrice);
  const maxPrice = first(searchParams.maxPrice);
  const inStock = first(searchParams.inStock) === "1";
  const sort = first(searchParams.sort) ?? "relevance";
  const page = Number(first(searchParams.page) ?? "1");
  const hasActiveFilters = !!(brand || minPrice || maxPrice || inStock || (sort && sort !== "relevance"));

  const breadcrumb = [
    { label: "Ana Sayfa", href: "/" },
    { label: "Arama", href: "#" },
  ];

  return (
    <>
      <SiteHeader />
      <Breadcrumb items={breadcrumb} />

      <section className="categories">
        <div className="container">
          <div className="section-header">
            <h1 className="section-title">Ürün Ara</h1>
            <p className="section-desc">Ürün adı, SKU, marka veya kategoriye göre arayın.</p>
          </div>

          <SearchBar defaultValue={q} compact />

          {!q ? (
            <p className="product-empty">Aramak için yukarıya bir kelime yazın.</p>
          ) : (
            <>
              <p className="results-meta">
                &quot;{q}&quot; için {productsRes.total} sonuç
              </p>

              <ProductFilters
                action="/arama"
                hiddenParams={{ q }}
                clearHref={`/arama?q=${encodeURIComponent(q)}`}
                hasActiveFilters={hasActiveFilters}
                brands={brandsRes.items}
                sort={sort}
                brand={brand}
                minPrice={minPrice}
                maxPrice={maxPrice}
                inStock={inStock}
              />

              {productsRes.items.length === 0 ? (
                <p className="product-empty">Aramanızla eşleşen ürün bulunamadı. Farklı bir kelime deneyin.</p>
              ) : (
                <div className="product-grid">
                  {productsRes.items.map((p) => (
                    <ProductCard key={p.id} product={p} whatsappNumber={whatsappNumber} />
                  ))}
                </div>
              )}

              <Pagination
                basePath="/arama"
                params={{ q, brand, minPrice, maxPrice, inStock: inStock ? "1" : undefined, sort }}
                page={page}
                totalPages={productsRes.totalPages}
              />
            </>
          )}
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-bottom">
            <p>
              <a href="/">← Ana sayfaya dön</a>
            </p>
          </div>
        </div>
      </footer>
      <MobileTabBar whatsappNumber={whatsappNumber} />
    </>
  );
}
