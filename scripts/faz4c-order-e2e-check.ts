/**
 * FAZ 4C — Bölüm Q: kapsamlı, GERÇEK çalışan dev/prod server'a karşı,
 * self-cleaning E2E doğrulama.
 *
 * Checkout Validation → Secure Order Creation → Inventory Update →
 * Customer Order History → Admin Order Management zincirini gerçek HTTP
 * istekleriyle (fetch + cookie jar) doğrular. Cookie-jar/login mekanizması
 * faz4a/faz4b ile AYNI desendir (yeniden icat edilmedi).
 *
 * SONUNDA oluşturduğu HER ŞEYİ (Order/OrderItem/AddressSnapshot/StatusHistory,
 * InventoryMovement, User x2, Address, Cart/CartItem, Product x N,
 * LoginAttempt) SİLER — production baseline (257 aktif / 260 toplam ürün)
 * bozulmaz.
 *
 * Çalıştırma: dev/prod server ayrı bir terminalde çalışırken:
 *   npx tsx scripts/faz4c-order-e2e-check.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const RUN_ID = "e2efaz4c";
const CUSTOMER_PASSWORD = "Sifre1234";

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
      if (value === "" || sc.toLowerCase().includes("max-age=0")) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  async req(method: string, path: string, body?: unknown, formEncoded = false): Promise<{ status: number; json: any; res: Response }> {
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
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* json olmayan gövde */
    }
    return { status: res.status, json, res };
  }

  async loginCustomer(email: string, password: string) {
    const csrfRes = await this.req("GET", "/api/auth/csrf");
    const csrfToken = (csrfRes.json as { csrfToken?: string })?.csrfToken ?? "";
    return this.req("POST", "/api/auth/callback/customer-credentials", { csrfToken, email, password, json: "true" }, true);
  }

  async loginAdmin(email: string, password: string) {
    const csrfRes = await this.req("GET", "/api/auth/csrf");
    const csrfToken = (csrfRes.json as { csrfToken?: string })?.csrfToken ?? "";
    return this.req("POST", "/api/auth/callback/credentials", { csrfToken, email, password, json: "true" }, true);
  }
}

async function main() {
  const emailA = `${RUN_ID}-a@example.com`;
  const emailB = `${RUN_ID}-b@example.com`;
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? "admin@bmvourla.com";
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "";

  // Geçici test ürünleri + stok
  const category = await prisma.category.findFirst({ where: { isActive: true } });
  if (!category) throw new Error("Aktif kategori bulunamadı");

  const productA = await prisma.product.create({ data: { sku: `TEST-${RUN_ID}-A`, name: `TEST ${RUN_ID} Ürün A`, slug: `test-${RUN_ID}-a`, categoryId: category.id, price: 100, isActive: true } });
  await prisma.inventory.create({ data: { productId: productA.id, quantity: 10, stockStatus: "IN_STOCK" } });

  const productLow = await prisma.product.create({ data: { sku: `TEST-${RUN_ID}-LOW`, name: `TEST ${RUN_ID} Düşük Stok`, slug: `test-${RUN_ID}-low`, categoryId: category.id, price: 50, isActive: true } });
  await prisma.inventory.create({ data: { productId: productLow.id, quantity: 2, stockStatus: "IN_STOCK" } });

  const productInactive = await prisma.product.create({ data: { sku: `TEST-${RUN_ID}-INACT`, name: `TEST ${RUN_ID} Pasif`, slug: `test-${RUN_ID}-inact`, categoryId: category.id, price: 70, isActive: true } });
  await prisma.inventory.create({ data: { productId: productInactive.id, quantity: 5, stockStatus: "IN_STOCK" } });

  const createdProductIds = [productA.id, productLow.id, productInactive.id];

  try {
    // ================= GUEST GATE =================
    console.log("\n1) Guest POST /api/orders → 401");
    const guest = new HttpSession();
    const guestOrder = await guest.req("POST", "/api/orders", { deliveryMethod: "PICKUP" });
    check("guest order → 401", guestOrder.status === 401, guestOrder.status);

    // ================= REGISTER + LOGIN A =================
    console.log("2) Kayıt + giriş (müşteri A)");
    const regA = await guest.req("POST", "/api/account/register", { name: "Test", surname: "KullanıcıA", email: emailA, phone: "05061234567", password: CUSTOMER_PASSWORD });
    check("kayıt A → 201", regA.status === 201, regA.status);
    await guest.loginCustomer(emailA, CUSTOMER_PASSWORD);

    // ================= EMPTY CART =================
    console.log("3) Boş sepet → order oluşmaz");
    const emptyOrder = await guest.req("POST", "/api/orders", { deliveryMethod: "PICKUP" });
    check("boş sepet → 422 EMPTY_CART", emptyOrder.status === 422 && emptyOrder.json?.error === "EMPTY_CART", emptyOrder.json);

    // ================= ADD + PICKUP ORDER =================
    console.log("4) Sepete ürün ekle + PICKUP siparişi oluştur");
    await guest.req("POST", "/api/cart/items", { productId: productA.id, quantity: 2 });
    const createPickup = await guest.req("POST", "/api/orders", { deliveryMethod: "PICKUP" });
    check("PICKUP order → 201", createPickup.status === 201, createPickup.json);
    const pickupOrder = createPickup.json as any;
    check("orderNumber var + BM- prefix", !!pickupOrder?.orderNumber && pickupOrder.orderNumber.startsWith("BM-"), pickupOrder?.orderNumber);
    check("status PENDING", pickupOrder?.status === "PENDING", pickupOrder?.status);
    check("paymentStatus PENDING (sahte ödeme yok)", pickupOrder?.paymentStatus === "PENDING", pickupOrder?.paymentStatus);
    check("subtotal = 2 × 100 = 200", pickupOrder?.subtotal === 200, pickupOrder?.subtotal);
    check("PICKUP shipping computed:true + 0", pickupOrder?.shippingComputed === true && pickupOrder?.shippingAmount === 0, pickupOrder);
    check("item snapshot korunuyor", pickupOrder?.items?.length === 1 && pickupOrder.items[0].sku === productA.sku && pickupOrder.items[0].quantity === 2, pickupOrder?.items);

    // ================= INVENTORY + CART FINALIZE =================
    console.log("5) Stok düştü + SALE hareketi + sepet CONVERTED");
    const invAfter = await prisma.inventory.findUnique({ where: { productId: productA.id } });
    check("stok 10 → 8", invAfter?.quantity === 8, invAfter?.quantity);
    const saleMove = await prisma.inventoryMovement.findFirst({ where: { inventoryId: invAfter!.id, type: "SALE" } });
    check("SALE hareketi var + -2", saleMove?.quantityChange === -2 && saleMove?.resultingQuantity === 8, saleMove);
    const cartAfter = await prisma.cart.findFirst({ where: { items: { some: { productId: productA.id } } }, orderBy: { createdAt: "desc" } });
    check("sepet CONVERTED", cartAfter?.status === "CONVERTED", cartAfter?.status);

    // ================= DUPLICATE SUBMIT =================
    console.log("6) Aynı istek tekrar → duplicate order yok");
    const dupOrder = await guest.req("POST", "/api/orders", { deliveryMethod: "PICKUP" });
    const orderCountForCart = await prisma.order.count({ where: { cartId: cartAfter?.id } });
    check("tekrar submit yeni order üretmez", dupOrder.status !== 201 && orderCountForCart === 1, { status: dupOrder.status, count: orderCountForCart });

    // ================= STOCK INSUFFICIENT (at order time) =================
    console.log("7) Sipariş ANINDA yetersiz stok → order oluşmaz");
    await guest.req("DELETE", "/api/cart");
    await guest.req("POST", "/api/cart/items", { productId: productLow.id, quantity: 2 }); // stok içinde (2)
    await prisma.inventory.update({ where: { productId: productLow.id }, data: { quantity: 1 } }); // eşzamanlı satış simülasyonu
    const stockFail = await guest.req("POST", "/api/orders", { deliveryMethod: "PICKUP" });
    check("stok yetersiz → 422 STOCK_INSUFFICIENT", stockFail.status === 422 && stockFail.json?.error === "STOCK_INSUFFICIENT", stockFail.json);
    await prisma.inventory.update({ where: { productId: productLow.id }, data: { quantity: 2 } });

    // ================= INACTIVE PRODUCT =================
    console.log("8) Sipariş öncesi ürün pasifleşirse → reddedilir");
    await guest.req("DELETE", "/api/cart");
    await guest.req("POST", "/api/cart/items", { productId: productInactive.id, quantity: 1 });
    await prisma.product.update({ where: { id: productInactive.id }, data: { isActive: false } });
    const inactiveFail = await guest.req("POST", "/api/orders", { deliveryMethod: "PICKUP" });
    check("pasif ürün → 422 INACTIVE_PRODUCT", inactiveFail.status === 422 && inactiveFail.json?.error === "INACTIVE_PRODUCT", inactiveFail.json);
    await prisma.product.update({ where: { id: productInactive.id }, data: { isActive: true } });

    // ================= DELIVERY ORDER (address) =================
    console.log("9) Adres ekle + DELIVERY siparişi (shipping snapshot)");
    await guest.req("DELETE", "/api/cart");
    const addr = await guest.req("POST", "/api/account/addresses", { title: "Ev", firstName: "Test", lastName: "KullanıcıA", phone: "05061234567", city: "İzmir", district: "Urla", addressLine: "Altıntaş Mah. No:1", country: "Türkiye" });
    const addressId = (addr.json as any)?.id;
    await guest.req("POST", "/api/cart/items", { productId: productA.id, quantity: 1 });
    const deliveryOrder = await guest.req("POST", "/api/orders", { addressId, deliveryMethod: "DELIVERY" });
    check("DELIVERY order → 201", deliveryOrder.status === 201, deliveryOrder.json);
    check("shipping computed:false + not", deliveryOrder.json?.shippingComputed === false && typeof deliveryOrder.json?.shippingNote === "string", deliveryOrder.json);
    check("adres snapshot'ı siparişte", !!deliveryOrder.json?.addressSnapshot && deliveryOrder.json.addressSnapshot.city === "İzmir", deliveryOrder.json?.addressSnapshot);

    // ================= ADDRESS IDOR =================
    console.log("10) Başkasının addressId'si → IDOR reddi");
    const userB = new HttpSession();
    await userB.req("POST", "/api/account/register", { name: "Test", surname: "KullanıcıB", email: emailB, phone: "05069876543", password: CUSTOMER_PASSWORD });
    await userB.loginCustomer(emailB, CUSTOMER_PASSWORD);
    await userB.req("POST", "/api/cart/items", { productId: productA.id, quantity: 1 });
    const idorAddr = await userB.req("POST", "/api/orders", { addressId, deliveryMethod: "DELIVERY" });
    check("başkasının adresi → 422 ADDRESS_NOT_FOUND", idorAddr.status === 422 && idorAddr.json?.error === "ADDRESS_NOT_FOUND", idorAddr.json);

    // ================= ORDER DETAIL IDOR =================
    console.log("11) Başkasının sipariş detayı → 404");
    const idorDetail = await userB.req("GET", `/api/orders/${pickupOrder.orderNumber}`);
    check("başkasının siparişi → 404", idorDetail.status === 404, idorDetail.status);

    // ================= CUSTOMER ORDER HISTORY =================
    console.log("12) Müşteri kendi siparişlerini görür");
    const history = await guest.req("GET", "/api/orders?page=1&pageSize=10");
    const historyNumbers = (history.json as any)?.items?.map((o: any) => o.orderNumber) ?? [];
    check("kendi siparişi listede", historyNumbers.includes(pickupOrder.orderNumber), historyNumbers);

    // ================= CUSTOMER ↔ ADMIN ISOLATION =================
    console.log("13) Müşteri admin uca erişemez");
    const customerAdmin = await guest.req("GET", "/api/admin/orders");
    check("müşteri admin sipariş listesi → 403/401", customerAdmin.status === 403 || customerAdmin.status === 401, customerAdmin.status);

    // ================= ADMIN ORDER MANAGEMENT =================
    console.log("14) Admin sipariş listesi + detay + geçerli transition");
    const admin = new HttpSession();
    await admin.loginAdmin(adminEmail, adminPassword);
    const adminList = await admin.req("GET", "/api/admin/orders?pageSize=100");
    check("admin sipariş listesi 200", adminList.status === 200, adminList.status);
    const adminDetail = await admin.req("GET", `/api/admin/orders/${pickupOrder.orderNumber}`);
    check("admin detay 200 + müşteri bilgisi", adminDetail.status === 200 && !!adminDetail.json?.customer, adminDetail.json);
    const validTrans = await admin.req("PATCH", `/api/admin/orders/${pickupOrder.orderNumber}`, { status: "CONFIRMED" });
    check("PENDING → CONFIRMED geçerli (200)", validTrans.status === 200 && validTrans.json?.status === "CONFIRMED", validTrans.json);

    console.log("15) Geçersiz transition reddedilir (CANCELLED → SHIPPED)");
    await admin.req("PATCH", `/api/admin/orders/${pickupOrder.orderNumber}`, { status: "CANCELLED" });
    const badTrans = await admin.req("PATCH", `/api/admin/orders/${pickupOrder.orderNumber}`, { status: "SHIPPED" });
    check("CANCELLED → SHIPPED → 422", badTrans.status === 422 && badTrans.json?.error === "INVALID_TRANSITION", badTrans.json);

    console.log("16) Durum geçmişi + audit log yazıldı");
    const detail2 = await admin.req("GET", `/api/admin/orders/${pickupOrder.orderNumber}`);
    check("statusHistory ≥ 3 kayıt (PENDING→CONFIRMED→CANCELLED)", (detail2.json?.statusHistory?.length ?? 0) >= 3, detail2.json?.statusHistory);
    const audit = await prisma.auditLog.findFirst({ where: { entity: "Order", action: "ORDER_STATUS_UPDATE" } });
    check("audit log ORDER_STATUS_UPDATE var", !!audit, audit?.action);
  } finally {
    // self-cleaning
    const users = await prisma.user.findMany({ where: { email: { in: [emailA, emailB] } }, select: { id: true } });
    const userIds = users.map((u) => u.id);
    if (userIds.length > 0) {
      await prisma.order.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.cart.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.address.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
    await prisma.loginAttempt.deleteMany({ where: { email: { in: [emailA, emailB, adminEmail] } } });
    await prisma.cart.deleteMany({ where: { userId: null, items: { none: {} } } });
    console.log("\n(Test verisi temizlendi)");
  }

  // ================= BASELINE (temizlik SONRASI) =================
  console.log("17) Production baseline bozulmadı");
  const activeCount = await prisma.product.count({ where: { isActive: true } });
  const totalCount = await prisma.product.count();
  check("aktif ürün = 257", activeCount === 257, activeCount);
  check("toplam ürün = 260", totalCount === 260, totalCount);

  console.log(`\n===== SONUÇ: ${passCount} geçti, ${failCount} kaldı =====`);
  if (failCount > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
