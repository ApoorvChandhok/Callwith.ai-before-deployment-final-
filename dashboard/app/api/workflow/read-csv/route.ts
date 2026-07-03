import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "..", "data");

// GET /api/workflow/read-csv?path=data/leads.csv
// Reads a CSV file from the data directory and returns parsed rows.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get("path") || "leads.csv";

    // Security: only allow reading from the data directory
    const fullPath = path.resolve(DATA_DIR, filePath);
    if (!fullPath.startsWith(path.resolve(DATA_DIR))) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: `File not found: ${filePath}` }, { status: 404 });
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      return NextResponse.json({ leads: [], headers: [] });
    }

    const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const leads = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = vals[idx] || "";
      });
      leads.push(obj);
    }

    return NextResponse.json({ leads, headers, count: leads.length });
  } catch (err: any) {
    console.error("[ReadCSV]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
