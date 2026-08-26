import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { importPreviewSchema } from "@/lib/validation";
import { validateImportRows, summarizeImportRows } from "@/lib/import-products";

export const dynamic = "force-dynamic";

/**
 * Bölüm 23/24 — CSV İçe Aktarma: ÖNİZLEME (dry-run, DB'ye hiçbir yazma yapmaz).
 * POST /api/admin/import/preview  { rows, columnMapping }
 * Dönen her satır için: hata/uyarı listesi, CREATE/UPDATE/SKIP kararı.
 * Aynı doğrulama fonksiyonu commit ucunda da kullanılır — önizlemede
 * görülen sonuç ile gerçekte uygulanan davranış ASLA farklılaşmaz.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = importPreviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const { rows, columnMapping } = parsed.data;

  const [categories, brands, existingProducts] = await Promise.all([
    prisma.category.findMany({ select: { id: true, title: true } }),
    prisma.brand.findMany({ select: { id: true, name: true } }),
    prisma.product.findMany({ select: { id: true, sku: true, barcode: true, name: true } }),
  ]);

  const results = validateImportRows(rows, columnMapping, { categories, brands, existingProducts });
  const summary = summarizeImportRows(results);

  return NextResponse.json({ summary, rows: results });
}
