import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "..", "data");

// ── POST /api/car-dealership/start-campaign ────────────────────────────────────
// Accepts: { leadsCount, ragContent }
// Generates a campaignId, saves RAG content for the tool gateway.
// Returns: { campaignId }
export async function POST(req: NextRequest) {
  try {
    const { leadsCount, ragContent } = await req.json();

    if (!leadsCount || leadsCount <= 0) {
      return NextResponse.json({ error: "leadsCount must be > 0" }, { status: 400 });
    }

    // Generate unique campaign ID with car dealership prefix
    const campaignId = `cd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Save RAG content for the tool gateway to read during calls
    const campaignData = {
      type: "car_dealership",
      ragContent: ragContent || "",
      leadsCount,
    };

    const campaignFile = path.join(DATA_DIR, `car_campaign_${campaignId}.json`);
    fs.writeFileSync(campaignFile, JSON.stringify(campaignData, null, 2));

    console.log(`[Car Dealership] Campaign ${campaignId} initialized with ${leadsCount} leads`);

    return NextResponse.json({ success: true, campaignId });
  } catch (err: any) {
    console.error("[Car Dealership Start Campaign]", err);
    return NextResponse.json({ error: err.message || "Failed to start campaign" }, { status: 500 });
  }
}
