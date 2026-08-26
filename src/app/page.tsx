import { SiteHeader } from "@/components/SiteHeader";
import { CategoryGrid, type PublicCategory, type PublicProduct } from "@/components/CategoryGrid";
import { apiGet } from "@/lib/api-base";

export const dynamic = "force-dynamic";

interface ProductsResponse {
  items: (PublicProduct & { category: { slug: string } })[];
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

export default async function HomePage() {
  const [categoriesRes, productsRes, settings, bannersRes, campaignsRes] = await Promise.all([
    apiGet<CategoriesResponse>("/api/categories"),
    apiGet<ProductsResponse>("/api/products?pageSize=100"),
    apiGet<Settings>("/api/settings"),
    apiGet<BannersResponse>("/api/banners"),
    apiGet<CampaignsResponse>("/api/campaigns"),
  ]);

  // 257 ürün, tek sayfada pageSize=100 sınırını aşıyor — kategori
  // bazlı toplu çekim yapıyoruz (public sayfa deneyimi değişmiyor,
  // yalnızca ilk yüklemede tüm ürünler API'den çekiliyor).
  const allProducts: (PublicProduct & { category: { slug: string } })[] = [...productsRes.items];
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

  const totalActiveProducts = productsRes.total > allProducts.length ? productsRes.total : allProducts.length;
  const whatsappNumber = settings.contact_whatsapp ?? "905060557530";
  const discountPct = settings.whatsapp_discount_percent ?? "2";
  const campaign = campaignsRes.items[0];
  const banner = bannersRes.items[0];

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
            <a href="#kategoriler" className="btn btn-white">
              <i className="fas fa-leaf" /> Kategorileri Gör
            </a>
          </div>
          <div className="hero-promo">
            <i className="fas fa-tag" /> WhatsApp siparişlerinde <strong>%{discountPct} indirim!</strong>
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
    </>
  );
}
