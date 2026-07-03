import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "..", "data");

// ── POST /api/real-estate/start-campaign ──────────────────────────────────────
// Accepts: { brochures, leadsCount, emailConfig }
// Generates a campaignId, saves brochure content + email config for the tool gateway.
// Returns: { campaignId }
export async function POST(req: NextRequest) {
  try {
    const { brochures, leadsCount, emailConfig } = await req.json();

    if (!brochures || !Array.isArray(brochures) || brochures.length === 0) {
      return NextResponse.json({ error: "At least one brochure is required" }, { status: 400 });
    }

    if (!leadsCount || leadsCount <= 0) {
      return NextResponse.json({ error: "leadsCount must be > 0" }, { status: 400 });
    }

    // Generate unique campaign ID
    const campaignId = `re_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Save brochure content + email config for the tool gateway to read during calls
    const campaignData = {
      brochures: brochures.map((b: any) => ({
        name: b.name,
        fileName: b.fileName,
        content: b.content,
        charCount: b.charCount,
        description: b.description || "",
      })),
      emailConfig: {
        subject: emailConfig?.subject || "{{project.name}} — Project Brochure",
        body: emailConfig?.body || "",
        senderName: emailConfig?.senderName || "Sales Team",
      },
    };

    const campaignFile = path.join(DATA_DIR, `brochures_${campaignId}.json`);
    fs.writeFileSync(campaignFile, JSON.stringify(campaignData, null, 2));

    console.log(`[Real Estate] Campaign ${campaignId} initialized with ${brochures.length} brochures, ${leadsCount} leads`);

    return NextResponse.json({ success: true, campaignId });
  } catch (err: any) {
    console.error("[Real Estate Start Campaign]", err);
    return NextResponse.json({ error: err.message || "Failed to start campaign" }, { status: 500 });
  }
}
