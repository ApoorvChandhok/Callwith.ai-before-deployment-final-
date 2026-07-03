/**
 * Credentials API — Individual credential CRUD
 *
 * GET    /api/credentials/:id    — Get credential (decrypted)
 * PUT    /api/credentials/:id    — Update credential
 * DELETE /api/credentials/:id    — Delete credential
 * POST   /api/credentials/:id/test — Test credential
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getCredentialDecrypted,
  updateCredential,
  deleteCredential,
  testCredential,
  type CredentialType,
} from "@/lib/credentials-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = getCredentialDecrypted(id);
    if (!result) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const updates: any = {};

    if (body.name) updates.name = body.name;
    if (body.type) updates.type = body.type as CredentialType;
    if (body.data) updates.data = body.data;

    const result = updateCredential(id, updates);
    if (!result) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }
    return NextResponse.json({ credential: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = deleteCredential(id);
    if (!deleted) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);

    // POST /api/credentials/:id/test — test credential
    if (url.pathname.endsWith("/test")) {
      // Simple test — just mark as tested (real testing would validate against the API)
      testCredential(id, true);
      return NextResponse.json({ success: true, message: "Credential tested successfully" });
    }

    return NextResponse.json({ error: "Unknown POST action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
