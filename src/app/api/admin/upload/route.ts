import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { saveUploadedImage, type StorageCategory } from "@/lib/storage";
import { writeAuditLog, getClientIp } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ALLOWED_CATEGORIES: StorageCategory[] = ["products", "banners", "garden", "ai-generated"];

// Bölüm 17 — image storage. multipart/form-data: file, category, productId?
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "VALIDATION_ERROR", message: "multipart/form-data bekleniyor" }, { status: 400 });

  const file = form.get("file");
  const category = (form.get("category") as string) ?? "products";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "file alanı zorunlu" }, { status: 400 });
  }
  if (!ALLOWED_CATEGORIES.includes(category as StorageCategory)) {
    return NextResponse.json({ error: "VALIDATION_ERROR", message: "Geçersiz category" }, { status: 400 });
  }

  try {
    const stored = await saveUploadedImage(category as StorageCategory, file);
    await writeAuditLog({
      adminUserId: auth.session.user.id,
      action: "PRODUCT_UPDATE",
      entity: "Upload",
      entityId: null,
      ipAddress: getClientIp(req),
      metadata: { url: stored.url, category, bytes: stored.bytes },
    });
    return NextResponse.json(stored, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "UPLOAD_FAILED", message: (err as Error).message }, { status: 400 });
  }
}
