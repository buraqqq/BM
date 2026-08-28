import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { MobileTabBar } from "@/components/MobileTabBar";
import { CategoryGrid, type PublicCategory, type PublicProduct } from "@/components/CategoryGrid";
import { ProductCard, type ProductCardProduct } from "@/components/ProductCard";
import { apiGet } from "@/lib/api-base";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

interface ProductsResponse {
  items: (ProductCardProduct & PublicProduct & { category: { slug: string; title: string }; createdAt?: string })[];
  total: number;
}
interface CategoriesResponse {
  items: PublicCategory[];
}
interface BannersResponse {
  items: { id: string; title: string; subtitle: string | null; ctaText: string | null; ctaLink: string | null }[];
}
interface CampaignsResponse {
  items: { id: string; name: string; bannerText: string | null; ctaText: string | null; ctaLink: string | null }[];
}
type Settings = Record<string, string>;

export function generateMetadata(): Metadata {
  const title = "B&M Vourla – Bahçe & Mangal | Urla Altıntaş | 0506 055 75 30";
  const description =
    "Altıntaş Mah. Besim Uyal Cad. No:121/A Urla/İzmir'de mangal, bahçe dekorasyonu, aydınlatma, ısıtma, soğutma ve niş ürünler.";
  const url = absoluteUrl("/");
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
  };
}

// FAZ 3 — Bölüm 1: kategori sayısı sabit (7) olduğu için tüm aktif ürünler
// tek seferde çekilip (gerekirse birden fazla sayfa halinde, mevcut FAZ2
// deseniyle aynı) bellekte hem kategori-modalı gruplaması hem de öne çıkan/
// yeni/indirimli vitrinler için filtrelenir — 257 ürün ölçeğinde 3 ayrı API
// çağrısı yerine tek bir veri setinin yeniden kullanılması daha basit ve
// daha az istek anlamına geliyor. 10.000+ ürüne çıkıldığında bu vitrinler
// kendi `/api/products?featured=1` vb. çağrılarına ayrılmalı (bkz. docs).
export default async function HomePage() {
  const [categoriesRes, productsRes, settings, bannersRes, campaignsRes] = await Promise.all([
    apiGet<CategoriesResponse>("/api/categories"),
    apiGet<ProductsResponse>("/api/products?pageSize=100"),
    apiGet<Settings>("/api/settings"),
    apiGet<BannersResponse>("/api/banners"),
    apiGet<CampaignsResponse>("/api/campaigns"),
  ]);

  const allProducts: ProductsResponse["items"] = [...productsRes.items];
  if (productsRes.total > allProducts.length) {
    const remaining = await apiGet<ProductsResponse>(`/api/products?pageSize=${productsRes.total}`);
    allProducts.splice(0, allProducts.length, ...remaining.items);
  }

  const productsByCategory: Record<string, PublicProduct[]> = {};
  for (const p of allProducts) {
    const slug = p.category.slug;
    if (!productsByCategory[slug]) productsByCategory[slug] = [];
    productsByCategory[slug].push(p);
  }

  const featuredProducts = allProducts.filter((p) => p.isFeatured).slice(0, 8);
  const newProducts = [...allProducts]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 8);
  const discountedProducts = allProducts.filter((p) => p.price.discountSource !== "none").slice(0, 8);

  const totalActiveProducts = productsRes.total > allProducts.length ? productsRes.total : allProducts.length;
  const whatsappNumber = settings.contact_whatsapp ?? "905060557530";
  const campaign = campaignsRes.items[0];
  const banner = bannersRes.items[0];

  // Bahçe temalı görsel bant için — gerçek fotoğraf varlığı yok (bkz.
  // FAZ2.1 integrity check: productImages=0), bu yüzden gerçek olmayan bir
  // fotoğraf UYDURULMADI. Bunun yerine mevcut tasarım dilinin zaten
  // kullandığı gradient+ikon kartları (bkz. .hero, .cat-card) kullanıldı —
  // her kart gerçek bir kategoriye bağlanıyor (uydurma metin değil, DB'deki
  // kategori adı/açıklaması).
  const gardenCategories = categoriesRes.items.slice(0, 3);

  return (
    <>
      <SiteHeader />

      {banner && (
        <div className="promo-banner" style={{ marginTop: 70 }}>
          <div className="promo-banner-inner">
            <h3>{banner.title}</h3>
            {banner.subtitle && <p>{banner.subtitle}</p>}
            {banner.ctaLink && banner.ctaText && (
              <a href={banner.ctaLink} className="btn btn-white">
                {banner.ctaText}
              </a>
            )}
          </div>
        </div>
      )}

      <section className="hero" id="home">
        <div className="hero-content">
          <div className="hero-brand">VOURLA</div>
          <div className="hero-brand" style={{ fontSize: "5rem" }}>
            B&amp;M
          </div>
          <div className="hero-subtitle">Bahçe &amp; Mangal</div>
          <div className="hero-buttons">
            <a href={`https://wa.me/${whatsappNumber}`} className="btn btn-whatsapp" target="_blank" rel="noreferrer">
              <i className="fab fa-whatsapp" /> WhatsApp Sipariş
            </a>
            <a href="/urunler" className="btn btn-white">
              <i className="fas fa-th-large" /> Tüm Ürünler
            </a>
            <a href="#kategoriler" className="btn btn-white">
              <i className="fas fa-leaf" /> Kategorileri Gör
            </a>
          </div>
        </div>
      </section>

      <section className="ai-garden-feature">
        <div className="container">
          <div className="ai-garden-card">
            <div className="ai-garden-icon">
              <i className="fas fa-robot" />
            </div>
            <div className="ai-garden-content">
              <span className="ai-garden-badge">
                <i className="fas fa-wand-magic-sparkles" /> Yapay Zekâ Destekli
              </span>
              <h2 className="ai-garden-title">AI Bahçe Tasarımı</h2>
              <p className="ai-garden-desc">
                Bahçenizin ölçülerini ve tercihlerinizi girin; yapay zekâ size özel bir
                yerleşim planı ve ürün önerileri hazırlasın. Ücretsiz deneyin.
              </p>
              <a href="/bahce-tasarimi" className="btn btn-primary ai-garden-cta">
                <i className="fas fa-pen-ruler" /> Tasarıma Başla
              </a>
            </div>
          </div>
        </div>
      </section>

      {campaign && (
        <div className="campaign-strip">
          <i className="fas fa-bullhorn" /> {campaign.bannerText ?? campaign.name}
          {campaign.ctaLink && campaign.ctaText && (
            <>
              {" — "}
              <a href={campaign.ctaLink}>{campaign.ctaText}</a>
            </>
          )}
        </div>
      )}

      {featuredProducts.length > 0 && (
        <section className="showcase">
          <div className="container">
            <div className="section-header-row">
              <div>
                <h2 className="section-title" style={{ textAlign: "left", fontSize: "1.8rem" }}>
                  Öne Çıkan Ürünler
                </h2>
                <a href="/urunler?sort=relevance" className="section-link">
                  Tüm ürünleri gör <i className="fas fa-arrow-right" />
                </a>
              </div>
            </div>
            <div className="showcase-scroll">
              {featuredProducts.map((p) => (
                <ProductCard key={p.id} product={p} whatsappNumber={whatsappNumber} />
              ))}
            </div>
          </div>
        </section>
      )}

      {discountedProducts.length > 0 && (
        <section className="showcase showcase-alt">
          <div className="container">
            <div className="section-header-row">
              <div>
                <h2 className="section-title" style={{ textAlign: "left", fontSize: "1.8rem" }}>
                  İndirimli Ürünler
                </h2>
                <a href="/urunler?sort=price_asc" className="section-link">
                  Tüm indirimleri gör <i className="fas fa-arrow-right" />
                </a>
              </div>
            </div>
            <div className="showcase-scroll">
              {discountedProducts.map((p) => (
                <ProductCard key={p.id} product={p} whatsappNumber={whatsappNumber} />
              ))}
            </div>
          </div>
        </section>
      )}

      {newProducts.length > 0 && (
        <section className="showcase">
          <div className="container">
            <div className="section-header-row">
              <div>
                <h2 className="section-title" style={{ textAlign: "left", fontSize: "1.8rem" }}>
                  Yeni Ürünler
                </h2>
                <a href="/urunler?sort=newest" className="section-link">
                  Tüm yeni ürünleri gör <i className="fas fa-arrow-right" />
                </a>
              </div>
            </div>
            <div className="showcase-scroll">
              {newProducts.map((p) => (
                <ProductCard key={p.id} product={p} whatsappNumber={whatsappNumber} />
              ))}
            </div>
          </div>
        </section>
      )}

      {gardenCategories.length > 0 && (
        <section className="garden-strip">
          {gardenCategories.map((c) => (
            <a
              key={c.id}
              href={`/kategori/${c.slug}`}
              className="garden-tile"
              style={{ background: `linear-gradient(135deg, ${c.color ?? "#1B5E20"}, #0A130A)` }}
            >
              <div className="garden-tile-content">
                <h3>
                  <i className={`fas ${c.icon ?? "fa-leaf"}`} /> {c.title}
                </h3>
                {c.shortDescription && <p>{c.shortDescription}</p>}
              </div>
            </a>
          ))}
        </section>
      )}

      <section className="categories" id="kategoriler">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">{totalActiveProducts} Çeşit Ürün – {categoriesRes.items.length} Kategori</h2>
            <p className="section-desc">Kategoriye tıklayın, tüm ürünleri ve güncel fiyatları görün.</p>
          </div>
          <CategoryGrid categories={categoriesRes.items} productsByCategory={productsByCategory} />
        </div>
      </section>

      <section className="contact" id="iletisim">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Bize Ulaşın</h2>
          </div>
          <div className="contact-grid">
            <div className="contact-card">
              <div className="contact-icon">
                <i className="fas fa-map-marker-alt" />
              </div>
              <strong>Adres</strong>
              <p>
                <a href={settings.contact_maps_url} target="_blank" rel="noreferrer">
                  {settings.contact_address_line}
                </a>
              </p>
              <small>📌 Yol tarifi için tıklayın</small>
            </div>
            <div className="contact-card">
              <div className="contact-icon">
                <i className="fab fa-whatsapp" />
              </div>
              <strong>WhatsApp</strong>
              <p>
                <a href={`https://wa.me/${whatsappNumber}`}>{settings.contact_phone}</a>
              </p>
            </div>
            <div className="contact-card">
              <div className="contact-icon">
                <i className="fas fa-phone" />
              </div>
              <strong>Telefon</strong>
              <p>
                <a href={`tel:${settings.contact_phone}`}>{settings.contact_phone}</a>
              </p>
            </div>
            <div className="contact-card">
              <div className="contact-icon">
                <i className="fas fa-clock" />
              </div>
              <strong>Saatler</strong>
              <p>{settings.contact_hours}</p>
            </div>
            <div className="contact-card">
              <div className="contact-icon">
                <i className="fab fa-instagram" />
              </div>
              <strong>Instagram</strong>
              <p>
                <a href={settings.contact_instagram_url} target="_blank" rel="noreferrer">
                  {settings.contact_instagram_handle}
                </a>
              </p>
            </div>
            <div className="contact-card">
              <div className="contact-icon">
                <i className="fas fa-envelope" />
              </div>
              <strong>E-posta</strong>
              <p>
                <a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">{settings.site_name}</div>
            <div className="footer-links">
              <a href="#home">Ana Sayfa</a>
              <a href="/urunler">Ürünler</a>
              <a href="#kategoriler">Kategoriler</a>
            </div>
            <div className="social-icons">
              <a href={settings.contact_instagram_url} target="_blank" rel="noreferrer">
                <i className="fab fa-instagram" />
              </a>
              <a href={`https://wa.me/${whatsappNumber}`}>
                <i className="fab fa-whatsapp" />
              </a>
              <a href={`mailto:${settings.contact_email}`}>
                <i className="fas fa-envelope" />
              </a>
            </div>
          </div>
          <div className="footer-bottom">
            <p>{settings.footer_copyright}</p>
          </div>
        </div>
      </footer>

      <a href={`https://wa.me/${whatsappNumber}`} className="whatsapp-float" target="_blank" rel="noreferrer">
        <i className="fab fa-whatsapp" /> <span>Sipariş</span>
      </a>
      <MobileTabBar whatsappNumber={whatsappNumber} />
    </>
  );
}
