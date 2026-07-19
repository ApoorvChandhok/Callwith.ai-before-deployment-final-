import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    // Path to leads.csv relative to the project root (one level up from dashboard/)
    const leadsPath = path.join(process.cwd(), "..", "data", "leads.csv");

    if (!fs.existsSync(leadsPath)) {
      // Return an empty CSV with headers if no leads exist yet
      const empty = "Timestamp,Name,Phone,City,Email,Status,Intent\n";
      return new NextResponse(empty, {
        status: 200,
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="leads_${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    const csv = fs.readFileSync(leadsPath, "utf-8");

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="leads_${new Date().toISOString().split("T")[0]}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
