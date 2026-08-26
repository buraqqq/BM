import { AddToCartButton } from "@/components/AddToCartButton";

export interface ProductCardProduct {
  id: string;
  slug: string;
  name: string;
  unitLabel: string;
  sku?: string;
  category?: { slug: string; title: string };
  brand?: { name: string } | null;
  images?: { url: string; alt: string | null }[];
  price: {
    base: number;
    final: number;
    discountSource: "campaign" | "sale" | "none";
    discountPercent: number | null;
  };
  inStock: boolean;
  isFeatured?: boolean;
  createdAt?: string;
}

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

const NEW_THRESHOLD_DAYS = 30;

function isNewProduct(createdAt?: string): boolean {
  if (!createdAt) return false;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs >= 0 && ageMs <= NEW_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * FAZ 3 — Bölüm 1/3: ürün vitrinlerinde (ana sayfa, /urunler, /kategori,
 * /arama, ilgili ürünler) tekrar eden tek bir ürün kartı. CTA butonu
 * KASITLI OLARAK "WhatsApp ile Sipariş Ver" yazıyor, "Sepete Ekle" değil —
 * gerçek bir sepet henüz yok (Bölüm 8 yalnızca hazırlık şeması, bkz.
 * docs/commerce.md); butonu "Sepete Ekle" diye etiketleyip WhatsApp'a
 * yönlendirmek yanıltıcı olurdu.
 */
export function ProductCard({ product, whatsappNumber }: { product: ProductCardProduct; whatsappNumber: string }) {
  const image = product.images?.[0];
  const waMessage = encodeURIComponent(`Merhaba, ${product.name} ürünü hakkında bilgi almak istiyorum.`);

  return (
    <article className="product-card">
      <a href={`/urun/${product.slug}`} className="product-card-media">
        {image ? (
          <img src={image.url} alt={image.alt ?? product.name} loading="lazy" />
        ) : (
          <span className="product-card-media-fallback">
            <i className="fas fa-leaf" />
          </span>
        )}
        <div className="product-card-badges">
          {isNewProduct(product.createdAt) && <span className="badge badge-new">Yeni</span>}
          {product.price.discountSource === "campaign" && product.price.discountPercent ? (
            <span className="campaign-badge">-%{product.price.discountPercent}</span>
          ) : null}
          {!product.inStock && <span className="badge badge-red">Tükendi</span>}
        </div>
      </a>
      <div className="product-card-body">
        {product.category && <a href={`/kategori/${product.category.slug}`} className="product-card-cat">{product.category.title}</a>}
        <a href={`/urun/${product.slug}`} className="product-card-name">
          {product.name}
        </a>
        {product.brand && <p className="product-card-brand">{product.brand.name}</p>}
        <div className="product-card-price">
          {product.price.discountSource !== "none" && <span className="old-price">{formatTL(product.price.base)}</span>}
          <span className="price-final">{formatTL(product.price.final)} ₺</span>
          <span className="price-unit">/ {product.unitLabel}</span>
        </div>
        <a
          href={`https://wa.me/${whatsappNumber}?text=${waMessage}`}
          target="_blank"
          rel="noreferrer"
          className="product-card-cta"
          aria-label={`${product.name} için WhatsApp ile sipariş ver`}
        >
          <i className="fab fa-whatsapp" /> Sipariş Ver
        </a>
        {/* FAZ 4A — Bölüm 12/25: gerçek sepete ekleme, WhatsApp'ın YANINDA
            ikincil bir aksiyon olarak (bkz. AddToCartButton.tsx başlığı). */}
        <AddToCartButton productId={product.id} inStock={product.inStock} />
      </div>
    </article>
  );
}
