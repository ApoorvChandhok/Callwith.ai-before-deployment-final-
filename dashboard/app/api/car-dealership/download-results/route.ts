import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "..", "data");

// ── POST /api/car-dealership/download-results ──────────────────────────────────
// Car dealership version with car-specific columns: Interested Cars, Test Drive, etc.
export async function POST(req: NextRequest) {
  try {
    const { campaignId, leads, columns } = await req.json();

    if (!campaignId || !leads || !columns) {
      return NextResponse.json(
        { error: "campaignId, leads, and columns are required" },
        { status: 400 }
      );
    }

    // Sanitize campaignId
    if (!/^[a-zA-Z0-9_-]+$/.test(campaignId)) {
      return NextResponse.json({ error: "Invalid campaignId" }, { status: 400 });
    }

    // Load campaign results
    const campaignFile = path.join(DATA_DIR, `campaign_${campaignId}.json`);
    let results: any[] = [];
    if (fs.existsSync(campaignFile)) {
      try {
        results = JSON.parse(fs.readFileSync(campaignFile, "utf-8"));
      } catch {}
    }

    // Build CSV rows
    const resultByRow: Record<number, any> = {};
    for (const r of results) {
      resultByRow[r.row_index] = r;
    }

    const enrichedColumns = [
      ...columns,
      "Status",
      "Call Summary",
      "Sentiment",
      "Caller Intent",
      "Interested Cars",
      "Test Drive",
      "Car Requirements",
    ];

    const csvRows: string[] = [];
    csvRows.push(enrichedColumns.map((c) => `"${c}"`).join(","));

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const result = resultByRow[i];

      const row = columns.map((col: string) => {
        const val = lead[col] ?? "";
        return `"${String(val).replace(/"/g, '""')}"`;
      });

      if (result) {
        row.push(`"${result.status || "Pending"}"`);
        row.push(`"${(result.remarks || "").replace(/"/g, '""')}"`);
        row.push(`"${result.sentiment || ""}"`);
        row.push(`"${result.intent || ""}"`);
        row.push(`"${(result.interested_cars || []).join("; ")}"`);
        row.push(`"${result.test_drive_booked ? "Yes" : "No"}"`);
        row.push(`"${JSON.stringify(result.car_requirements || {}).replace(/"/g, '""')}"`);
      } else {
        row.push('"Pending"', '""', '""', '""', '""', '"No"', '""');
      }

      csvRows.push(row.join(","));
    }

    const csv = csvRows.join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="car_dealership_${campaignId}_results.csv"`,
      },
    });
  } catch (err: any) {
    console.error("[Car Dealership Download]", err);
    return NextResponse.json({ error: err.message || "Download failed" }, { status: 500 });
  }
}
