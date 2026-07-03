/**
 * Credentials API — CRUD for encrypted credential storage
 *
 * GET    /api/credentials        — List all credentials (metadata only)
 * POST   /api/credentials        — Create a new credential
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listCredentials,
  createCredential,
  type CredentialType,
} from "@/lib/credentials-store";

export async function GET() {
  try {
    const credentials = listCredentials();
    return NextResponse.json({ credentials });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, type, data } = body;

    if (!name || !type || !data) {
      return NextResponse.json(
        { error: "Missing required fields: name, type, data" },
        { status: 400 }
      );
    }

    const credential = createCredential(name, type as CredentialType, data);
    return NextResponse.json({ credential }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
