import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileTabBar } from "@/components/MobileTabBar";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ProductCard, type ProductCardProduct } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";
import { Pagination } from "@/components/Pagination";
import { JsonLd } from "@/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/structured-data";
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
interface CategoriesResponse {
  items: { slug: string; title: string; productCount?: number }[];
}
interface BrandsResponse {
  items: { slug: string; name: string; productCount?: number }[];
}
type Settings = Record<string, string>;

type SearchParams = { [key: string]: string | string[] | undefined };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function buildApiQuery(sp: SearchParams): string {
  const usp = new URLSearchParams();
  const category = first(sp.category);
  const brand = first(sp.brand);
  const minPrice = first(sp.minPrice);
  const maxPrice = first(sp.maxPrice);
  const inStock = first(sp.inStock);
  const sort = first(sp.sort);
  const page = first(sp.page);
  if (category) usp.set("category", category);
  if (brand) usp.set("brand", brand);
  if (minPrice) usp.set("minPrice", minPrice);
  if (maxPrice) usp.set("maxPrice", maxPrice);
  if (inStock === "1") usp.set("inStock", "1");
  if (sort) usp.set("sort", sort);
  usp.set("page", page ?? "1");
  usp.set("pageSize", "24");
  return usp.toString();
}

export function generateMetadata(): Metadata {
  const title = "Tüm Ürünler | B&M Vourla";
  const description = "B&M Vourla'nın tüm bahçe, mangal ve niş ürünlerini filtreleyin, fiyata veya isme göre sıralayın.";
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl("/urunler") },
    openGraph: { title, description, url: absoluteUrl("/urunler"), type: "website" },
  };
}

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const apiQuery = buildApiQuery(searchParams);
  const [productsRes, categoriesRes, brandsRes, settings] = await Promise.all([
    apiGet<ProductsResponse>(`/api/products?${apiQuery}`),
    apiGet<CategoriesResponse>("/api/categories"),
    apiGet<BrandsResponse>("/api/brands"),
    apiGet<Settings>("/api/settings"),
  ]);
  const whatsappNumber = settings.contact_whatsapp ?? "905060557530";

  const category = first(searchParams.category);
  const brand = first(searchParams.brand);
  const minPrice = first(searchParams.minPrice);
  const maxPrice = first(searchParams.maxPrice);
  const inStock = first(searchParams.inStock) === "1";
  const sort = first(searchParams.sort) ?? "relevance";
  const page = Number(first(searchParams.page) ?? "1");
  const hasActiveFilters = !!(category || brand || minPrice || maxPrice || inStock || (sort && sort !== "relevance"));

  const breadcrumb = [
    { label: "Ana Sayfa", href: "/" },
    { label: "Tüm Ürünler", href: "#" },
  ];

  return (
    <>
      <SiteHeader />
      <JsonLd data={buildBreadcrumbJsonLd(breadcrumb)} />

      <Breadcrumb items={breadcrumb} />

      <section className="categories">
        <div className="container">
          <div className="section-header-row">
            <div>
              <h1 className="section-title" style={{ textAlign: "left", fontSize: "1.9rem" }}>
                Tüm Ürünler
              </h1>
              <p className="results-meta">{productsRes.total} ürün bulundu</p>
            </div>
          </div>

          <ProductFilters
            action="/urunler"
            clearHref="/urunler"
            hasActiveFilters={hasActiveFilters}
            brands={brandsRes.items}
            categories={categoriesRes.items}
            sort={sort}
            brand={brand}
            category={category}
            minPrice={minPrice}
            maxPrice={maxPrice}
            inStock={inStock}
          />

          {productsRes.items.length === 0 ? (
            <p className="product-empty">Bu filtrelerle eşleşen ürün bulunamadı.</p>
          ) : (
            <div className="product-grid">
              {productsRes.items.map((p) => (
                <ProductCard key={p.id} product={p} whatsappNumber={whatsappNumber} />
              ))}
            </div>
          )}

          <Pagination
            basePath="/urunler"
            params={{ category, brand, minPrice, maxPrice, inStock: inStock ? "1" : undefined, sort }}
            page={page}
            totalPages={productsRes.totalPages}
          />
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
