import { prisma } from "@/lib/prisma";
import { getCurrentlyActiveCampaigns } from "@/lib/pricing";
import {
  serializePublicProduct,
  serializeCategory,
  serializeBanner,
  serializeCampaign,
} from "@/lib/serialize";

const PUBLIC_SETTING_PREFIXES = ["contact_", "site_", "whatsapp_", "footer_"];

/**
 * Ana sayfanın ihtiyaç duyduğu tüm veriyi TEK yerde, doğrudan Prisma
 * üzerinden okur. Önceden ana sayfa kendi /api/* uçlarına 5-6 ayrı HTTP
 * isteği atıyordu; Vercel serverless'ta bu, her istekte 5-6 ekstra fonksiyon
 * çağrısı + 5-6 ekstra DB bağlantısı demekti (yükü ~6 kat artırıp aralıklı
 * 500'lere yol açıyordu). Bu fonksiyon bunu tek bir sorgu grubuna indirir.
 *
 * API route'ları (/api/categories, /api/products, ...) aynı Prisma
 * sorgularını ve aynı serialize fonksiyonlarını kullanmaya devam eder —
 * burada iş mantığı YENİDEN yazılmadı, yalnızca ana sayfa için doğrudan
 * çağrılır hale getirildi.
 */
export async function getHomepageData() {
  const now = new Date();

  const [categories, products, settingsRows, banners, campaigns] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      include: { category: true, brand: true, images: true, inventory: true },
      orderBy: { name: "asc" },
    }),
    prisma.setting.findMany(),
    prisma.banner.findMany({
      where: { isActive: true, startDate: { lte: now }, endDate: { gte: now } },
      orderBy: { priority: "desc" },
    }),
    getCurrentlyActiveCampaigns(),
  ]);

  const settings: Record<string, string> = {};
  for (const row of settingsRows) {
    if (PUBLIC_SETTING_PREFIXES.some((p) => row.key.startsWith(p))) {
      settings[row.key] = row.value;
    }
  }

  return {
    categories: categories.map(serializeCategory),
    products: products.map((p) => {
      const s = serializePublicProduct(p, campaigns);
      // API (JSON) davranışıyla birebir aynı olsun diye Date → ISO string:
      // eski self-fetch akışında NextResponse.json() bunu zaten yapıyordu.
      return { ...s, createdAt: s.createdAt.toISOString() };
    }),
    settings,
    banners: banners.map(serializeBanner),
    campaigns: campaigns.map(serializeCampaign),
  };
}
