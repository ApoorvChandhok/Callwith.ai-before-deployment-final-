import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "..", "data");

// ── POST /api/real-estate/download-results ────────────────────────────────────
// Extended version of /api/campaign/download with enriched columns for
// real estate campaigns: Email Status, Call Summary, Sentiment,
// Interested Projects, Brochure Sent.
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
      results = JSON.parse(fs.readFileSync(campaignFile, "utf-8"));
    }

    // Build a Map of rowIndex → result for quick lookup
    const resultMap = new Map<number, any>();
    for (const r of results) {
      resultMap.set(r.row_index, r);
    }

    // Enriched columns (beyond the standard Call Status / Remarks / Sentiment)
    const enrichedColumns = [
      "Call Status",
      "Email Status",
      "Call Summary",
      "Sentiment",
      "Interested Projects",
      "Brochure Sent",
    ];

    const allColumns = [...columns, ...enrichedColumns];

    // Escape a CSV cell value
    const escapeCell = (val: string) => {
      const s = String(val ?? "");
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const rows: string[] = [];

    // Header row
    rows.push(allColumns.map(escapeCell).join(","));

    // Data rows
    leads.forEach((lead: Record<string, string>, index: number) => {
      const result = resultMap.get(index);
      const rowCells = columns.map((col: string) => escapeCell(lead[col] ?? ""));

      // Standard columns
      rowCells.push(escapeCell(result?.status ?? "Pending"));
      // Enriched columns
      rowCells.push(escapeCell(result?.email_status ?? "Not Sent"));
      rowCells.push(escapeCell(result?.remarks ?? ""));
      rowCells.push(escapeCell(result?.sentiment ?? ""));
      rowCells.push(
        escapeCell(
          Array.isArray(result?.interested_projects)
            ? result.interested_projects.join("; ")
            : result?.interested_projects ?? ""
        )
      );
      rowCells.push(escapeCell(result?.brochure_sent ?? ""));

      rows.push(rowCells.join(","));
    });

    const csvContent = rows.join("\n");

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="real_estate_${campaignId}_results.csv"`,
      },
    });
  } catch (err: any) {
    console.error("[Real Estate Download Results]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
