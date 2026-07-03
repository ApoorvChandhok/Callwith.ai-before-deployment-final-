/**
 * Workflow Versioning — Auto-save version history
 *
 * Saves a snapshot of the workflow on each save.
 * Supports diff comparison and restore.
 */

import fs from "fs";
import path from "path";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  versionNumber: number;
  snapshot: Record<string, any>;
  createdAt: string;
  createdBy?: string;
  label?: string;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "..", "data");
const VERSIONS_FILE = path.join(DATA_DIR, "workflow_versions.json");
const MAX_VERSIONS = 50;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readVersions(): WorkflowVersion[] {
  try {
    if (!fs.existsSync(VERSIONS_FILE)) return [];
    return JSON.parse(fs.readFileSync(VERSIONS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeVersions(versions: WorkflowVersion[]) {
  ensureDataDir();
  fs.writeFileSync(VERSIONS_FILE, JSON.stringify(versions, null, 2), "utf-8");
}

// ── Public API ────────────────────────────────────────────────────────────────

export function saveVersion(
  workflowId: string,
  snapshot: Record<string, any>,
  label?: string
): WorkflowVersion {
  const all = readVersions();
  const workflowVersions = all.filter((v) => v.workflowId === workflowId);
  const nextNumber = workflowVersions.length > 0
    ? Math.max(...workflowVersions.map((v) => v.versionNumber)) + 1
    : 1;

  const version: WorkflowVersion = {
    id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    workflowId,
    versionNumber: nextNumber,
    snapshot,
    createdAt: new Date().toISOString(),
    label,
  };

  all.push(version);

  // Cap at MAX_VERSIONS per workflow
  const filtered = all.filter((v) => v.workflowId !== workflowId);
  const kept = workflowVersions.slice(-(MAX_VERSIONS - 1)); // keep last N-1
  writeVersions([...filtered, ...kept, version]);

  return version;
}

export function getVersions(workflowId: string): WorkflowVersion[] {
  return readVersions()
    .filter((v) => v.workflowId === workflowId)
    .sort((a, b) => b.versionNumber - a.versionNumber);
}

export function getVersion(versionId: string): WorkflowVersion | null {
  return readVersions().find((v) => v.id === versionId) || null;
}

export function deleteVersion(versionId: string): boolean {
  const all = readVersions();
  const filtered = all.filter((v) => v.id !== versionId);
  if (filtered.length === all.length) return false;
  writeVersions(filtered);
  return true;
}

export function getVersionDiff(
  versionId1: string,
  versionId2: string
): { added: string[]; removed: string[]; modified: string[] } | null {
  const v1 = getVersion(versionId1);
  const v2 = getVersion(versionId2);
  if (!v1 || !v2) return null;

  const keys1 = new Set(Object.keys(v1.snapshot));
  const keys2 = new Set(Object.keys(v2.snapshot));

  const added = [...keys2].filter((k) => !keys1.has(k));
  const removed = [...keys1].filter((k) => !keys2.has(k));
  const modified = [...keys1].filter(
    (k) => keys2.has(k) && JSON.stringify(v1.snapshot[k]) !== JSON.stringify(v2.snapshot[k])
  );

  return { added, removed, modified };
}
