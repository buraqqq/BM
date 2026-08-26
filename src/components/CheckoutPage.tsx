"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface CartLine {
  id: string;
  productId: string;
  product: { id: string; slug: string; sku: string; name: string; image: { url: string; alt: string | null } | null };
  quantity: number;
  unitPriceAtAdd: number;
  currentFinalPrice: number;
  priceChanged: boolean;
  lineTotal: number;
  isActive: boolean;
  stock: { status: string; quantity: number | null };
  stockExceeded: boolean;
}

interface CartResponse {
  cartId: string;
  items: CartLine[];
  totals: { itemCount: number; lineCount: number; subtotal: number };
}

interface Address {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  district: string;
  neighborhood: string | null;
  addressLine: string;
  postalCode: string | null;
  country: string;
  isDefault: boolean;
}

type DeliveryMethod = "PICKUP" | "DELIVERY";

interface CheckoutIssue {
  code: string;
  message: string;
  productId?: string;
}

interface CheckoutResult {
  valid: boolean;
  cart?: CartResponse;
  delivery?: {
    method: DeliveryMethod;
    methodLabel: string;
    addressSnapshot: unknown | null;
    pickupLocation: { name: string; addressLine: string | null; phone: string | null; hours: string | null; mapsUrl: string | null; preparationTimeNote: string } | null;
    shipping: { amount: number; computed: boolean; note: string | null };
  };
  pricing?: { subtotal: number; shipping: number; discount: number; total: number };
  warnings?: CheckoutIssue[];
  errors?: CheckoutIssue[];
}

function formatTL(n: number) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

// ==========================================================
// FAZ 4B — /checkout. FAZ 4C — "Ödemeye Geç" placeholder'ı GERÇEK sipariş
// oluşturmaya bağlandı: buton artık POST /api/orders çağırır ve başarıda
// /siparis/[orderNumber] sayfasına yönlendirir. Gerçek ödeme hâlâ YOK (Bölüm V)
// — kullanıcı "Siparişi Oluştur" der, sipariş PENDING/paymentStatus=PENDING
// olarak kaydedilir, yanıltıcı "ödeme alındı" mesajı gösterilmez.
// ==========================================================
export function CheckoutPage() {
  const router = useRouter();
  const { status } = useSession();

  const [cart, setCart] = useState<CartResponse | null>(null);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod | null>(null);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Bölüm 1 — sepet durumu (guest dahil) her zaman kontrol edilir.
  useEffect(() => {
    fetch("/api/cart", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: CartResponse) => {
        setCart(data);
        if (data.items.length === 0) router.push("/sepet");
      })
      .catch(() => setServerError("Sepet bilgisi alınamadı, lütfen tekrar deneyin."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bölüm 4 — yalnızca authenticated kullanıcı için mevcut adresler yüklenir.
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/account/addresses", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items: Address[] }) => {
        setAddresses(data.items);
        const def = data.items.find((a) => a.isDefault);
        if (def) setSelectedAddressId(def.id);
      });
  }, [status]);

  async function runValidate(addressId: string | null, method: DeliveryMethod) {
    setValidating(true);
    setServerError(null);
    try {
      const res = await fetch("/api/checkout/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressId, deliveryMethod: method }),
      });
      const data: CheckoutResult = await res.json().catch(() => null);
      if (!data) {
        setServerError("Sunucuya ulaşılamadı, lütfen tekrar deneyin.");
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setServerError("Sunucuya ulaşılamadı, lütfen tekrar deneyin.");
    } finally {
      setValidating(false);
    }
  }

  // FAZ 4C — gerçek sipariş oluşturma. İstemci yalnızca addressId + deliveryMethod
  // gönderir; fiyat/toplam SUNUCUDA hesaplanır (Bölüm F adım 14). Başarıda
  // /siparis/[orderNumber] sayfasına gidilir.
  async function submitOrder() {
    if (!deliveryMethod) return;
    setSubmitting(true);
    setOrderError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addressId: deliveryMethod === "DELIVERY" ? selectedAddressId : null,
          deliveryMethod,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.orderNumber) {
        router.push(`/siparis/${data.orderNumber}`);
        return;
      }
      setOrderError(data?.message ?? "Sipariş oluşturulamadı, lütfen tekrar deneyin.");
    } catch {
      setOrderError("Sunucuya ulaşılamadı, lütfen tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (status !== "authenticated" || !deliveryMethod) return;
    if (deliveryMethod === "DELIVERY" && !selectedAddressId) {
      setResult(null);
      return;
    }
    runValidate(deliveryMethod === "DELIVERY" ? selectedAddressId : null, deliveryMethod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, deliveryMethod, selectedAddressId]);

  if (!cart || (status === "authenticated" && addresses === null)) {
    return (
      <div className="cart-shell">
        <p className="account-sub">Yükleniyor…</p>
      </div>
    );
  }

  if (cart.items.length === 0) {
    // useEffect zaten /sepet'e yönlendiriyor — geçiş anındaki flash için.
    return null;
  }

  return (
    <div className="checkout-shell">
      <div className="checkout-progress">
        <span className="checkout-progress-step done">Sepet</span>
        <span className="checkout-progress-sep">→</span>
        <span className="checkout-progress-step active">Teslimat</span>
        <span className="checkout-progress-sep">→</span>
        <span className="checkout-progress-step disabled">Sipariş</span>
      </div>

      <div className="checkout-grid">
        <div className="checkout-main">
          {status !== "authenticated" ? (
            // Bölüm 3 — guest checkout: sepet korunur, kullanıcı giriş/üyeliğe yönlendirilir.
            <div className="account-card">
              <h2>Devam etmek için giriş yapın</h2>
              <p className="account-sub">
                Sepetinizdeki ürünler korunuyor. Giriş yaptığınızda veya üye olduğunuzda sepetiniz hesabınıza otomatik olarak aktarılır.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <a className="btn btn-primary" href="/giris?next=/checkout">
                  Giriş Yap
                </a>
                <a className="btn btn-primary" style={{ background: "rgba(255,255,255,0.08)" }} href="/kayit?next=/checkout">
                  Üye Ol
                </a>
              </div>
            </div>
          ) : (
            <>
              <div className="account-card">
                <h2>1. Teslimat Bilgileri</h2>
                <p className="account-sub">Adreslerinizden birini seçin.</p>
                {addresses && addresses.length === 0 && (
                  <p className="account-sub">
                    Henüz kayıtlı adresiniz yok.{" "}
                    <a href="/hesabim/adresler" style={{ color: "var(--orange)", fontWeight: 700 }}>
                      Adres ekleyin
                    </a>
                    .
                  </p>
                )}
                <div className="address-grid">
                  {addresses?.map((a) => (
                    <button
                      type="button"
                      key={a.id}
                      className={`address-card checkout-address-card${a.id === selectedAddressId ? " selected" : ""}${a.isDefault ? " is-default" : ""}`}
                      onClick={() => setSelectedAddressId(a.id)}
                    >
                      {a.isDefault && <span className="address-default-tag">Varsayılan</span>}
                      <h3>{a.title}</h3>
                      <p>
                        {a.firstName} {a.lastName} — {a.phone}
                        <br />
                        {a.addressLine}
                        <br />
                        {a.neighborhood ? `${a.neighborhood}, ` : ""}
                        {a.district}/{a.city} {a.postalCode ?? ""}
                      </p>
                    </button>
                  ))}
                </div>
                <a href="/hesabim/adresler" style={{ display: "inline-block", marginTop: 14, fontSize: "0.82rem", color: "rgba(255,255,255,0.6)" }}>
                  + Yeni adres ekle / adres yönetimi
                </a>
              </div>

              <div className="account-card" style={{ marginTop: 20 }}>
                <h2>2. Teslimat Yöntemi</h2>
                <div className="delivery-method-grid">
                  <button
                    type="button"
                    className={`delivery-method-card${deliveryMethod === "PICKUP" ? " selected" : ""}`}
                    onClick={() => setDeliveryMethod("PICKUP")}
                  >
                    <i className="fas fa-store" />
                    <span>Mağazadan Gel-Al</span>
                  </button>
                  <button
                    type="button"
                    className={`delivery-method-card${deliveryMethod === "DELIVERY" ? " selected" : ""}`}
                    onClick={() => setDeliveryMethod("DELIVERY")}
                  >
                    <i className="fas fa-truck" />
                    <span>Kargo ile Teslimat</span>
                  </button>
                </div>

                {deliveryMethod === "DELIVERY" && !selectedAddressId && (
                  <p className="account-error" style={{ marginTop: 14 }}>
                    Kargo ile teslimat için önce bir teslimat adresi seçmelisiniz.
                  </p>
                )}

                {deliveryMethod === "PICKUP" && result?.valid && result.delivery?.pickupLocation && (
                  <div className="pickup-info-card">
                    <h3>{result.delivery.pickupLocation.name}</h3>
                    {result.delivery.pickupLocation.addressLine && <p>{result.delivery.pickupLocation.addressLine}</p>}
                    {result.delivery.pickupLocation.phone && <p>Tel: {result.delivery.pickupLocation.phone}</p>}
                    {result.delivery.pickupLocation.hours && <p>Çalışma Saatleri: {result.delivery.pickupLocation.hours}</p>}
                    <p style={{ opacity: 0.7 }}>{result.delivery.pickupLocation.preparationTimeNote}</p>
                    {result.delivery.pickupLocation.mapsUrl && (
                      <a href={result.delivery.pickupLocation.mapsUrl} target="_blank" rel="noreferrer">
                        Haritada Göster
                      </a>
                    )}
                  </div>
                )}

                {deliveryMethod === "DELIVERY" && result?.valid && result.delivery?.shipping && (
                  <p className="account-sub" style={{ marginTop: 14 }}>
                    {result.delivery.shipping.computed
                      ? `Kargo ücreti: ${formatTL(result.delivery.shipping.amount)} ₺`
                      : result.delivery.shipping.note ?? "Kargo ücreti henüz hesaplanmadı."}
                  </p>
                )}
              </div>

              <div className="account-card" style={{ marginTop: 20 }}>
                <h2>3. Sipariş Özeti — Ürünler</h2>
                {cart.items.map((line) => (
                  <div className="cart-line" key={line.id} style={{ gridTemplateColumns: "56px 1fr auto" }}>
                    {line.product.image ? (
                      <img className="cart-line-img" style={{ width: 56, height: 56 }} src={line.product.image.url} alt={line.product.image.alt ?? line.product.name} />
                    ) : (
                      <div className="cart-line-img-fallback" style={{ width: 56, height: 56 }}>
                        <i className="fas fa-leaf" />
                      </div>
                    )}
                    <div>
                      <div className="cart-line-name">{line.product.name}</div>
                      <div className="cart-line-sku">
                        SKU: {line.product.sku} — Adet: {line.quantity}
                      </div>
                      {!line.isActive && <div className="cart-line-warning">Bu ürün artık satışta değil.</div>}
                      {line.isActive && line.stockExceeded && <div className="cart-line-warning">Stok yetersiz.</div>}
                      {line.isActive && line.priceChanged && (
                        <div className="cart-line-warning">
                          Fiyat değişti: {formatTL(line.unitPriceAtAdd)} ₺ → {formatTL(line.currentFinalPrice)} ₺
                        </div>
                      )}
                    </div>
                    <div className="cart-line-price">{formatTL(line.lineTotal)} ₺</div>
                  </div>
                ))}
                <p className="account-sub" style={{ marginTop: 14 }}>
                  Miktar değiştirmek veya ürün kaldırmak için{" "}
                  <a href="/sepet" style={{ color: "var(--orange)", fontWeight: 700 }}>
                    sepetinize dönün
                  </a>
                  .
                </p>
              </div>
            </>
          )}
        </div>

        <div className="checkout-side">
          <div className="cart-summary checkout-summary">
            <h3 style={{ fontFamily: "var(--font-heading)", color: "var(--cream)", marginBottom: 12 }}>Sipariş Özeti</h3>

            {validating && <p className="account-sub">Hesaplanıyor…</p>}
            {serverError && <p className="account-error">{serverError}</p>}

            {result && !result.valid && result.errors && (
              <div style={{ marginBottom: 14 }}>
                {result.errors.map((e, i) => (
                  <p className="account-error" key={i}>
                    {e.message}
                  </p>
                ))}
              </div>
            )}

            {result && result.valid && result.warnings && result.warnings.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {result.warnings.map((w, i) => (
                  <p className="account-sub" key={i} style={{ color: "var(--orange)" }}>
                    {w.message}
                  </p>
                ))}
              </div>
            )}

            <div className="cart-summary-row">
              <span>Ara Toplam</span>
              <span>{formatTL(result?.pricing?.subtotal ?? cart.totals.subtotal)} ₺</span>
            </div>
            <div className="cart-summary-row">
              <span>Teslimat</span>
              <span>{result?.valid ? (result.pricing?.shipping === 0 && result.delivery?.shipping.computed === false ? "Henüz hesaplanmadı" : `${formatTL(result?.pricing?.shipping ?? 0)} ₺`) : "—"}</span>
            </div>
            <div className="cart-summary-row total">
              <span>Toplam</span>
              <span>{formatTL(result?.pricing?.total ?? cart.totals.subtotal)} ₺</span>
            </div>

            {orderError && (
              <p className="account-error" style={{ marginTop: 14 }}>
                {orderError}
              </p>
            )}

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 16, opacity: result?.valid ? 1 : 0.5, cursor: result?.valid ? "pointer" : "not-allowed" }}
              disabled={!result?.valid || validating || submitting}
              onClick={submitOrder}
            >
              {submitting ? "Oluşturuluyor…" : "Siparişi Oluştur"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
