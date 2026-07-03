/**
 * Credentials Store — Encrypted credential storage (n8n-style)
 *
 * Stores API keys, OAuth tokens, and other secrets securely.
 * Uses AES-256-GCM encryption for stored values.
 *
 * SERVER-ONLY — uses Node.js fs/path/crypto modules.
 * Client-side code should use credential-types.ts for types.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
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

const DATA_DIR = path.join(process.cwd(), "..", "data");
const CREDENTIALS_FILE = path.join(DATA_DIR, "credentials.json");
const ENCRYPTION_KEY_ENV = "CREDENTIALS_ENCRYPTION_KEY";

function getEncryptionKey(): Buffer {
  const keyHex = process.env[ENCRYPTION_KEY_ENV];
  if (keyHex && keyHex.length === 64) {
    return Buffer.from(keyHex, "hex");
  }
  // Derive a key from a passphrase or generate a random one
  const passphrase = process.env.SESSION_SECRET || "default-dev-key-change-in-production";
  return crypto.scryptSync(passphrase, "n8n-credentials-salt", 32);
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

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readCredentials(): StoredCredential[] {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) return [];
    return JSON.parse(fs.readFileSync(CREDENTIALS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeCredentials(credentials: StoredCredential[]) {
  ensureDataDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), "utf-8");
}

function generateId(): string {
  return `cred_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function listCredentials(): CredentialMetadata[] {
  return readCredentials().map(({ data: _, ...meta }) => meta);
}

export function getCredential(id: string): StoredCredential | null {
  return readCredentials().find((c) => c.id === id) || null;
}

export function getCredentialDecrypted(id: string): { metadata: CredentialMetadata; data: Record<string, any> } | null {
  const cred = getCredential(id);
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

export function createCredential(
  name: string,
  type: CredentialType,
  data: Record<string, any>
): CredentialMetadata {
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

  const all = readCredentials();
  all.push(credential);
  writeCredentials(all);

  const { data: _, ...metadata } = credential;
  return metadata;
}

export function updateCredential(
  id: string,
  updates: Partial<Pick<StoredCredential, "name" | "type" | "data">>
): CredentialMetadata | null {
  const all = readCredentials();
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

  writeCredentials(all);
  const { data: _, ...metadata } = all[idx];
  return metadata;
}

export function deleteCredential(id: string): boolean {
  const all = readCredentials();
  const filtered = all.filter((c) => c.id !== id);
  if (filtered.length === all.length) return false;
  writeCredentials(filtered);
  return true;
}

export function testCredential(id: string, success: boolean, error?: string): void {
  const all = readCredentials();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return;

  all[idx].testedAt = new Date().toISOString();
  all[idx].testStatus = success ? "success" : "error";
  all[idx].testError = error;
  writeCredentials(all);
}