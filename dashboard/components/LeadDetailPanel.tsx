"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/context/user-context";
import {
  X, Phone, Mail, MessageCircle, MapPin, Tag, Plus,
  Clock, User, Send, ChevronDown, Check, Trash2,
  FileText, TrendingUp, Activity, Edit3,
} from "lucide-react";
import type { EnrichedLead, LeadStatus, LeadPriority, LeadSource } from "@/lib/actions";
import { updateLeadMeta, addLeadNote, deleteLead } from "@/lib/actions";

const ALL_STATUSES: LeadStatus[] = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
const ALL_PRIORITIES: LeadPriority[] = ["Low", "Medium", "High", "Urgent"];
const ALL_SOURCES: LeadSource[] = ["AI Agent (Inbound)", "AI Agent (Outbound)", "Website", "Referral", "Google Ads", "Social Media", "Walk-in", "Manual", "Other"];

const STATUS_COLORS: Record<LeadStatus, string> = {
  New: "bg-blue-500", Contacted: "bg-cyan-500", Qualified: "bg-purple-500",
  Proposal: "bg-amber-500", Negotiation: "bg-orange-500", Won: "bg-green-500", Lost: "bg-red-500",
};

const PRIORITY_EMOJI: Record<LeadPriority, string> = {
  Low: "⚪", Medium: "🟡", High: "🟠", Urgent: "🔴",
};

const AVATAR_COLORS = [
  "from-blue-500 to-cyan-500", "from-purple-500 to-pink-500",
  "from-green-500 to-emerald-500", "from-amber-500 to-orange-500",
  "from-red-500 to-rose-500", "from-indigo-500 to-violet-500",
];

interface Props {
  lead: EnrichedLead;
  onClose: () => void;
  onUpdate: (lead: EnrichedLead) => void;
  onDelete?: (phone: string) => void;
}

export default function LeadDetailPanel({ lead, onClose, onUpdate, onDelete }: Props) {
  const router = useRouter();
  const { can } = useUser();
  const [activeTab, setActiveTab] = useState<"details" | "notes" | "activity">("details");
  const [newNote, setNewNote] = useState("");
  const [newTag, setNewTag] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editEmail, setEditEmail] = useState(lead.email);
  const [editCity, setEditCity] = useState(lead.city);
  const [editPhone, setEditPhone] = useState(lead.phone);
  const [editAssignee, setEditAssignee] = useState(lead.assignedTo);
  const [editName, setEditName] = useState(lead.name);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const nameSum = (lead.name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const avatarColor = AVATAR_COLORS[nameSum % AVATAR_COLORS.length];
  const initials = lead.name
    ? lead.name.split(/\s+/).length > 1
      ? (lead.name.split(/\s+/)[0][0] + lead.name.split(/\s+/).slice(-1)[0][0]).toUpperCase()
      : lead.name.substring(0, 2).toUpperCase()
    : "?";

  const handleStatusChange = async (status: LeadStatus) => {
    await updateLeadMeta(lead.phone, { status });
    onUpdate({ ...lead, status, lastActivity: new Date().toISOString() });
  };

  const handlePriorityChange = async (priority: LeadPriority) => {
    await updateLeadMeta(lead.phone, { priority });
    onUpdate({ ...lead, priority, lastActivity: new Date().toISOString() });
  };

  const handleSourceChange = async (source: LeadSource) => {
    await updateLeadMeta(lead.phone, { source });
    onUpdate({ ...lead, source, lastActivity: new Date().toISOString() });
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    await updateLeadMeta(lead.phone, {
      email: editEmail,
      city: editCity,
      assignedTo: editAssignee,
    });
    onUpdate({
      ...lead,
      name: editName,
      email: editEmail,
      city: editCity,
      assignedTo: editAssignee,
      lastActivity: new Date().toISOString()
    });
    setIsEditing(false);
    setSaving(false);
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await addLeadNote(lead.phone, newNote.trim());
    const newNoteObj = { text: newNote.trim(), timestamp: new Date().toISOString() };
    onUpdate({ ...lead, notes: [...lead.notes, newNoteObj], lastActivity: new Date().toISOString() });
    setNewNote("");
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    const updatedTags = [...new Set([...lead.tags, newTag.trim()])];
    await updateLeadMeta(lead.phone, { tags: updatedTags });
    onUpdate({ ...lead, tags: updatedTags, lastActivity: new Date().toISOString() });
    setNewTag("");
  };

  const handleRemoveTag = async (tag: string) => {
    const updatedTags = lead.tags.filter((t) => t !== tag);
    await updateLeadMeta(lead.phone, { tags: updatedTags });
    onUpdate({ ...lead, tags: updatedTags, lastActivity: new Date().toISOString() });
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${lead.name || lead.phone} from the CRM? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteLead(lead.phone);
      onDelete?.(lead.phone);
      onClose();
      router.refresh();
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-white/95 dark:bg-[#161b22]/95 backdrop-blur-2xl border-l border-gray-200/50 dark:border-white/8 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-gray-200/50 dark:border-white/5 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${avatarColor} flex items-center justify-center text-white text-lg font-bold shadow-lg`}>
                {initials}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-[#e6edf3]">
                  {lead.name || "Unknown"}
                </h2>
                <p className="text-sm text-gray-500 dark:text-[#8b949e] font-mono">{lead.phone}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                    STATUS_COLORS[lead.status] ? `bg-${lead.status === 'New' ? 'blue' : lead.status === 'Won' ? 'green' : lead.status === 'Lost' ? 'red' : 'gray'}-50 dark:bg-${lead.status === 'New' ? 'blue' : lead.status === 'Won' ? 'green' : lead.status === 'Lost' ? 'red' : 'gray'}-500/10` : ''
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[lead.status]}`} />
                    {lead.status}
                  </span>
                  <span className="text-[11px] text-gray-400 dark:text-[#6e7681]">
                    {PRIORITY_EMOJI[lead.priority]} {lead.priority}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 dark:text-[#6e7681] hover:text-gray-600 dark:hover:text-[#e6edf3] hover:bg-gray-100 dark:hover:bg-[#21262d] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 mt-4">
            <a
              href={`tel:${lead.phone}`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-500/20 hover:bg-green-100 dark:hover:bg-green-500/20 transition-colors"
            >
              <Phone className="w-3.5 h-3.5" /> Call
            </a>
            <a
              href={`mailto:${lead.email}`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" /> Email
            </a>
            <a
              href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200/50 dark:border-white/5 px-5 flex-shrink-0">
          {(["details", "notes", "activity"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition-all duration-200 capitalize ${
                activeTab === tab
                  ? "border-indigo-500 text-indigo-500 dark:text-indigo-400"
                  : "border-transparent text-gray-500 dark:text-[#8b949e] hover:text-gray-700 dark:hover:text-[#c9d1d9]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === "details" && (
            <>
              {/* Contact Info */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-[#8b949e] uppercase tracking-wider">Contact Information</h4>
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-xs text-[#2f81f7] hover:underline flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" /> {isEditing ? "Cancel" : "Edit"}
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50/80 dark:bg-white/[0.03] border border-gray-100/80 dark:border-white/5">
                    <Phone className="w-4 h-4 text-gray-400 dark:text-[#6e7681]" />
                    <span className="text-sm text-gray-700 dark:text-[#c9d1d9] font-mono">{lead.phone}</span>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50/80 dark:bg-white/[0.03] border border-gray-100/80 dark:border-white/5">
                    <Mail className="w-4 h-4 text-gray-400 dark:text-[#6e7681]" />
                    {isEditing ? (
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="flex-1 text-sm bg-transparent text-gray-700 dark:text-[#c9d1d9] outline-none placeholder-gray-300 dark:placeholder-[#484f58]"
                      />
                    ) : (
                      <span className="text-sm text-gray-700 dark:text-[#c9d1d9]">{lead.email || <span className="text-gray-300 dark:text-[#484f58] italic">Not set</span>}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50/80 dark:bg-white/[0.03] border border-gray-100/80 dark:border-white/5">
                    <MapPin className="w-4 h-4 text-gray-400 dark:text-[#6e7681]" />
                    {isEditing ? (
                      <input
                        type="text"
                        value={editCity}
                        onChange={(e) => setEditCity(e.target.value)}
                        placeholder="City / Location"
                        className="flex-1 text-sm bg-transparent text-gray-700 dark:text-[#c9d1d9] outline-none placeholder-gray-300 dark:placeholder-[#484f58]"
                      />
                    ) : (
                      <span className="text-sm text-gray-700 dark:text-[#c9d1d9]">{lead.city || <span className="text-gray-300 dark:text-[#484f58] italic">Not set</span>}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50/80 dark:bg-white/[0.03] border border-gray-100/80 dark:border-white/5">
                    <User className="w-4 h-4 text-gray-400 dark:text-[#6e7681]" />
                    {isEditing ? (
                      <input
                        type="text"
                        value={editAssignee}
                        onChange={(e) => setEditAssignee(e.target.value)}
                        placeholder="Assigned to..."
                        className="flex-1 text-sm bg-transparent text-gray-700 dark:text-[#c9d1d9] outline-none placeholder-gray-300 dark:placeholder-[#484f58]"
                      />
                    ) : (
                      <span className="text-sm text-gray-700 dark:text-[#c9d1d9]">{lead.assignedTo || <span className="text-gray-300 dark:text-[#484f58] italic">Unassigned</span>}</span>
                    )}
                  </div>

                  {isEditing && (
                    <button
                      onClick={handleSaveEdit}
                      disabled={saving}
                      className="w-full mt-2 px-4 py-2 text-sm font-medium rounded-lg bg-[#2f81f7] text-white hover:bg-[#2672d9] transition-colors disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  )}
                </div>
              </div>

              {/* Status & Priority */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-gray-500 dark:text-[#8b949e] uppercase tracking-wider">Status & Priority</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-400 dark:text-[#6e7681] mb-1 block">Status</label>
                    <select
                      value={lead.status}
                      onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-700 dark:text-[#c9d1d9] cursor-pointer"
                    >
                      {ALL_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 dark:text-[#6e7681] mb-1 block">Priority</label>
                    <select
                      value={lead.priority}
                      onChange={(e) => handlePriorityChange(e.target.value as LeadPriority)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-700 dark:text-[#c9d1d9] cursor-pointer"
                    >
                      {ALL_PRIORITIES.map((p) => (
                        <option key={p} value={p}>{PRIORITY_EMOJI[p]} {p}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 dark:text-[#6e7681] mb-1 block">Source</label>
                  <select
                    value={lead.source}
                    onChange={(e) => handleSourceChange(e.target.value as LeadSource)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117] text-gray-700 dark:text-[#c9d1d9] cursor-pointer"
                  >
                    {ALL_SOURCES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-gray-500 dark:text-[#8b949e] uppercase tracking-wider">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {lead.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 dark:bg-[#21262d] text-gray-600 dark:text-[#8b949e] border border-gray-200 dark:border-[#30363d]"
                    >
                      <Tag className="w-3 h-3" />
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-0.5 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                      placeholder="Add tag..."
                      className="px-2 py-1 text-xs rounded-md border border-dashed border-gray-300 dark:border-[#30363d] bg-transparent text-gray-600 dark:text-[#8b949e] outline-none placeholder-gray-300 dark:placeholder-[#484f58] w-24"
                    />
                    {newTag && (
                      <button onClick={handleAddTag} className="p-1 text-[#2f81f7] hover:bg-[#2f81f7]/10 rounded">
                        <Plus className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Insights */}
              {(lead.sentiment || lead.callerIntent) && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-500 dark:text-[#8b949e] uppercase tracking-wider">AI Insights</h4>
                  <div className="space-y-2">
                    {lead.sentiment && (
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-[#0d1117] border border-gray-100 dark:border-[#21262d]">
                        <TrendingUp className="w-4 h-4 text-gray-400 dark:text-[#6e7681]" />
                        <div>
                          <div className="text-[10px] text-gray-400 dark:text-[#6e7681]">Sentiment</div>
                          <span className={`text-sm font-medium ${
                            lead.sentiment === "Positive" ? "text-green-600 dark:text-green-400" :
                            lead.sentiment === "Negative" ? "text-red-600 dark:text-red-400" :
                            "text-gray-600 dark:text-[#8b949e]"
                          }`}>{lead.sentiment}</span>
                        </div>
                      </div>
                    )}
                    {lead.callerIntent && (
                      <div className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-[#0d1117] border border-gray-100 dark:border-[#21262d]">
                        <Activity className="w-4 h-4 text-gray-400 dark:text-[#6e7681] mt-0.5" />
                        <div>
                          <div className="text-[10px] text-gray-400 dark:text-[#6e7681]">Caller Intent</div>
                          <span className="text-sm text-gray-700 dark:text-[#c9d1d9]">{lead.callerIntent}</span>
                        </div>
                      </div>
                    )}
                    {lead.callCount > 0 && (
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-[#0d1117] border border-gray-100 dark:border-[#21262d]">
                        <Phone className="w-4 h-4 text-gray-400 dark:text-[#6e7681]" />
                        <div>
                          <div className="text-[10px] text-gray-400 dark:text-[#6e7681]">Call Count</div>
                          <span className="text-sm font-medium text-gray-700 dark:text-[#c9d1d9]">{lead.callCount} call{lead.callCount !== 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-[#21262d]">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400 dark:text-[#6e7681]">Captured</span>
                  <span className="text-gray-600 dark:text-[#8b949e]">{new Date(lead.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-400 dark:text-[#6e7681]">Last Activity</span>
                  <span className="text-gray-600 dark:text-[#8b949e]">{new Date(lead.lastActivity).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            </>
          )}

          {activeTab === "notes" && (
            <div className="space-y-4">
              {/* Add note */}
              <div className="space-y-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note about this lead..."
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3] placeholder-gray-400 dark:placeholder-[#484f58] focus:outline-none focus:ring-2 focus:ring-[#2f81f7]/40 focus:border-[#2f81f7] resize-none transition-all"
                />
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#2f81f7] text-white hover:bg-[#2672d9] transition-colors disabled:opacity-30"
                >
                  <Send className="w-3 h-3" /> Add Note
                </button>
              </div>

              {/* Notes timeline */}
              <div className="space-y-3">
                {lead.notes.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-[#30363d]" />
                    <p className="text-xs text-gray-400 dark:text-[#6e7681]">No notes yet</p>
                  </div>
                ) : (
                  [...lead.notes].reverse().map((note, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-[#0d1117] border border-gray-100 dark:border-[#21262d]"
                    >
                      <p className="text-sm text-gray-700 dark:text-[#c9d1d9] whitespace-pre-wrap">
                        {note.text}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-[#6e7681] mt-2 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(note.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === "activity" && (
            <div className="space-y-3">
              {/* Activity timeline — auto-generated from data */}
              <div className="space-y-0">
                {/* Lead created */}
                <div className="flex gap-3 pb-4">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <Plus className="w-3 h-3 text-blue-500" />
                    </div>
                    <div className="w-px flex-1 bg-gray-200 dark:bg-[#21262d]" />
                  </div>
                  <div className="pb-2">
                    <p className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9]">Lead captured by {lead.source}</p>
                    <p className="text-[10px] text-gray-400 dark:text-[#6e7681]">
                      {new Date(lead.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>

                {/* Notes as activity */}
                {lead.notes.map((note, idx) => (
                  <div key={idx} className="flex gap-3 pb-4">
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <FileText className="w-3 h-3 text-amber-500" />
                      </div>
                      <div className="w-px flex-1 bg-gray-200 dark:bg-[#21262d]" />
                    </div>
                    <div className="pb-2">
                      <p className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9]">Note added</p>
                      <p className="text-[11px] text-gray-500 dark:text-[#8b949e] mt-0.5">{note.text.substring(0, 80)}{note.text.length > 80 ? "..." : ""}</p>
                      <p className="text-[10px] text-gray-400 dark:text-[#6e7681] mt-1">
                        {new Date(note.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Status change placeholder */}
                {lead.status !== "New" && (
                  <div className="flex gap-3 pb-4">
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
                        <Check className="w-3 h-3 text-green-500" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-700 dark:text-[#c9d1d9]">Status changed to {lead.status}</p>
                      <p className="text-[10px] text-gray-400 dark:text-[#6e7681]">
                        {new Date(lead.lastActivity).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {/* Footer — Delete */}
        {can.deleteLeads && (
          <div className="flex-shrink-0 px-5 py-4 border-t border-gray-200/50 dark:border-white/5">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-red-500 border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {deleting ? "Deleting..." : "Delete Lead"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
