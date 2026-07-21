/**
 * paths.ts - Centralized file-path resolver for serverless compatibility.
 *
 * In Vercel / AWS Lambda the app bundle lives at /var/task which is READ-ONLY.
 * Only /tmp is writable at runtime.
 *
 * Strategy:
 *  - WRITE_DATA_DIR  /tmp/data  (always writable)
 *  - READ_DATA_DIR   original ../data path (bundled, read-only source of truth)
 *
 * All server-side code that writes JSON/CSV must use getWritePath().
 * Reads use getReadPath() which checks /tmp first (for freshly-written data),
 * then falls back to the bundled READ_DATA_DIR.
 */

import fs from "fs";
import path from "path";

const IS_SERVERLESS =
  process.env.VERCEL === "1" ||
  process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined ||
  (process.env.NODE_ENV === "production" && !process.env.DATA_DIR_OVERRIDE);

/** Directory for all file WRITES - /tmp/data in production, ../data in dev */
export const WRITE_DATA_DIR: string = IS_SERVERLESS
  ? "/tmp/data"
  : path.join(process.cwd(), "..", "data");

/** Directory where bundled/source data lives - always ../data */
export const READ_DATA_DIR: string = path.join(process.cwd(), "..", "data");

/** Ensure the writable data directory exists (safe to call repeatedly) */
export function ensureWriteDir(): void {
  if (!fs.existsSync(WRITE_DATA_DIR)) {
    fs.mkdirSync(WRITE_DATA_DIR, { recursive: true });
  }
}

/**
 * Get the best path for READING a file.
 * Checks the writable /tmp/data copy first (most up-to-date),
 * then falls back to the read-only bundled copy.
 */
export function getReadPath(filename: string): string {
  const writeCopy = path.join(WRITE_DATA_DIR, filename);
  if (fs.existsSync(writeCopy)) return writeCopy;
  return path.join(READ_DATA_DIR, filename);
}

/** Get the path for WRITING a file (always in WRITE_DATA_DIR) */
export function getWritePath(filename: string): string {
  ensureWriteDir();
  return path.join(WRITE_DATA_DIR, filename);
}
