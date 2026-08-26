import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { writeAuditLog, getClientIp } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const rows = await prisma.setting.findMany({ orderBy: { key: "asc" } });
  return NextResponse.json({ items: rows });
}

const updateSchema = z.object({
  entries: z.array(z.object({ key: z.string().min(1).max(100), value: z.string().max(2000) })).min(1).max(50),
});

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.$transaction(
    parsed.data.entries.map((e) =>
      prisma.setting.upsert({ where: { key: e.key }, update: { value: e.value }, create: { key: e.key, value: e.value } })
    )
  );

  await writeAuditLog({
    adminUserId: auth.session.user.id,
    action: "SETTINGS_UPDATE",
    entity: "Settings",
    entityId: null,
    ipAddress: getClientIp(req),
    metadata: { keys: parsed.data.entries.map((e) => e.key) },
  });

  return NextResponse.json({ ok: true });
}
