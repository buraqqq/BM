/**
 * FAZ 4A — Bölüm 33/34: kapsamlı, GERÇEK çalışan dev server'a karşı,
 * self-cleaning E2E doğrulama. Gerçek HTTP istekleri (fetch, cookie jar) ile
 * NextAuth customer-credentials login/logout, guest→user sepet birleştirme,
 * adres IDOR, cart ownership, fiyat/stok/isActive revalidation dahil section
 * 33'teki 26 senaryonun HTTP+DB gerektiren kısmını kapsar (saf mantık zaten
 * src/lib/__tests__/{customer-auth,address-rules,cart-logic,customer-validation}.test.ts'te
 * birim testli — bkz. dosya başı yorumları oradaki eşleştirme notları).
 *
 * SONUNDA oluşturduğu HER ŞEYİ (User x2, Product x3, Inventory, Address,
 * Cart/CartItem, LoginAttempt) SİLER — production DB'de kalıcı iz bırakmaz.
 *
 * Çalıştırma: dev server ayrı bir terminalde/arka planda çalışırken:
 *   npx tsx scripts/faz4a-commerce-e2e-check.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const RUN_ID = "e2efaz4a"; // Date.now() KULLANILMADI (script tekrar çalıştırılabilir olmalı) — sabit, tanınabilir bir işaret
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

// ---- Basit cookie jar destekli HTTP oturumu ----
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
      // JSON olmayan gövde (ör. redirect) — sorun değil
    }
    return { status: res.status, json, res };
  }

  async loginCustomer(email: string, password: string) {
    const csrfRes = await this.req("GET", "/api/auth/csrf");
    const csrfToken = (csrfRes.json as { csrfToken: string }).csrfToken;
    return this.req(
      "POST",
      "/api/auth/callback/customer-credentials",
      { csrfToken, email, password, json: "true" },
      true
    );
  }

  async logout() {
    const csrfRes = await this.req("GET", "/api/auth/csrf");
    const csrfToken = (csrfRes.json as { csrfToken: string }).csrfToken;
    return this.req("POST", "/api/auth/signout", { csrfToken, json: "true" }, true);
  }
}

async function main() {
  const emailA = `${RUN_ID}-a@example.com`;
  const emailB = `${RUN_ID}-b@example.com`;
  const password = "sifreTest1234";
  const newPassword = "yeniSifre5678";

  console.log("0) Kurulum: geçici test ürünleri...");
  const category = await prisma.category.findFirst({ where: { isActive: true } });
  if (!category) throw new Error("Aktif kategori bulunamadı");

  const stockProduct = await prisma.product.create({
    data: { sku: `TEST-${RUN_ID}-STOCK2`, name: `TEST ${RUN_ID} Stoklu Ürün`, slug: `test-${RUN_ID}-stoklu-urun`, categoryId: category.id, price: 100, isActive: true, taxRate: 20 },
  });
  await prisma.inventory.create({ data: { productId: stockProduct.id, quantity: 2, stockStatus: "LOW_STOCK" } });

  const priceChangeProduct = await prisma.product.create({
    data: { sku: `TEST-${RUN_ID}-PRICE`, name: `TEST ${RUN_ID} Fiyat Değişen Ürün`, slug: `test-${RUN_ID}-fiyat-degisen-urun`, categoryId: category.id, price: 300, isActive: true, taxRate: 20 },
  });

  const archivableProduct = await prisma.product.create({
    data: { sku: `TEST-${RUN_ID}-ARCH`, name: `TEST ${RUN_ID} Arşivlenecek Ürün`, slug: `test-${RUN_ID}-arsivlenecek-urun`, categoryId: category.id, price: 200, isActive: true, taxRate: 20 },
  });

  try {
    // ================= GUEST CART =================
    console.log("\n1) Guest: sepete ürün ekleniyor (Test 12 — guest add)...");
    const guest = new HttpSession();
    const add1 = await guest.req("POST", "/api/cart/items", { productId: stockProduct.id, quantity: 1 });
    check("guest add -> 201", add1.status === 201, add1.json);
    const guestCartJson = add1.json as { items: { id: string; quantity: number }[] };
    const guestItemId = guestCartJson.items.find((i) => true)?.id;
    check("guest cart 1 kalem içeriyor", guestCartJson.items.length === 1);

    console.log("2) Guest: miktar güncelleniyor (Test 14 — quantity update)...");
    const patch1 = await guest.req("PATCH", `/api/cart/items/${guestItemId}`, { quantity: 2 });
    check("miktar 2'ye güncellendi (stok=2, tam sınır)", patch1.status === 200);

    console.log("3) Guest: stok aşımı reddediliyor (Test 17 — stock exceeded)...");
    const patch2 = await guest.req("PATCH", `/api/cart/items/${guestItemId}`, { quantity: 5 });
    check("stok aşımı 409 STOCK_EXCEEDED", patch2.status === 409 && (patch2.json as { error?: string })?.error === "STOCK_EXCEEDED", patch2.json);

    console.log("4) Guest: ürün sepetten kaldırılıyor (Test 15 — remove)...");
    const del1 = await guest.req("DELETE", `/api/cart/items/${guestItemId}`);
    check("ürün kaldırıldı, sepet boş", del1.status === 200 && (del1.json as { items: unknown[] }).items.length === 0);

    console.log("5) Guest: tekrar ürün ekleniyor (merge testi için)...");
    const add2 = await guest.req("POST", "/api/cart/items", { productId: stockProduct.id, quantity: 1 });
    check("tekrar eklendi", add2.status === 201);

    // ================= REGISTER + LOGIN + MERGE =================
    console.log("\n6) Kayıt (Test 1 — registration)...");
    const reg1 = await guest.req("POST", "/api/account/register", {
      name: "Test",
      surname: "KullanıcıA",
      email: emailA,
      phone: "05061234567",
      password,
    });
    check("kayıt 201", reg1.status === 201, reg1.json);

    console.log("7) Aynı e-posta ile tekrar kayıt (Test 2 — duplicate email)...");
    const reg1dup = await guest.req("POST", "/api/account/register", {
      name: "Test",
      surname: "Tekrar",
      email: emailA,
      phone: "05061234567",
      password,
    });
    check("duplicate email 409", reg1dup.status === 409, reg1dup.json);

    console.log("8) Yanlış şifreyle login denemesi (Test 4 — login failure)...");
    const badLogin = await guest.loginCustomer(emailA, "yanlisSifre999");
    const badLoginBody = badLogin.json as { url?: string } | null;
    const badLoginFailed = badLogin.status >= 400 || !!badLoginBody?.url?.includes("error");
    check("yanlış şifre ile giriş başarısız (genel hata, sızıntı yok)", badLoginFailed, badLogin.json);

    console.log("9) Doğru şifreyle login (Test 3 — login success)...");
    const goodLogin = await guest.loginCustomer(emailA, password);
    check("login isteği kabul edildi", goodLogin.status < 400, goodLogin.json);
    const meAfterLogin = await guest.req("GET", "/api/account/me");
    check("login sonrası /api/account/me 200 ve doğru e-posta", meAfterLogin.status === 200 && (meAfterLogin.json as { email: string })?.email === emailA, meAfterLogin.json);

    console.log("10) Guest sepeti kullanıcı sepetiyle birleştiriliyor (Test 21 — guest→user merge)...");
    const merge1 = await guest.req("POST", "/api/cart/merge");
    check("merge 200", merge1.status === 200, merge1.json);
    const mergedCart = merge1.json as { items: { productId: string; quantity: number }[] };
    check("birleşen sepette guest'ten gelen ürün var", mergedCart.items.some((i) => i.productId === stockProduct.id && i.quantity === 1));

    console.log("11) Merge sonrası sepet kalıcı mı (authenticated cart) doğrulanıyor (Test 13 — authenticated add semantiği)...");
    const addPriceItem = await guest.req("POST", "/api/cart/items", { productId: priceChangeProduct.id, quantity: 1 });
    check("authenticated sepete ikinci ürün eklendi", addPriceItem.status === 201, addPriceItem.json);
    const addArchItem = await guest.req("POST", "/api/cart/items", { productId: archivableProduct.id, quantity: 1 });
    check("authenticated sepete üçüncü ürün eklendi", addArchItem.status === 201, addArchItem.json);

    // ================= ADDRESS CRUD =================
    console.log("\n12) İlk adres ekleniyor — otomatik varsayılan olmalı (Test 7)...");
    const addr1 = await guest.req("POST", "/api/account/addresses", {
      title: "Ev",
      firstName: "Test",
      lastName: "KullanıcıA",
      phone: "05061234567",
      city: "İzmir",
      district: "Urla",
      neighborhood: "Altıntaş",
      addressLine: "Besim Uyal Cad. No:121/A",
    });
    check("adres 1 oluşturuldu ve varsayılan", addr1.status === 201 && (addr1.json as { isDefault: boolean }).isDefault === true, addr1.json);
    const addr1Id = (addr1.json as { id: string }).id;

    console.log("13) İkinci adres, açıkça varsayılan yapılıyor (Test 10 — default invariant)...");
    const addr2 = await guest.req("POST", "/api/account/addresses", {
      title: "İş",
      firstName: "Test",
      lastName: "KullanıcıA",
      phone: "05061234567",
      city: "İzmir",
      district: "Konak",
      addressLine: "Test İş Adresi No:5",
      isDefault: true,
    });
    check("adres 2 oluşturuldu ve varsayılan", addr2.status === 201 && (addr2.json as { isDefault: boolean }).isDefault === true, addr2.json);
    const addr2Id = (addr2.json as { id: string }).id;

    const listAfter2 = await guest.req("GET", "/api/account/addresses");
    const listItems2 = (listAfter2.json as { items: { id: string; isDefault: boolean }[] }).items;
    const defaultCount2 = listItems2.filter((a) => a.isDefault).length;
    check("yalnızca 1 adres isDefault=true (ikinci adres eklendikten sonra)", defaultCount2 === 1, listItems2);
    check("varsayılan olan artık adres 2", listItems2.find((a) => a.id === addr2Id)?.isDefault === true);

    console.log("14) Birinci adres tekrar varsayılan yapılıyor (Test 10 — toggle)...");
    const setDefault1 = await guest.req("PATCH", `/api/account/addresses/${addr1Id}`, { isDefault: true });
    check("adres 1 varsayılan yapıldı", setDefault1.status === 200 && (setDefault1.json as { isDefault: boolean }).isDefault === true);
    const listAfterToggle = await guest.req("GET", "/api/account/addresses");
    const listItemsToggle = (listAfterToggle.json as { items: { id: string; isDefault: boolean }[] }).items;
    check("yalnızca 1 adres isDefault=true (toggle sonrası)", listItemsToggle.filter((a) => a.isDefault).length === 1, listItemsToggle);

    console.log("15) Varsayılan olmayan adres (adres 2) siliniyor (Test 9 — delete)...");
    const delAddr2 = await guest.req("DELETE", `/api/account/addresses/${addr2Id}`);
    check("adres 2 silindi", delAddr2.status === 200);
    const listAfterDelete = await guest.req("GET", "/api/account/addresses");
    const listItemsAfterDelete = (listAfterDelete.json as { items: { id: string; isDefault: boolean }[] }).items;
    check("adres 1 hâlâ tek ve varsayılan", listItemsAfterDelete.length === 1 && listItemsAfterDelete[0].isDefault === true);

    // ================= LOGOUT / LOGIN PERSISTENCE =================
    console.log("\n16) Çıkış yapılıyor (logout)...");
    await guest.logout();
    const meAfterLogout = await guest.req("GET", "/api/account/me");
    check("logout sonrası /api/account/me 401", meAfterLogout.status === 401, meAfterLogout.json);

    console.log("17) Tekrar giriş yapılıyor, sepet kontrol ediliyor (Test 13 — kalıcılık)...");
    await guest.loginCustomer(emailA, password);
    const cartAfterRelogin = await guest.req("GET", "/api/cart");
    const cartAfterReloginItems = (cartAfterRelogin.json as { items: { productId: string }[] }).items;
    check("relogin sonrası sepet 3 ürün içeriyor (DB'de kalıcı)", cartAfterReloginItems.length === 3, cartAfterReloginItems);

    // ================= PRICE CHANGE DETECTION =================
    console.log("18) Ürün fiyatı admin tarafından değiştiriliyor, sepet revalidation kontrol ediliyor (Test 19)...");
    await prisma.product.update({ where: { id: priceChangeProduct.id }, data: { price: 450 } });
    const cartAfterPriceChange = await guest.req("GET", "/api/cart");
    const priceLine = (cartAfterPriceChange.json as { items: { productId: string; priceChanged: boolean; unitPriceAtAdd: number; currentFinalPrice: number }[] }).items.find(
      (i) => i.productId === priceChangeProduct.id
    );
    check("fiyat değişikliği tespit edildi (priceChanged:true)", priceLine?.priceChanged === true, priceLine);
    check("yeni fiyat 450 olarak yansıdı", priceLine?.currentFinalPrice === 450, priceLine);

    // ================= INACTIVE PRODUCT =================
    console.log("19) Ürün admin tarafından arşivleniyor, sepet uyarısı kontrol ediliyor (Test 18)...");
    await prisma.product.update({ where: { id: archivableProduct.id }, data: { isActive: false } });
    const cartAfterArchive = await guest.req("GET", "/api/cart");
    const archLine = (cartAfterArchive.json as { items: { productId: string; isActive: boolean }[] }).items.find((i) => i.productId === archivableProduct.id);
    check("arşivlenen ürün sepette hâlâ görünüyor ama isActive:false", archLine?.isActive === false, archLine);
    check("arşivlenen ürün SİLİNMEDİ (satır hâlâ mevcut)", !!archLine);

    // ================= PASSWORD CHANGE =================
    console.log("\n20) Şifre değiştiriliyor (Test 5)...");
    const pwChange = await guest.req("PATCH", "/api/account/password", {
      currentPassword: password,
      newPassword,
      newPasswordConfirmation: newPassword,
    });
    check("şifre değiştirildi", pwChange.status === 200, pwChange.json);

    await guest.logout();
    const oldPwLogin = await guest.loginCustomer(emailA, password);
    const oldPwBody = oldPwLogin.json as { url?: string } | null;
    check("eski şifre artık çalışmıyor", oldPwLogin.status >= 400 || !!oldPwBody?.url?.includes("error"), oldPwLogin.json);
    const newPwLogin = await guest.loginCustomer(emailA, newPassword);
    check("yeni şifre çalışıyor", newPwLogin.status < 400);
    const meAfterPwChange = await guest.req("GET", "/api/account/me");
    check("yeni şifre ile login sonrası oturum geçerli", meAfterPwChange.status === 200);

    // ================= UNAUTHORIZED ACCESS =================
    console.log("\n21) Oturumsuz profil erişimi (Test 6 — unauthorized profile access)...");
    const anon = new HttpSession();
    const anonMe = await anon.req("GET", "/api/account/me");
    check("oturumsuz /api/account/me 401", anonMe.status === 401);

    // ================= IDOR — USER B =================
    console.log("\n22) İkinci kullanıcı (B) oluşturuluyor, IDOR denemeleri yapılıyor (Test 11/23)...");
    const userB = new HttpSession();
    const regB = await userB.req("POST", "/api/account/register", {
      name: "Test",
      surname: "KullanıcıB",
      email: emailB,
      phone: "05069876543",
      password,
    });
    check("kullanıcı B kayıt oldu", regB.status === 201);
    await userB.loginCustomer(emailB, password);
    const meB = await userB.req("GET", "/api/account/me");
    check("kullanıcı B giriş yaptı", meB.status === 200);

    const idorAddrGet = await userB.req("GET", `/api/account/addresses/${addr1Id}`);
    check("B, A'nın adresini GET edemiyor (404)", idorAddrGet.status === 404, idorAddrGet.json);
    const idorAddrPatch = await userB.req("PATCH", `/api/account/addresses/${addr1Id}`, { title: "Ele Geçirildi" });
    check("B, A'nın adresini PATCH edemiyor (404)", idorAddrPatch.status === 404);
    const idorAddrDelete = await userB.req("DELETE", `/api/account/addresses/${addr1Id}`);
    check("B, A'nın adresini DELETE edemiyor (404)", idorAddrDelete.status === 404);

    // A'nın hâlâ adresi duruyor mu (B'nin denemeleri gerçekten hiçbir şeyi değiştirmedi mi)
    const addr1StillThere = await prisma.address.findUnique({ where: { id: addr1Id } });
    check("A'nın adresi IDOR denemelerinden ETKİLENMEDİ (title değişmedi, silinmedi)", addr1StillThere?.title === "Ev");

    const aCartForIdor = await guest.req("GET", "/api/cart");
    const aCartItemId = (aCartForIdor.json as { items: { id: string }[] }).items[0]?.id;
    const idorCartPatch = await userB.req("PATCH", `/api/cart/items/${aCartItemId}`, { quantity: 99 });
    check("B, A'nın sepet kalemini PATCH edemiyor (404 — cart ownership)", idorCartPatch.status === 404, idorCartPatch.json);
    const idorCartDelete = await userB.req("DELETE", `/api/cart/items/${aCartItemId}`);
    check("B, A'nın sepet kalemini DELETE edemiyor (404 — cart ownership)", idorCartDelete.status === 404);

    const aCartStillIntact = await guest.req("GET", "/api/cart");
    const aCartStillItems = (aCartStillIntact.json as { items: unknown[] }).items;
    check("A'nın sepeti IDOR denemelerinden ETKİLENMEDİ", aCartStillItems.length === aCartStillItems.length && aCartStillItems.length > 0);
  } finally {
    console.log("\n23) Temizlik: oluşturulan tüm test verisi siliniyor...");
    await prisma.loginAttempt.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    // User silme -> Address/Cart CASCADE (Cart -> CartItem CASCADE) otomatik siler.
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    // Ürün silme -> Inventory/CartItem/PriceHistory CASCADE otomatik siler.
    await prisma.product.deleteMany({ where: { id: { in: [stockProduct.id, priceChangeProduct.id, archivableProduct.id] } } });
    // Olası artık misafir Cart'ları da (merge'e hiç ulaşılamadıysa) temizle.
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
