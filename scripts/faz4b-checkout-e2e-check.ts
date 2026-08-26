/**
 * FAZ 4B — Bölüm 30/31: kapsamlı, GERÇEK çalışan dev/prod server'a karşı,
 * self-cleaning E2E doğrulama. Gerçek HTTP istekleri (fetch, cookie jar) ile
 * checkout foundation'ın section 31'deki senaryosunu ve section 30'daki 19
 * minimum test senaryosunun HTTP+DB gerektiren kısmını kapsar (saf mantık
 * zaten src/lib/__tests__/checkout-logic.test.ts ve
 * customer-validation.test.ts'te birim testli — bkz. o dosyaların başlık
 * yorumları).
 *
 * SONUNDA oluşturduğu HER ŞEYİ (User x2, Product x4, Inventory, Address,
 * Cart/CartItem, LoginAttempt) SİLER — production DB'de kalıcı iz bırakmaz.
 * Bu script HttpSession/loginCustomer deseni dahil
 * scripts/faz4a-commerce-e2e-check.ts ile AYNI mekanizmayı kullanır — yeni
 * bir cookie-jar/login mekanizması İKİNCİ KEZ YAZILMADI.
 *
 * Çalıştırma: dev/prod server ayrı bir terminalde/arka planda çalışırken:
 *   npx tsx scripts/faz4b-checkout-e2e-check.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const RUN_ID = "e2efaz4b"; // Date.now() KULLANILMADI — sabit, tanınabilir, tekrar çalıştırılabilir
let passCount = 0;
let failCount = 0;

function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failCount++;
    console.log(`  ❌ ${label}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

// ---- FAZ4A'daki İLE AYNI cookie-jar destekli HTTP oturumu (ikinci kez yazılmadı) ----
class HttpSession {
  private jar = new Map<string, string>();

  private cookieHeader(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private absorbSetCookie(res: Response) {
    const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "" || sc.toLowerCase().includes("max-age=0")) {
        this.jar.delete(name);
      } else {
        this.jar.set(name, value);
      }
    }
  }

  async req(method: string, path: string, body?: unknown, formEncoded = false): Promise<{ status: number; json: unknown; res: Response }> {
    const headers: Record<string, string> = { Cookie: this.cookieHeader() };
    let payload: string | undefined;
    if (body !== undefined) {
      if (formEncoded) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
        payload = new URLSearchParams(body as Record<string, string>).toString();
      } else {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
      }
    }
    const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload, redirect: "manual" });
    this.absorbSetCookie(res);
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // JSON olmayan gövde — sorun değil
    }
    return { status: res.status, json, res };
  }

  async loginCustomer(email: string, password: string) {
    const csrfRes = await this.req("GET", "/api/auth/csrf");
    const csrfToken = (csrfRes.json as { csrfToken: string }).csrfToken;
    return this.req("POST", "/api/auth/callback/customer-credentials", { csrfToken, email, password, json: "true" }, true);
  }
}

async function main() {
  const emailA = `${RUN_ID}-a@example.com`;
  const emailB = `${RUN_ID}-b@example.com`;
  const password = "sifreTest1234";

  console.log("0) Kurulum: geçici test ürünleri...");
  const category = await prisma.category.findFirst({ where: { isActive: true } });
  if (!category) throw new Error("Aktif kategori bulunamadı");

  const productA = await prisma.product.create({
    data: { sku: `TEST-${RUN_ID}-A`, name: `TEST ${RUN_ID} Ürün A`, slug: `test-${RUN_ID}-urun-a`, categoryId: category.id, price: 100, isActive: true, taxRate: 20 },
  });
  await prisma.inventory.create({ data: { productId: productA.id, quantity: 10, stockStatus: "IN_STOCK" } });

  const productPriceChange = await prisma.product.create({
    data: { sku: `TEST-${RUN_ID}-PRICE`, name: `TEST ${RUN_ID} Fiyat Değişen Ürün`, slug: `test-${RUN_ID}-fiyat-degisen-urun`, categoryId: category.id, price: 200, isActive: true, taxRate: 20 },
  });
  await prisma.inventory.create({ data: { productId: productPriceChange.id, quantity: 10, stockStatus: "IN_STOCK" } });

  const productArchivable = await prisma.product.create({
    data: { sku: `TEST-${RUN_ID}-ARCH`, name: `TEST ${RUN_ID} Arşivlenecek Ürün`, slug: `test-${RUN_ID}-arsivlenecek-urun`, categoryId: category.id, price: 150, isActive: true, taxRate: 20 },
  });
  await prisma.inventory.create({ data: { productId: productArchivable.id, quantity: 10, stockStatus: "IN_STOCK" } });

  try {
    // ================= GUEST CART + CHECKOUT GATE =================
    console.log("\n1) Guest: sepete ürün ekleniyor...");
    const guest = new HttpSession();
    const add1 = await guest.req("POST", "/api/cart/items", { productId: productA.id, quantity: 1 });
    check("guest add -> 201", add1.status === 201, add1.json);

    console.log("2) Guest: checkout/validate deneniyor (Test 2/3 — guest checkout YOK, 401 bekleniyor)...");
    const guestCheckout = await guest.req("POST", "/api/checkout/validate", { deliveryMethod: "PICKUP" });
    check("guest checkout/validate -> 401 UNAUTHORIZED", guestCheckout.status === 401, guestCheckout.json);

    console.log("3) Guest sepeti checkout denemesinden ETKİLENMEDİ mi (Test 18 — guest cart preserved)?");
    const guestCartStillThere = await guest.req("GET", "/api/cart");
    const guestCartItems = (guestCartStillThere.json as { items: { productId: string }[] }).items;
    check("guest sepeti hâlâ 1 ürün içeriyor", guestCartItems.length === 1 && guestCartItems[0].productId === productA.id, guestCartItems);

    // ================= REGISTER + LOGIN (merge ÖNCESİ) =================
    console.log("\n4) Kayıt + giriş (Test — authenticated customer önkoşulu)...");
    const reg = await guest.req("POST", "/api/account/register", { name: "Test", surname: "KullanıcıA", email: emailA, phone: "05061234567", password });
    check("kayıt 201", reg.status === 201, reg.json);
    const loginRes = await guest.loginCustomer(emailA, password);
    check("login kabul edildi", loginRes.status < 400, loginRes.json);

    console.log("5) Test 1 — BOŞ sepetle checkout/validate (merge henüz yapılmadı, authenticated cart boş)...");
    const emptyCheckout = await guest.req("POST", "/api/checkout/validate", { deliveryMethod: "PICKUP" });
    check(
      "boş sepette valid:false + EMPTY_CART",
      emptyCheckout.status === 422 && (emptyCheckout.json as { valid: boolean; errors: { code: string }[] }).valid === false && (emptyCheckout.json as { errors: { code: string }[] }).errors[0]?.code === "EMPTY_CART",
      emptyCheckout.json
    );

    console.log("6) Guest→User cart merge (FAZ4A mekanizması yeniden kullanılıyor, Test 19 — merge compatibility)...");
    const merge = await guest.req("POST", "/api/cart/merge");
    check("merge 200", merge.status === 200, merge.json);
    const mergedItems = (merge.json as { items: { productId: string }[] }).items;
    check("birleşen sepette guest'ten gelen ürün var", mergedItems.some((i) => i.productId === productA.id), mergedItems);

    console.log("7) Sepete diğer iki test ürünü ekleniyor...");
    const addPrice = await guest.req("POST", "/api/cart/items", { productId: productPriceChange.id, quantity: 1 });
    check("fiyat-değişecek ürün eklendi", addPrice.status === 201, addPrice.json);
    const addArch = await guest.req("POST", "/api/cart/items", { productId: productArchivable.id, quantity: 1 });
    check("arşivlenecek ürün eklendi", addArch.status === 201, addArch.json);

    // ================= ADDRESS =================
    console.log("\n8) Teslimat adresi ekleniyor (mevcut /api/account/addresses yeniden kullanıldı)...");
    const addr = await guest.req("POST", "/api/account/addresses", {
      title: "Ev",
      firstName: "Test",
      lastName: "KullanıcıA",
      phone: "05061234567",
      city: "İzmir",
      district: "Urla",
      neighborhood: "Altıntaş",
      addressLine: "Besim Uyal Cad. No:121/A",
    });
    check("adres oluşturuldu ve varsayılan", addr.status === 201 && (addr.json as { isDefault: boolean }).isDefault === true, addr.json);
    const addrId = (addr.json as { id: string }).id;

    // ================= VALID PICKUP =================
    console.log("\n9) Test 6 — geçerli PICKUP checkout/validate...");
    const pickupCheckout = await guest.req("POST", "/api/checkout/validate", { deliveryMethod: "PICKUP" });
    const pickupBody = pickupCheckout.json as {
      valid: boolean;
      delivery?: { method: string; shipping: { amount: number; computed: boolean }; pickupLocation: { addressLine: string | null; preparationTimeNote: string } | null };
      pricing?: { subtotal: number; total: number };
    };
    check("PICKUP checkout valid:true", pickupCheckout.status === 200 && pickupBody.valid === true, pickupBody);
    check("PICKUP shipping = 0 ve computed:true (gerçekten sıfır, tahmin değil)", pickupBody.delivery?.shipping.amount === 0 && pickupBody.delivery?.shipping.computed === true);
    check("PICKUP teslim alma noktası GERÇEK adres verisini içeriyor (uydurma değil)", !!pickupBody.delivery?.pickupLocation?.addressLine, pickupBody.delivery?.pickupLocation);
    check("PICKUP 'tahmini hazırlık süresi' için placeholder not var (gerçek veri yok)", !!pickupBody.delivery?.pickupLocation?.preparationTimeNote);

    // ================= VALID DELIVERY =================
    console.log("10) Test 7 — geçerli DELIVERY checkout/validate...");
    const deliveryCheckout = await guest.req("POST", "/api/checkout/validate", { deliveryMethod: "DELIVERY", addressId: addrId });
    const deliveryBody = deliveryCheckout.json as { valid: boolean; delivery?: { shipping: { amount: number; computed: boolean; note: string | null }; addressSnapshot: { city: string } | null } };
    check("DELIVERY checkout valid:true", deliveryCheckout.status === 200 && deliveryBody.valid === true, deliveryBody);
    check("DELIVERY shipping computed:false + açık not (gerçek kargo API'si yok, ücret uydurulmadı)", deliveryBody.delivery?.shipping.computed === false && !!deliveryBody.delivery?.shipping.note);
    check("DELIVERY addressSnapshot seçilen adresi yansıtıyor", deliveryBody.delivery?.addressSnapshot?.city === "İzmir", deliveryBody.delivery?.addressSnapshot);

    console.log("11) DELIVERY ama addressId YOK — reddedilmeli...");
    const deliveryNoAddr = await guest.req("POST", "/api/checkout/validate", { deliveryMethod: "DELIVERY" });
    check("addressId olmadan DELIVERY -> valid:false", deliveryNoAddr.status === 422 && (deliveryNoAddr.json as { valid: boolean }).valid === false, deliveryNoAddr.json);

    console.log("12) Test 8 — geçersiz deliveryMethod ('HACK') reddedilmeli...");
    const hackMethod = await guest.req("POST", "/api/checkout/validate", { deliveryMethod: "HACK" });
    check("deliveryMethod='HACK' -> valid:false (422)", hackMethod.status === 422 && (hackMethod.json as { valid: boolean }).valid === false, hackMethod.json);

    // ================= CLIENT MANIPULATION IGNORED =================
    console.log("\n13) Test 12-16 — manipüle edilmiş price/subtotal/total/shippingPrice/quantity YOK SAYILIYOR...");
    const realCart = await guest.req("GET", "/api/cart");
    const realSubtotal = (realCart.json as { totals: { subtotal: number } }).totals.subtotal;
    const tampered = await guest.req("POST", "/api/checkout/validate", {
      deliveryMethod: "PICKUP",
      price: 1,
      subtotal: 1,
      total: 1,
      shippingPrice: 999999,
      quantity: 999,
    });
    const tamperedBody = tampered.json as { valid: boolean; pricing?: { subtotal: number; total: number; shipping: number } };
    check("manipüle edilmiş istekte de valid:true (alanlar sessizce elendi, istek reddedilmedi)", tampered.status === 200 && tamperedBody.valid === true, tamperedBody);
    check("sunucu GERÇEK subtotal'ı kullandı (client'ın '1' iddiası YOK SAYILDI)", tamperedBody.pricing?.subtotal === realSubtotal, { real: realSubtotal, got: tamperedBody.pricing });
    check("sunucu GERÇEK total'ı kullandı (client'ın '1' iddiası YOK SAYILDI)", tamperedBody.pricing?.total === realSubtotal, tamperedBody.pricing);
    check("sunucu shippingPrice=999999 iddiasını YOK SAYDI (gerçek shipping=0)", tamperedBody.pricing?.shipping === 0, tamperedBody.pricing);

    // ================= PRICE REVALIDATION (WARNING, NOT BLOCKING) =================
    console.log("\n14) Test 9 — fiyat admin tarafından değiştiriliyor, checkout UYARI veriyor ama BLOKE ETMİYOR...");
    await prisma.product.update({ where: { id: productPriceChange.id }, data: { price: 260 } });
    const priceChangedCheckout = await guest.req("POST", "/api/checkout/validate", { deliveryMethod: "PICKUP" });
    const priceChangedBody = priceChangedCheckout.json as { valid: boolean; warnings?: { code: string; productId?: string }[] };
    check("fiyat değiştikten sonra checkout hâlâ valid:true", priceChangedCheckout.status === 200 && priceChangedBody.valid === true, priceChangedBody);
    check("PRICE_CHANGED uyarısı doğru ürün için üretildi", !!priceChangedBody.warnings?.some((w) => w.code === "PRICE_CHANGED" && w.productId === productPriceChange.id), priceChangedBody.warnings);

    // ================= STOCK REVALIDATION (BLOCKING) =================
    console.log("15) Test 10 — stok yetersiz kalıyor, checkout BLOKE OLUYOR (ama stok/InventoryMovement DEĞİŞTİRİLMİYOR)...");
    await prisma.inventory.update({ where: { productId: productA.id }, data: { quantity: 0 } });
    const stockBlockCheckout = await guest.req("POST", "/api/checkout/validate", { deliveryMethod: "PICKUP" });
    const stockBlockBody = stockBlockCheckout.json as { valid: boolean; errors?: { code: string; productId?: string }[] };
    check("stok yetersizken checkout valid:false", stockBlockCheckout.status === 422 && stockBlockBody.valid === false, stockBlockBody);
    check("STOCK_INSUFFICIENT hatası doğru ürün için üretildi", !!stockBlockBody.errors?.some((e) => e.code === "STOCK_INSUFFICIENT" && e.productId === productA.id), stockBlockBody.errors);
    const movementsAfterBlock = await prisma.inventoryMovement.count({ where: { inventoryId: (await prisma.inventory.findUnique({ where: { productId: productA.id } }))!.id } });
    check("checkout doğrulaması InventoryMovement OLUŞTURMADI (stok rezervasyonu yok)", movementsAfterBlock === 0);
    // Stoğu geri düzelt ki sonraki senaryolar (arşiv testi) yalnızca kendi hatasını üretsin.
    await prisma.inventory.update({ where: { productId: productA.id }, data: { quantity: 10 } });

    // ================= INACTIVE PRODUCT (BLOCKING) =================
    console.log("16) Test 11 — ürün arşivleniyor, checkout BLOKE OLUYOR ama sepetten SİLİNMİYOR...");
    await prisma.product.update({ where: { id: productArchivable.id }, data: { isActive: false } });
    const inactiveCheckout = await guest.req("POST", "/api/checkout/validate", { deliveryMethod: "PICKUP" });
    const inactiveBody = inactiveCheckout.json as { valid: boolean; errors?: { code: string; productId?: string }[] };
    check("arşivlenmiş ürün varken checkout valid:false", inactiveCheckout.status === 422 && inactiveBody.valid === false, inactiveBody);
    check("PRODUCT_INACTIVE hatası doğru ürün için üretildi", !!inactiveBody.errors?.some((e) => e.code === "PRODUCT_INACTIVE" && e.productId === productArchivable.id), inactiveBody.errors);
    const cartAfterArchive = await guest.req("GET", "/api/cart");
    const cartAfterArchiveItems = (cartAfterArchive.json as { items: { productId: string }[] }).items;
    check("arşivlenen ürün SEPETTEN SİLİNMEDİ (satır hâlâ mevcut)", cartAfterArchiveItems.some((i) => i.productId === productArchivable.id));

    // ================= ADDRESS OWNERSHIP / IDOR =================
    console.log("\n17) İkinci kullanıcı (B) oluşturuluyor, adres IDOR deneniyor (Test 4)...");
    const userB = new HttpSession();
    const regB = await userB.req("POST", "/api/account/register", { name: "Test", surname: "KullanıcıB", email: emailB, phone: "05069876543", password });
    check("kullanıcı B kayıt oldu", regB.status === 201);
    await userB.loginCustomer(emailB, password);
    const addBForCart = await userB.req("POST", "/api/cart/items", { productId: productA.id, quantity: 1 });
    check("B kendi sepetine ürün ekledi (checkout/validate boş-sepet hatası vermesin diye)", addBForCart.status === 201);

    const idorCheckout = await userB.req("POST", "/api/checkout/validate", { deliveryMethod: "DELIVERY", addressId: addrId });
    const idorBody = idorCheckout.json as { valid: boolean; errors?: { code: string }[] };
    check("B, A'nın adresiyle checkout DENEYEMİYOR (valid:false, ADDRESS_NOT_FOUND)", idorCheckout.status === 422 && idorBody.valid === false && idorBody.errors?.[0]?.code === "ADDRESS_NOT_FOUND", idorBody);

    console.log("18) Test 5 — var olmayan addressId ile checkout...");
    const invalidAddrCheckout = await guest.req("POST", "/api/checkout/validate", { deliveryMethod: "DELIVERY", addressId: "nonexistent-address-id-xyz" });
    const invalidAddrBody = invalidAddrCheckout.json as { valid: boolean; errors?: { code: string }[] };
    check("var olmayan addressId -> ADDRESS_NOT_FOUND (aynı kod, sızıntı yok)", invalidAddrCheckout.status === 422 && invalidAddrBody.valid === false && invalidAddrBody.errors?.[0]?.code === "ADDRESS_NOT_FOUND", invalidAddrBody);

    console.log("19) A'nın adresi IDOR/geçersiz-id denemelerinden ETKİLENMEDİ mi?");
    const addrStillThere = await prisma.address.findUnique({ where: { id: addrId } });
    check("A'nın adresi hâlâ duruyor ve değişmedi", addrStillThere?.title === "Ev");

    // ================= UNAUTHENTICATED (fresh) =================
    console.log("\n20) Test 3 — tamamen oturumsuz istemci checkout/validate deniyor...");
    const anon = new HttpSession();
    const anonCheckout = await anon.req("POST", "/api/checkout/validate", { deliveryMethod: "PICKUP" });
    check("oturumsuz checkout/validate -> 401", anonCheckout.status === 401, anonCheckout.json);

    // ================= NO ORDER / NO SIDE EFFECTS =================
    console.log("\n21) Bölüm 26 — checkout/validate hiçbir Order/Payment satırı OLUŞTURMADI mı?");
    const orderTableExists = Object.prototype.hasOwnProperty.call(prisma, "order");
    check("Prisma client'ta Order modeli YOK (bu fazda oluşturulmadı)", !orderTableExists);
  } finally {
    console.log("\n22) Temizlik: oluşturulan tüm test verisi siliniyor...");
    await prisma.loginAttempt.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    // User silme -> Address/Cart CASCADE (Cart -> CartItem CASCADE) otomatik siler.
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    // Ürün silme -> Inventory/CartItem/PriceHistory CASCADE otomatik siler.
    await prisma.product.deleteMany({ where: { id: { in: [productA.id, productPriceChange.id, productArchivable.id] } } });
    // Olası artık misafir Cart'ları da (bir adım hiç ulaşılamadıysa) temizle.
    await prisma.cart.deleteMany({ where: { userId: null, items: { none: {} } } });
    console.log("Temizlendi.");
  }

  console.log("\n=== SONUÇ ===");
  console.log(`${passCount} başarılı, ${failCount} başarısız (toplam ${passCount + failCount})`);
  if (failCount > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
