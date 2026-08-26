import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { apiGet } from "@/lib/api-base";

export const dynamic = "force-dynamic";

interface PublicCategory {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  description: string | null;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  productCount?: number;
}
interface CategoriesResponse {
  items: PublicCategory[];
}
interface PublicProduct {
  id: string;
  slug: string;
  name: string;
  unitLabel: string;
  price: {
    base: number;
    final: number;
    discountSource: "campaign" | "sale" | "none";
    discountPercent: number | null;
  };
  inStock: boolean;
}
interface ProductsResponse {
  items: PublicProduct[];
  total: number;
}

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

// Bölüm 25/30 — /kategori/:slug herkese açık, SEO'lu kategori sayfası.
// FAZ 1'in tek-sayfalık ("#kategoriler" modal) deneyimi HİÇ değiştirilmedi
// — bu tamamen YENİ, ek bir derin bağlantı/URL'dir; bozulacak eski bir
// /kategori/... URL'si zaten yoktu (Bölüm 25'in "redirect planı" isteği bu
// yüzden burada gerek yok: kırılan hiçbir şey olmadığından yönlendirme
// tanımlanmadı — bkz. docs/catalog.md URL mimarisi notu).
async function getCategory(slug: string): Promise<{ category: PublicCategory; children: PublicCategory[] } | null> {
  const { items } = await apiGet<CategoriesResponse>("/api/categories");
  const category = items.find((c) => c.slug === slug);
  if (!category) return null;
  const children = items.filter((c) => c.parentId === category.id);
  return { category, children };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const result = await getCategory(params.slug);
  if (!result) return { title: "Kategori bulunamadı" };
  const { category } = result;
  return {
    title: category.seoTitle ?? `${category.title} | B&M Vourla`,
    description: category.seoDescription ?? category.shortDescription ?? undefined,
  };
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const result = await getCategory(params.slug);
  if (!result) notFound();
  const { category, children } = result;

  const productsRes = await apiGet<ProductsResponse>(`/api/products?category=${encodeURIComponent(category.slug)}&pageSize=100`);

  return (
    <>
      <SiteHeader />
      <section className="hero" style={{ minHeight: "38vh", paddingTop: 110 }}>
        <div className="hero-content">
          <p style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 8 }}>
            <a href="/" style={{ color: "inherit" }}>
              Ana Sayfa
            </a>{" "}
            / {category.title}
          </p>
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
                <h2 className="section-title">Alt Kategoriler</h2>
              </div>
              <div className="cat-grid" style={{ marginBottom: 40 }}>
                {children.map((c) => (
                  <a key={c.id} href={`/kategori/${c.slug}`} className="cat-card" style={{ ["--cat-color" as string]: c.color ?? "#E65100" }}>
                    <span className="cat-icon">
                      <i className={`fas ${c.icon ?? "fa-leaf"}`} />
                    </span>
                    <h3>{c.title}</h3>
                    <p>{c.shortDescription}</p>
                  </a>
                ))}
              </div>
            </>
          )}

          <div className="section-header">
            <h2 className="section-title">{productsRes.total} Ürün</h2>
          </div>

          {productsRes.items.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--gray-600)" }}>Bu kategoride henüz ürün yok.</p>
          ) : (
            <ul className="modal-list" style={{ maxWidth: 700, margin: "0 auto" }}>
              {productsRes.items.map((p) => (
                <li key={p.id}>
                  <a href={`/urun/${p.slug}`} className="modal-name" style={{ color: "inherit", textDecoration: "none" }}>
                    {p.name}
                    {!p.inStock && <span className="badge badge-red" style={{ marginLeft: 8 }}>Tükendi</span>}
                  </a>
                  <span className="modal-price">
                    {p.price.discountSource !== "none" && <span className="old-price">{formatTL(p.price.base)}</span>}
                    {formatTL(p.price.final)} {p.unitLabel}
                    {p.price.discountSource === "campaign" && p.price.discountPercent ? (
                      <span className="campaign-badge">-%{p.price.discountPercent}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
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
    </>
  );
}
