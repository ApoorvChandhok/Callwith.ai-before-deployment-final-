/**
 * Credentials Store — Encrypted credential storage (n8n-style)
 *
 * Stores API keys, OAuth tokens, and other secrets securely.
 * Uses AES-256-GCM encryption for stored values.
 *
 * SERVER-ONLY — uses Node.js fs/path/crypto modules.
 * Client-side code should use credential-types.ts for types.
 */

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { CredentialType, CredentialField, CredentialDefinition } from "./credential-types";
export type { CredentialType, CredentialField, CredentialDefinition, CredentialMetadata } from "./credential-types";
import type { CredentialMetadata } from "./credential-types";

// Re-export for convenience
export { CREDENTIAL_DEFINITIONS, getCredentialDefinition } from "./credential-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoredCredential {
  id: string;
  name: string;
  type: CredentialType;
  data: Record<string, any>; // encrypted
  createdAt: string;
  updatedAt: string;
  testedAt?: string;
  testStatus?: "success" | "error";
  testError?: string;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const ENCRYPTION_KEY_ENV = "CREDENTIALS_ENCRYPTION_KEY";

function getEncryptionKey(): Buffer {
  const keyHex = process.env[ENCRYPTION_KEY_ENV];
  if (keyHex && keyHex.length === 64) {
    return Buffer.from(keyHex, "hex");
  }
  // Derive from SESSION_SECRET if available
  const passphrase = process.env.SESSION_SECRET;
  if (passphrase) {
    return crypto.scryptSync(passphrase, "n8n-credentials-salt", 32);
  }
  // SECURITY: Never use a hardcoded fallback in production
  // Fail hard so the misconfiguration is caught immediately at deploy time
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[credentials-store] FATAL: Neither CREDENTIALS_ENCRYPTION_KEY nor SESSION_SECRET is set. ` +
      `All credential operations are blocked in production to prevent data exposure. ` +
      `Set CREDENTIALS_ENCRYPTION_KEY (64-char hex) in your environment.`
    );
  }
  // Development only: use a deterministic but clearly dev-only key
  console.warn("[credentials-store] ⚠️  No encryption key configured — using dev-only key. Set CREDENTIALS_ENCRYPTION_KEY in .env!");
  return crypto.scryptSync("dev-only-unsafe-key-set-env-in-production", "n8n-credentials-salt", 32);
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("[credentials-store] Missing Supabase URL or Service Role Key");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function readCredentials(workspaceId: string): Promise<StoredCredential[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("workspace_config")
    .select("encrypted_credentials")
    .eq("business_id", workspaceId)
    .single();

  if (error || !data || !data.encrypted_credentials) {
    return [];
  }
  return data.encrypted_credentials as StoredCredential[];
}

async function writeCredentials(workspaceId: string, credentials: StoredCredential[]): Promise<void> {
  const admin = getAdminClient();
  const { error } = await admin
    .from("workspace_config")
    .update({ encrypted_credentials: credentials })
    .eq("business_id", workspaceId);

  if (error) {
    console.error("[credentials-store] Error saving credentials:", error.message);
    throw new Error("Failed to save credentials");
  }
}

function generateId(): string {
  return `cred_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function listCredentials(workspaceId: string): Promise<CredentialMetadata[]> {
  const all = await readCredentials(workspaceId);
  return all.map(({ data: _, ...meta }) => meta);
}

export async function getCredential(workspaceId: string, id: string): Promise<StoredCredential | null> {
  const all = await readCredentials(workspaceId);
  return all.find((c) => c.id === id) || null;
}

export async function getCredentialDecrypted(workspaceId: string, id: string): Promise<{ metadata: CredentialMetadata; data: Record<string, any> } | null> {
  const cred = await getCredential(workspaceId, id);
  if (!cred) return null;

  const decryptedData: Record<string, any> = {};
  for (const [key, value] of Object.entries(cred.data)) {
    try {
      decryptedData[key] = decrypt(value);
    } catch {
      decryptedData[key] = value; // fallback if not encrypted
    }
  }

  const { data: _, ...metadata } = cred;
  return { metadata, data: decryptedData };
}

export async function createCredential(
  workspaceId: string,
  name: string,
  type: CredentialType,
  data: Record<string, any>
): Promise<CredentialMetadata> {
  const now = new Date().toISOString();
  const encryptedData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    encryptedData[key] = encrypt(String(value));
  }

  const credential: StoredCredential = {
    id: generateId(),
    name,
    type,
    data: encryptedData,
    createdAt: now,
    updatedAt: now,
  };

  const all = await readCredentials(workspaceId);
  all.push(credential);
  await writeCredentials(workspaceId, all);

  const { data: _, ...metadata } = credential;
  return metadata;
}

export async function updateCredential(
  workspaceId: string,
  id: string,
  updates: Partial<Pick<StoredCredential, "name" | "type" | "data">>
): Promise<CredentialMetadata | null> {
  const all = await readCredentials(workspaceId);
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  const existing = all[idx];
  const now = new Date().toISOString();

  if (updates.data) {
    const encryptedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates.data)) {
      encryptedData[key] = encrypt(String(value));
    }
    updates.data = encryptedData;
  }

  all[idx] = {
    ...existing,
    ...updates,
    updatedAt: now,
  };

  await writeCredentials(workspaceId, all);
  const { data: _, ...metadata } = all[idx];
  return metadata;
}

export async function deleteCredential(workspaceId: string, id: string): Promise<boolean> {
  const all = await readCredentials(workspaceId);
  const filtered = all.filter((c) => c.id !== id);
  if (filtered.length === all.length) return false;
  await writeCredentials(workspaceId, filtered);
  return true;
}

export async function testCredential(workspaceId: string, id: string, success: boolean, error?: string): Promise<void> {
  const all = await readCredentials(workspaceId);
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return;

  all[idx].testedAt = new Date().toISOString();
  all[idx].testStatus = success ? "success" : "error";
  all[idx].testError = error;
  await writeCredentials(workspaceId, all);
}