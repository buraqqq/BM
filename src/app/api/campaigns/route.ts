import { NextResponse } from "next/server";
import { getCurrentlyActiveCampaigns } from "@/lib/pricing";
import { serializeCampaign } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  const campaigns = await getCurrentlyActiveCampaigns();
  return NextResponse.json({ items: campaigns.map(serializeCampaign) });
}
