import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Public — yalnızca "contact_", "site_", "whatsapp_", "footer_" önekli
 * anahtarlar döner (marka/iletişim bilgisi). İleride hassas ayarlar
 * eklenirse burada whitelist genişletilmeden dışarı sızmaz.
 */
const PUBLIC_PREFIXES = ["contact_", "site_", "whatsapp_", "footer_"];

export async function GET() {
  const rows = await prisma.setting.findMany();
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (PUBLIC_PREFIXES.some((p) => row.key.startsWith(p))) {
      map[row.key] = row.value;
    }
  }
  return NextResponse.json(map);
}
