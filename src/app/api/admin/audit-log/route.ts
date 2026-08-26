import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Audit log görüntülemek de en az ADMIN yetkisi ister (STAFF göremez) —
  // hassas operasyonel bilgi içerir (IP, kullanıcı, metadata).
  const auth = await requireAdmin(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity") ?? undefined;
  const action = searchParams.get("action") ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? 50)));

  const where: Record<string, unknown> = {};
  if (entity) where.entity = entity;
  if (action) where.action = action;

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { adminUser: { select: { email: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({
    items: items.map((l) => ({
      id: l.id,
      admin: l.adminUser ? { email: l.adminUser.email, name: l.adminUser.name } : null,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      ipAddress: l.ipAddress,
      metadata: l.metadataJson ? JSON.parse(l.metadataJson) : null,
      createdAt: l.createdAt,
    })),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  });
}
