import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileTabBar } from "@/components/MobileTabBar";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ProductCard, type ProductCardProduct } from "@/components/ProductCard";
import { ProductFilters } from "@/components/ProductFilters";
import { Pagination } from "@/components/Pagination";
import { JsonLd } from "@/components/JsonLd";
import { buildBreadcrumbJsonLd } from "@/lib/structured-data";
import { buildCategoryBreadcrumb, type BreadcrumbCategory } from "@/lib/breadcrumb";
import { apiGet } from "@/lib/api-base";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface PublicCategory extends BreadcrumbCategory {
  shortDescription: string | null;
  description: string | null;
  icon: string | null;
  color: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  productCount?: number;
}
interface CategoriesResponse {
  items: PublicCategory[];
}
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

// FAZ 2.1 QA notunda bırakılan CATEGORY TREE PRODUCT AGGREGATION TODO'su
// burada çözüldü: `subtree=1` ile /api/products artık getCategorySubtreeIds
// kullanarak seçilen kategori + TÜM alt kategorilerindeki ürünleri getiriyor
// (bkz. src/lib/search.ts, src/app/api/products/route.ts). "Alt
// Kategoriler" bölümü hâlâ yalnızca DOĞRUDAN alt kategorileri listeliyor —
// bu kasıtlı ve standart bir e-ticaret deseni (A sayfası B'yi gösterir, C'yi
// görmek için B'ye girilir); asıl eksik olan "A'nın ürün listesi C'deki
// ürünleri hiç göstermiyordu" sorunuydu, o artık giderildi.
async function getCategory(slug: string): Promise<{ category: PublicCategory; children: PublicCategory[]; all: PublicCategory[] } | null> {
  const { items } = await apiGet<CategoriesResponse>("/api/categories");
  const category = items.find((c) => c.slug === slug);
  if (!category) return null;
  const children = items.filter((c) => c.parentId === category.id);
  return { category, children, all: items };
}

function buildApiQuery(slug: string, sp: SearchParams): string {
  const usp = new URLSearchParams();
  usp.set("category", slug);
  usp.set("subtree", "1");
  const brand = first(sp.brand);
  const minPrice = first(sp.minPrice);
  const maxPrice = first(sp.maxPrice);
  const inStock = first(sp.inStock);
  const sort = first(sp.sort);
  const page = first(sp.page);
  if (brand) usp.set("brand", brand);
  if (minPrice) usp.set("minPrice", minPrice);
  if (maxPrice) usp.set("maxPrice", maxPrice);
  if (inStock === "1") usp.set("inStock", "1");
  if (sort) usp.set("sort", sort);
  usp.set("page", page ?? "1");
  usp.set("pageSize", "24");
  return usp.toString();
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const result = await getCategory(params.slug);
  if (!result) return { title: "Kategori bulunamadı" };
  const { category } = result;
  const title = category.seoTitle ?? `${category.title} | B&M Vourla`;
  const description = category.seoDescription ?? category.shortDescription ?? undefined;
  const url = absoluteUrl(`/kategori/${category.slug}`);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
  };
}

export default async function CategoryPage({ params, searchParams }: { params: { slug: string }; searchParams: SearchParams }) {
  const result = await getCategory(params.slug);
  if (!result) notFound();
  const { category, children, all } = result;

  const apiQuery = buildApiQuery(category.slug, searchParams);
  const [productsRes, brandsRes, settings] = await Promise.all([
    apiGet<ProductsResponse>(`/api/products?${apiQuery}`),
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
  const categoryPath = `/kategori/${category.slug}`;

  const breadcrumb = buildCategoryBreadcrumb(all, category.id);

  return (
    <>
      <SiteHeader />
      <JsonLd data={buildBreadcrumbJsonLd(breadcrumb)} />

      <Breadcrumb items={breadcrumb} />

      <section className="hero" style={{ minHeight: "32vh", paddingTop: 30 }}>
        <div className="hero-content">
          <div className="hero-brand" style={{ fontSize: "2.6rem" }}>
            <i className={`fas ${category.icon ?? "fa-leaf"}`} /> {category.title}
          </div>
          {category.description && <p className="hero-subtitle">{category.description}</p>}
        </div>
      </section>

      <section className="categories">
        <div className="container">
          {children.length > 0 && (
            <>
              <div className="section-header">
                <h2 className="section-title" style={{ fontSize: "1.4rem" }}>
                  Alt Kategoriler
                </h2>
              </div>
              <div className="subcat-list">
                {children.map((c) => (
                  <a key={c.id} href={`/kategori/${c.slug}`} className="subcat-chip">
                    <i className={`fas ${c.icon ?? "fa-leaf"}`} /> {c.title}
                    {c.productCount !== undefined ? ` (${c.productCount})` : ""}
                  </a>
                ))}
              </div>
            </>
          )}

          <div className="section-header-row">
            <p className="results-meta">{productsRes.total} ürün (alt kategoriler dahil)</p>
          </div>

          <ProductFilters
            action={categoryPath}
            clearHref={categoryPath}
            hasActiveFilters={hasActiveFilters}
            brands={brandsRes.items}
            sort={sort}
            brand={brand}
            minPrice={minPrice}
            maxPrice={maxPrice}
            inStock={inStock}
          />

          {productsRes.items.length === 0 ? (
            <p className="product-empty">Bu kategoride (ve alt kategorilerinde) henüz ürün yok.</p>
          ) : (
            <div className="product-grid">
              {productsRes.items.map((p) => (
                <ProductCard key={p.id} product={p} whatsappNumber={whatsappNumber} />
              ))}
            </div>
          )}

          <Pagination
            basePath={categoryPath}
            params={{ brand, minPrice, maxPrice, inStock: inStock ? "1" : undefined, sort }}
            page={page}
            totalPages={productsRes.totalPages}
          />
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-bottom">
            <p>
              <a href="/">← Tüm kategorilere dön</a>
            </p>
          </div>
        </div>
      </footer>
      <MobileTabBar whatsappNumber={whatsappNumber} />
    </>
  );
}
