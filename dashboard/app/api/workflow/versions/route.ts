/**
 * Workflow Versions API — Version history CRUD
 *
 * GET    /api/workflow/versions?workflowId=xxx  — List versions
 * POST   /api/workflow/versions                  — Save new version
 */

import { NextRequest, NextResponse } from "next/server";
import { saveVersion, getVersions } from "@/lib/workflow-versioning";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workflowId = searchParams.get("workflowId");
    if (!workflowId) {
      return NextResponse.json({ error: "workflowId required" }, { status: 400 });
    }
    const versions = getVersions(workflowId);
    return NextResponse.json({ versions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workflowId, snapshot, label } = body;
    if (!workflowId || !snapshot) {
      return NextResponse.json({ error: "workflowId and snapshot required" }, { status: 400 });
    }
    const version = saveVersion(workflowId, snapshot, label);
    return NextResponse.json({ version }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
