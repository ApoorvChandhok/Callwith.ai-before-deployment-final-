"use client";

/**
 * CredentialModal — n8n-style credential creation/editing modal
 *
 * Appears when a node requires authentication.
 * Allows selecting existing credentials or creating new ones.
 */

import React, { useState, useEffect, useCallback } from "react";
import { X, Plus, Trash2, Check, Loader2, Eye, EyeOff, TestTube2, Shield } from "lucide-react";
import {
  CREDENTIAL_DEFINITIONS,
  type CredentialType,
  type CredentialDefinition,
  type CredentialField,
  type CredentialMetadata,
} from "@/lib/credential-types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (credentialId: string) => void;
  nodeType?: string;
  requiredCredentialType?: CredentialType;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CredentialModal({
  isOpen,
  onClose,
  onSelect,
  nodeType,
  requiredCredentialType,
}: Props) {
  const [credentials, setCredentials] = useState<CredentialMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CredentialType>(requiredCredentialType || "apiKey");
  const [newData, setNewData] = useState<Record<string, any>>({});
  const [showPasswordFields, setShowPasswordFields] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");

  // Fetch credentials on open
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch("/api/credentials")
      .then((r) => r.json())
      .then((data) => {
        setCredentials(data.credentials || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [isOpen]);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setSelectedId(null);
      setCreating(false);
      setNewName("");
      setNewData({});
      setError("");
    }
  }, [isOpen]);

  const definition = CREDENTIAL_DEFINITIONS.find((d) => d.type === newType);

  const handleCreate = useCallback(async () => {
    if (!newName.trim() || !definition) return;
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, type: newType, data: newData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setCredentials((prev) => [...prev, data.credential]);
      setSelectedId(data.credential.id);
      setCreating(false);
      setNewName("");
      setNewData({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [newName, newType, newData, definition]);

  const handleTest = useCallback(async (id: string) => {
    setTesting(true);
    try {
      await fetch(`/api/credentials/${id}/test`, { method: "POST" });
      setCredentials((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, testedAt: new Date().toISOString(), testStatus: "success" as const }
            : c
        )
      );
    } catch {
      setCredentials((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, testStatus: "error" as const } : c
        )
      );
    } finally {
      setTesting(false);
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await fetch(`/api/credentials/${id}`, { method: "DELETE" });
      setCredentials((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) setSelectedId(null);
    } catch {}
  }, [selectedId]);

  const handleSelect = useCallback(() => {
    if (selectedId && onSelect) {
      onSelect(selectedId);
      onClose();
    }
  }, [selectedId, onSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-[#30363d] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#2f81f7]" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-[#e6edf3]">
              {nodeType ? `Credentials for ${nodeType}` : "Credentials"}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#21262d] text-gray-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-[#2f81f7] animate-spin" />
            </div>
          ) : (
            <>
              {/* Existing credentials */}
              {credentials.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500 dark:text-[#8b949e] uppercase tracking-wider">
                    Existing Credentials
                  </label>
                  {credentials.map((cred) => (
                    <div
                      key={cred.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        selectedId === cred.id
                          ? "border-[#2f81f7] bg-blue-50/30 dark:bg-[#2f81f7]/5"
                          : "border-gray-200 dark:border-[#30363d] hover:border-gray-300 dark:hover:border-[#484f58]"
                      }`}
                      onClick={() => setSelectedId(cred.id)}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedId === cred.id
                          ? "border-[#2f81f7] bg-[#2f81f7]"
                          : "border-gray-300 dark:border-[#484f58]"
                      }`}>
                        {selectedId === cred.id && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3] truncate">{cred.name}</div>
                        <div className="text-[10px] text-gray-400 dark:text-[#6e7681] capitalize">{cred.type}</div>
                      </div>
                      {cred.testStatus && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          cred.testStatus === "success"
                            ? "bg-green-500/10 text-green-500"
                            : "bg-red-500/10 text-red-500"
                        }`}>
                          {cred.testStatus === "success" ? "✓ Tested" : "✗ Failed"}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleTest(cred.id); }}
                        disabled={testing}
                        className="p-1 rounded text-gray-400 hover:text-[#2f81f7] hover:bg-blue-50 dark:hover:bg-[#2f81f7]/10 transition-colors"
                        title="Test connection"
                      >
                        <TestTube2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(cred.id); }}
                        className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Create new / No credentials */}
              {!creating && credentials.length === 0 && (
                <div className="text-center py-4">
                  <Shield className="w-8 h-8 text-gray-300 dark:text-[#30363d] mx-auto mb-2" />
                  <p className="text-xs text-gray-500 dark:text-[#8b949e]">No credentials yet. Create one to get started.</p>
                </div>
              )}

              {/* Create button */}
              {!creating && (
                <button
                  onClick={() => setCreating(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-[#484f58] text-xs font-medium text-gray-500 dark:text-[#8b949e] hover:border-[#2f81f7] hover:text-[#2f81f7] hover:bg-blue-50/30 dark:hover:bg-[#2f81f7]/5 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create New Credential
                </button>
              )}

              {/* Create form */}
              {creating && (
                <div className="space-y-3 p-4 rounded-xl border border-gray-200 dark:border-[#30363d] bg-gray-50/50 dark:bg-[#0d1117]/50">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9]">New Credential</label>
                    <button onClick={() => setCreating(false)} className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-[#e6edf3]">
                      Cancel
                    </button>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 dark:text-[#8b949e] uppercase">Name</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g., My Gmail Account"
                      className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50"
                    />
                  </div>

                  {/* Type */}
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 dark:text-[#8b949e] uppercase">Type</label>
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as CredentialType)}
                      className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50"
                    >
                      {CREDENTIAL_DEFINITIONS.map((d) => (
                        <option key={d.type} value={d.type}>{d.displayName}</option>
                      ))}
                    </select>
                  </div>

                  {/* Dynamic fields */}
                  {definition?.fields.map((field) => (
                    <div key={field.name}>
                      <label className="text-[10px] font-medium text-gray-500 dark:text-[#8b949e] uppercase">
                        {field.displayName} {field.required && <span className="text-red-500">*</span>}
                      </label>
                      <div className="relative mt-1">
                        {field.type === "password" ? (
                          <>
                            <input
                              type={showPasswordFields.has(field.name) ? "text" : "password"}
                              value={newData[field.name] || ""}
                              onChange={(e) => setNewData((prev) => ({ ...prev, [field.name]: e.target.value }))}
                              placeholder={field.placeholder}
                              className="w-full px-3 py-1.5 pr-8 text-xs rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setShowPasswordFields((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(field.name)) next.delete(field.name);
                                  else next.add(field.name);
                                  return next;
                                });
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-[#e6edf3]"
                            >
                              {showPasswordFields.has(field.name) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                          </>
                        ) : field.type === "json" ? (
                          <textarea
                            value={typeof newData[field.name] === "string" ? newData[field.name] : JSON.stringify(newData[field.name] || "", null, 2)}
                            onChange={(e) => {
                              try {
                                setNewData((prev) => ({ ...prev, [field.name]: JSON.parse(e.target.value) }));
                              } catch {
                                setNewData((prev) => ({ ...prev, [field.name]: e.target.value }));
                              }
                            }}
                            placeholder={field.placeholder}
                            rows={3}
                            className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50 resize-none"
                          />
                        ) : field.type === "options" ? (
                          <select
                            value={newData[field.name] || field.default || ""}
                            onChange={(e) => setNewData((prev) => ({ ...prev, [field.name]: e.target.value }))}
                            className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50"
                          >
                            {field.options?.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.name}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type === "number" ? "number" : "text"}
                            value={newData[field.name] || ""}
                            onChange={(e) => setNewData((prev) => ({ ...prev, [field.name]: e.target.value }))}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50"
                          />
                        )}
                      </div>
                    </div>
                  ))}

                  {error && (
                    <div className="p-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-xs text-red-600 dark:text-red-400">
                      {error}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-[#30363d] flex items-center justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-[#30363d] text-gray-600 dark:text-[#c9d1d9] hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors">
            Cancel
          </button>
          {creating ? (
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || saving}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#2f81f7] hover:bg-[#2672d9] text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Create Credential
            </button>
          ) : (
            <button
              onClick={handleSelect}
              disabled={!selectedId}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#2f81f7] hover:bg-[#2672d9] text-white transition-colors disabled:opacity-50"
            >
              Select Credential
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
