import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { apiGet } from "@/lib/api-base";

export const dynamic = "force-dynamic";

interface PublicProductDetail {
  id: string;
  sku: string;
  name: string;
  slug: string;
  category: { id: string; slug: string; title: string };
  brand: { id: string; slug: string; name: string } | null;
  shortDescription: string | null;
  description: string | null;
  unit: string;
  unitLabel: string;
  images: { url: string; alt: string | null; isPrimary: boolean; isMobilePrimary: boolean }[];
  price: {
    base: number;
    final: number;
    compareAt: number | null;
    discountSource: "campaign" | "sale" | "none";
    discountPercent: number | null;
    campaign: { name: string } | null;
  };
  inStock: boolean;
  isFeatured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
}

type Settings = Record<string, string>;

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

// Bölüm 25/30 — /urun/:slug herkese açık, SEO'lu ürün detay sayfası.
// FAZ 1'in tek-sayfalık (kategori modalı) deneyimi değişmedi; bu tamamen
// YENİ, ek bir derin bağlantıdır. Müşteriye asla stok adedi/maliyet/kâr
// marjı gösterilmez — yalnızca "stokta var / tükendi" (bkz. FAZ1/FAZ2
// admin-only fiyatlandırma kuralı).
async function getProduct(slug: string): Promise<PublicProductDetail | null> {
  try {
    return await apiGet<PublicProductDetail>(`/api/products/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const product = await getProduct(params.slug);
  if (!product) return { title: "Ürün bulunamadı" };
  return {
    title: product.seoTitle ?? `${product.name} | B&M Vourla`,
    description: product.seoDescription ?? product.shortDescription ?? undefined,
  };
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const [product, settings] = await Promise.all([
    getProduct(params.slug),
    apiGet<Settings>("/api/settings"),
  ]);
  if (!product) notFound();

  const whatsappNumber = settings.contact_whatsapp ?? "905060557530";
  const discountPct = settings.whatsapp_discount_percent ?? "2";
  const primaryImage = product.images.find((i) => i.isPrimary) ?? product.images[0] ?? null;
  const waMessage = encodeURIComponent(`Merhaba, ${product.name} ürünü hakkında bilgi almak istiyorum.`);

  return (
    <>
      <SiteHeader />
      <section className="hero" style={{ minHeight: "24vh", paddingTop: 110 }}>
        <div className="hero-content">
          <p style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: 8 }}>
            <a href="/" style={{ color: "inherit" }}>
              Ana Sayfa
            </a>{" "}
            /{" "}
            <a href={`/kategori/${product.category.slug}`} style={{ color: "inherit" }}>
              {product.category.title}
            </a>{" "}
            / {product.name}
          </p>
        </div>
      </section>

      <section className="categories">
        <div className="container">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: primaryImage ? "minmax(260px, 420px) 1fr" : "1fr",
              gap: 40,
              maxWidth: 1000,
              margin: "0 auto",
              alignItems: "start",
            }}
          >
            {primaryImage && (
              <div>
                <img
                  src={primaryImage.url}
                  alt={primaryImage.alt ?? product.name}
                  style={{ width: "100%", borderRadius: 12, objectFit: "cover" }}
                />
                {product.images.length > 1 && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {product.images.map((img) => (
                      <img
                        key={img.url}
                        src={img.url}
                        alt={img.alt ?? product.name}
                        style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, opacity: img.isPrimary ? 1 : 0.75 }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              {product.brand && <p style={{ color: "var(--gray-600)", marginBottom: 4 }}>{product.brand.name}</p>}
              <h1 style={{ fontSize: "1.9rem", marginBottom: 8 }}>
                {product.name}
                {product.isFeatured && (
                  <span className="badge" style={{ marginLeft: 10, verticalAlign: "middle" }}>
                    Öne Çıkan
                  </span>
                )}
              </h1>

              {product.shortDescription && (
                <p style={{ color: "var(--gray-600)", marginBottom: 16 }}>{product.shortDescription}</p>
              )}

              <div style={{ marginBottom: 8 }}>
                {!product.inStock && (
                  <span className="badge badge-red" style={{ marginRight: 10 }}>
                    Tükendi
                  </span>
                )}
                {product.inStock && (
                  <span className="badge badge-green" style={{ marginRight: 10 }}>
                    Stokta Var
                  </span>
                )}
              </div>

              <div className="modal-price" style={{ fontSize: "1.6rem", display: "block", marginBottom: 20 }}>
                {product.price.discountSource !== "none" && (
                  <span className="old-price" style={{ marginRight: 10 }}>
                    {formatTL(product.price.base)}
                  </span>
                )}
                {formatTL(product.price.final)} ₺ <span style={{ fontSize: "1rem", fontWeight: 400 }}>/ {product.unitLabel}</span>
                {product.price.discountSource === "campaign" && product.price.discountPercent ? (
                  <span className="campaign-badge" style={{ marginLeft: 10 }}>
                    -%{product.price.discountPercent}
                    {product.price.campaign ? ` ${product.price.campaign.name}` : ""}
                  </span>
                ) : null}
              </div>

              <a
                href={`https://wa.me/${whatsappNumber}?text=${waMessage}`}
                className="btn btn-whatsapp"
                target="_blank"
                rel="noreferrer"
                style={{ marginBottom: 20, display: "inline-flex" }}
              >
                <i className="fab fa-whatsapp" /> WhatsApp ile Sipariş Ver
              </a>
              <p className="hero-promo" style={{ margin: "0 0 24px" }}>
                <i className="fas fa-tag" /> WhatsApp siparişlerinde <strong>%{discountPct} indirim!</strong>
              </p>

              {product.description && (
                <div>
                  <h2 className="section-title" style={{ fontSize: "1.1rem", marginBottom: 8 }}>
                    Ürün Açıklaması
                  </h2>
                  <p style={{ color: "var(--gray-700)", whiteSpace: "pre-line" }}>{product.description}</p>
                </div>
              )}

              <p style={{ marginTop: 24, fontSize: "0.8rem", color: "var(--gray-500)" }}>SKU: {product.sku}</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-bottom">
            <p>
              <a href={`/kategori/${product.category.slug}`}>← {product.category.title} kategorisine dön</a>
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
