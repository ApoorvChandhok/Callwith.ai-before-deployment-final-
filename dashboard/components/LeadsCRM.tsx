"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useUser } from "@/lib/context/user-context";
import {
  Search, Filter, Plus, Download, ChevronDown, ChevronUp,
  Phone, Mail, MessageCircle, MoreHorizontal, Trash2,
  Users, TrendingUp, AlertTriangle, Clock, Star,
  Check, X, Tag, ArrowUpDown, SlidersHorizontal,
} from "lucide-react";
import type { EnrichedLead, LeadStatus, LeadPriority, LeadSource } from "@/lib/actions";
import {
  updateLeadMeta, deleteLead, bulkUpdateLeads,
  bulkDeleteLeads, exportLeadsCsv,
} from "@/lib/actions";
import LeadDetailPanel from "./LeadDetailPanel";
import AddLeadModal from "./AddLeadModal";

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<LeadStatus, { bg: string; text: string; border: string; dot: string }> = {
  New:         { bg: "bg-blue-50 dark:bg-[#2f81f7]/10", text: "text-blue-600 dark:text-[#2f81f7]", border: "border-blue-200 dark:border-[#2f81f7]/20", dot: "bg-blue-500" },
  Contacted:   { bg: "bg-cyan-50 dark:bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400", border: "border-cyan-200 dark:border-cyan-500/20", dot: "bg-cyan-500" },
  Qualified:   { bg: "bg-purple-50 dark:bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-200 dark:border-purple-500/20", dot: "bg-purple-500" },
  Proposal:    { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-200 dark:border-amber-500/20", dot: "bg-amber-500" },
  Negotiation: { bg: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-200 dark:border-orange-500/20", dot: "bg-orange-500" },
  Won:         { bg: "bg-green-50 dark:bg-green-500/10", text: "text-green-600 dark:text-green-400", border: "border-green-200 dark:border-green-500/20", dot: "bg-green-500" },
  Lost:        { bg: "bg-red-50 dark:bg-red-500/10", text: "text-red-600 dark:text-red-400", border: "border-red-200 dark:border-red-500/20", dot: "bg-red-500" },
};

const PRIORITY_CONFIG: Record<LeadPriority, { color: string; label: string }> = {
  Low:    { color: "text-gray-400 dark:text-[#6e7681]", label: "Low" },
  Medium: { color: "text-yellow-500 dark:text-yellow-400", label: "Medium" },
  High:   { color: "text-orange-500 dark:text-orange-400", label: "High" },
  Urgent: { color: "text-red-500 dark:text-red-400", label: "Urgent" },
};

const ALL_STATUSES: LeadStatus[] = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
const ALL_PRIORITIES: LeadPriority[] = ["Low", "Medium", "High", "Urgent"];
const ALL_SOURCES: LeadSource[] = ["AI Agent (Inbound)", "AI Agent (Outbound)", "Website", "Referral", "Google Ads", "Social Media", "Walk-in", "Manual", "Other"];

type SortField = "timestamp" | "name" | "status" | "priority" | "lastActivity";

function relativeTime(dateStr: string): string {
  if (!dateStr) return "—";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length > 1
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "from-blue-500 to-cyan-500",
  "from-purple-500 to-pink-500",
  "from-green-500 to-emerald-500",
  "from-amber-500 to-orange-500",
  "from-red-500 to-rose-500",
  "from-indigo-500 to-violet-500",
  "from-teal-500 to-cyan-500",
];

function getAvatarColor(name: string): string {
  const sum = (name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

// ── Component ────────────────────────────────────────────────────────────────

import { useRouter } from "next/navigation";

interface Props {
  initialLeads: EnrichedLead[];
}

export default function LeadsCRM({ initialLeads }: Props) {
  const router = useRouter();
  const { can } = useUser();
  const [leads, setLeads] = useState<EnrichedLead[]>(initialLeads);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState<LeadPriority | "All">("All");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "All">("All");
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [detailLead, setDetailLead] = useState<EnrichedLead | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState<string | null>(null);
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<LeadStatus>("Contacted");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  // ── Derived Data ─────────────────────────────────────────────
  const filteredLeads = useMemo(() => {
    let result = [...leads];

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          l.email.toLowerCase().includes(q) ||
          l.city.toLowerCase().includes(q) ||
          l.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Filters
    if (statusFilter !== "All") result = result.filter((l) => l.status === statusFilter);
    if (priorityFilter !== "All") result = result.filter((l) => l.priority === priorityFilter);
    if (sourceFilter !== "All") result = result.filter((l) => l.source === sourceFilter);

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "timestamp": cmp = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(); break;
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "status": cmp = ALL_STATUSES.indexOf(a.status) - ALL_STATUSES.indexOf(b.status); break;
        case "priority": cmp = ALL_PRIORITIES.indexOf(a.priority) - ALL_PRIORITIES.indexOf(b.priority); break;
        case "lastActivity": cmp = new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime(); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [leads, searchQuery, statusFilter, priorityFilter, sourceFilter, sortField, sortDir]);

  const paginatedLeads = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredLeads.slice(start, start + PAGE_SIZE);
  }, [filteredLeads, page]);

  const totalPages = Math.ceil(filteredLeads.length / PAGE_SIZE);

  // ── Stats ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const newThisWeek = leads.filter((l) => new Date(l.timestamp) >= weekAgo).length;
    const wonCount = leads.filter((l) => l.status === "Won").length;
    const conversionRate = leads.length > 0 ? Math.round((wonCount / leads.length) * 100) : 0;
    const highPriority = leads.filter((l) => l.priority === "High" || l.priority === "Urgent").length;

    return {
      total: leads.length,
      newThisWeek,
      conversionRate,
      highPriority,
      wonCount,
    };
  }, [leads]);

  // ── Actions ──────────────────────────────────────────────────
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const toggleSelectAll = () => {
    if (selectedPhones.size === paginatedLeads.length) {
      setSelectedPhones(new Set());
    } else {
      setSelectedPhones(new Set(paginatedLeads.map((l) => l.phone)));
    }
  };

  const toggleSelect = (phone: string) => {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  };

  const handleStatusChange = async (phone: string, status: LeadStatus) => {
    await updateLeadMeta(phone, { status });
    setLeads((prev) =>
      prev.map((l) => (l.phone === phone ? { ...l, status, lastActivity: new Date().toISOString() } : l))
    );
    setShowStatusDropdown(null);
  };

  const handleBulkStatusUpdate = async () => {
    const phones = Array.from(selectedPhones);
    await bulkUpdateLeads(phones, { status: bulkStatusValue });
    setLeads((prev) =>
      prev.map((l) =>
        selectedPhones.has(l.phone)
          ? { ...l, status: bulkStatusValue, lastActivity: new Date().toISOString() }
          : l
      )
    );
    setSelectedPhones(new Set());
    setShowBulkActions(false);
  };

  const handleBulkDelete = async () => {
    const phones = Array.from(selectedPhones);
    await bulkDeleteLeads(phones);
    setLeads((prev) => prev.filter((l) => !selectedPhones.has(l.phone)));
    setSelectedPhones(new Set());
    setShowBulkActions(false);
  };

  const handleExport = async () => {
    const csv = await exportLeadsCsv();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLeadAdded = () => {
    router.refresh();
  };

  const handleLeadUpdated = (updatedLead: EnrichedLead) => {
    setLeads((prev) =>
      prev.map((l) => (l.phone === updatedLead.phone ? updatedLead : l))
    );
    setDetailLead(updatedLead);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  return (
    <div className="space-y-6">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-[#e6edf3]">
            Leads CRM
          </h2>
          <p className="text-gray-500 dark:text-[#8b949e] text-sm mt-0.5">
            Manage and track all your leads from AI agent calls and other sources.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Download Agent CSV (raw from AI agent) */}
          <a
            href="/api/leads/download"
            download
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-[#30363d] text-gray-600 dark:text-[#8b949e] bg-white dark:bg-[#21262d] hover:bg-gray-50 dark:hover:bg-[#30363d] transition-colors"
            title="Download raw leads captured by AI agent"
          >
            <Download className="w-4 h-4" />
            Agent CSV
          </a>
          {/* Export CRM data */}
          <button
            suppressHydrationWarning
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-200 dark:border-[#30363d] text-gray-600 dark:text-[#8b949e] bg-white dark:bg-[#21262d] hover:bg-gray-50 dark:hover:bg-[#30363d] transition-colors"
            title="Export CRM leads with status and notes"
          >
            <Download className="w-4 h-4" />
            CRM Export
          </button>
          {/* Role-gated: only manager+ can add leads */}
          {can.addLeads ? (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 transition-all shadow-sm shadow-indigo-500/20"
            >
              <Plus className="w-4 h-4" />
              Add Lead
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
              <span>👁</span> View Only
            </div>
          )}
        </div>
      </div>

      {/* ── Stats Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Leads", value: stats.total, icon: Users, color: "text-[#2f81f7]", bg: "bg-[#2f81f7]/10" },
          { label: "New This Week", value: stats.newThisWeek, icon: TrendingUp, color: "text-green-500", bg: "bg-green-500/10" },
          { label: "Conversion Rate", value: `${stats.conversionRate}%`, icon: Star, color: "text-amber-500", bg: "bg-amber-500/10" },
          { label: "High Priority", value: stats.highPriority, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-200/50 dark:border-white/8 bg-white/80 dark:bg-[#161b22]/60 backdrop-blur-md p-4 transition-all duration-200 hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 dark:text-[#8b949e] uppercase tracking-wider">
                {stat.label}
              </span>
              <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-[#e6edf3]">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#6e7681]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="Search by name, phone, email, city, or tag..."
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-gray-200/50 dark:border-white/8 bg-white/80 dark:bg-white/5 backdrop-blur-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
          className="px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-gray-700 dark:text-[#c9d1d9] focus:outline-none focus:ring-2 focus:ring-[#2f81f7]/40 cursor-pointer"
        >
          <option value="All">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Priority Filter */}
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value as any); setPage(1); }}
          className="px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-gray-700 dark:text-[#c9d1d9] focus:outline-none focus:ring-2 focus:ring-[#2f81f7]/40 cursor-pointer"
        >
          <option value="All">All Priorities</option>
          {ALL_PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {/* Source Filter */}
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value as any); setPage(1); }}
          className="px-3 py-2.5 text-sm rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-gray-700 dark:text-[#c9d1d9] focus:outline-none focus:ring-2 focus:ring-[#2f81f7]/40 cursor-pointer"
        >
          <option value="All">All Sources</option>
          {ALL_SOURCES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* ── Bulk Actions Bar ──────────────────────────────────── */}
      {selectedPhones.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#2f81f7]/30 bg-[#2f81f7]/5 dark:bg-[#2f81f7]/10">
          <span className="text-sm font-medium text-[#2f81f7]">
            {selectedPhones.size} selected
          </span>
          <div className="h-4 w-px bg-[#2f81f7]/20" />
          {/* Status update — manager+ only */}
          {can.editLeads && (
            <div className="flex items-center gap-2">
              <select
                value={bulkStatusValue}
                onChange={(e) => setBulkStatusValue(e.target.value as LeadStatus)}
                className="px-2 py-1 text-xs rounded-md border border-[#2f81f7]/30 bg-white dark:bg-[#161b22] text-gray-700 dark:text-[#c9d1d9] cursor-pointer"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                onClick={handleBulkStatusUpdate}
                className="px-3 py-1 text-xs font-medium rounded-md bg-[#2f81f7] text-white hover:bg-[#2672d9] transition-colors"
              >
                Update Status
              </button>
            </div>
          )}
          {/* Delete — admin+ only */}
          {can.deleteLeads && (
            <>
              <div className="h-4 w-px bg-[#2f81f7]/20" />
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1 text-xs font-medium rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3 h-3 inline mr-1" />
                Delete
              </button>
            </>
          )}
          <button
            onClick={() => setSelectedPhones(new Set())}
            className="ml-auto text-xs text-gray-500 dark:text-[#6e7681] hover:text-gray-700 dark:hover:text-[#8b949e]"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200/50 dark:border-white/8 bg-white/80 dark:bg-[#161b22]/60 backdrop-blur-md shadow-sm overflow-hidden transition-all duration-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[11px] text-gray-500 dark:text-gray-400 uppercase bg-gray-50/80 dark:bg-white/[0.02] border-b border-gray-200/50 dark:border-white/5">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={paginatedLeads.length > 0 && selectedPhones.size === paginatedLeads.length}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded border-gray-300 dark:border-[#30363d] cursor-pointer accent-[#2f81f7]"
                  />
                </th>
                <th className="px-4 py-3 font-medium tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-[#e6edf3] transition-colors" onClick={() => toggleSort("name")}>
                  <span className="flex items-center gap-1">Contact <SortIcon field="name" /></span>
                </th>
                <th className="px-4 py-3 font-medium tracking-wider">Email</th>
                <th className="px-4 py-3 font-medium tracking-wider">City</th>
                <th className="px-4 py-3 font-medium tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-[#e6edf3] transition-colors" onClick={() => toggleSort("status")}>
                  <span className="flex items-center gap-1">Status <SortIcon field="status" /></span>
                </th>
                <th className="px-4 py-3 font-medium tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-[#e6edf3] transition-colors" onClick={() => toggleSort("priority")}>
                  <span className="flex items-center gap-1">Priority <SortIcon field="priority" /></span>
                </th>
                <th className="px-4 py-3 font-medium tracking-wider">Source</th>
                <th className="px-4 py-3 font-medium tracking-wider">Business</th>
                <th className="px-4 py-3 font-medium tracking-wider">Tags</th>
                <th className="px-4 py-3 font-medium tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-[#e6edf3] transition-colors" onClick={() => toggleSort("lastActivity")}>
                  <span className="flex items-center gap-1">Last Activity <SortIcon field="lastActivity" /></span>
                </th>
                <th className="px-4 py-3 font-medium tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/80 dark:divide-white/5">
              {paginatedLeads.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-16 text-center text-gray-500 dark:text-[#8b949e]">
                    <div className="flex flex-col items-center justify-center">
                      <Users className="w-10 h-10 mb-3 text-gray-300 dark:text-[#30363d]" />
                      <p className="font-medium text-gray-600 dark:text-[#8b949e]">
                        {searchQuery || statusFilter !== "All" || priorityFilter !== "All" ? "No leads match your filters" : "No leads captured yet"}
                      </p>
                      <p className="text-xs mt-1 text-gray-400 dark:text-[#6e7681]">
                        {searchQuery || statusFilter !== "All" || priorityFilter !== "All" ? "Try adjusting your search or filters" : "The AI agent will save them here automatically."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedLeads.map((lead) => {
                  const sc = STATUS_CONFIG[lead.status] || STATUS_CONFIG.New;
                  const pc = PRIORITY_CONFIG[lead.priority] || PRIORITY_CONFIG.Medium;
                  const initials = getInitials(lead.name);
                  const avatarColor = getAvatarColor(lead.name);

                  return (
                    <tr
                      key={lead.phone}
                      className="hover:bg-gray-50 dark:hover:bg-[#21262d]/50 transition-colors cursor-pointer group"
                      onClick={() => setDetailLead(lead)}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedPhones.has(lead.phone)}
                          onChange={() => toggleSelect(lead.phone)}
                          className="w-3.5 h-3.5 rounded border-gray-300 dark:border-[#30363d] cursor-pointer accent-[#2f81f7]"
                        />
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarColor} flex items-center justify-center flex-shrink-0 text-white text-xs font-bold shadow-sm`}>
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 dark:text-[#e6edf3] truncate text-sm">
                              {lead.name || "Unknown"}
                            </div>
                            <div className="text-[11px] text-gray-400 dark:text-[#6e7681] font-mono">
                              {lead.phone}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 text-gray-500 dark:text-[#8b949e] text-xs truncate max-w-[160px]">
                        {lead.email || <span className="text-gray-300 dark:text-[#30363d]">—</span>}
                      </td>

                      {/* City */}
                      <td className="px-4 py-3 text-gray-500 dark:text-[#8b949e] text-xs">
                        {lead.city || "—"}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 relative" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setShowStatusDropdown(showStatusDropdown === lead.phone ? null : lead.phone)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border ${sc.bg} ${sc.text} ${sc.border} hover:opacity-80 transition-opacity`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {lead.status}
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </button>
                        {showStatusDropdown === lead.phone && (
                          <div className="absolute z-30 mt-1 left-4 w-36 rounded-lg border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] shadow-xl py-1">
                            {ALL_STATUSES.map((s) => {
                              const sConf = STATUS_CONFIG[s];
                              return (
                                <button
                                  key={s}
                                  onClick={() => handleStatusChange(lead.phone, s)}
                                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors ${
                                    s === lead.status ? "font-semibold" : ""
                                  }`}
                                >
                                  <span className={`w-2 h-2 rounded-full ${sConf.dot}`} />
                                  <span className="text-gray-700 dark:text-[#c9d1d9]">{s}</span>
                                  {s === lead.status && <Check className="w-3 h-3 ml-auto text-[#2f81f7]" />}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      {/* Priority */}
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${pc.color}`}>
                          {lead.priority === "Urgent" ? "🔴 " : lead.priority === "High" ? "🟠 " : lead.priority === "Medium" ? "🟡 " : "⚪ "}
                          {pc.label}
                        </span>
                      </td>

                      {/* Source */}
                      <td className="px-4 py-3">
                        <span className="text-[11px] text-gray-500 dark:text-[#8b949e] truncate block max-w-[120px]">
                          {lead.source}
                        </span>
                      </td>

                      {/* Business Type */}
                      <td className="px-4 py-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          lead.businessType === "Real Estate"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : lead.businessType === "Car Dealership"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}>
                          {lead.businessType || "—"}
                        </span>
                      </td>

                      {/* Tags */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[140px]">
                          {lead.tags.length === 0 ? (
                            <span className="text-gray-300 dark:text-[#30363d] text-[11px]">—</span>
                          ) : (
                            lead.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-gray-100 dark:bg-[#21262d] text-gray-600 dark:text-[#8b949e] border border-gray-200 dark:border-[#30363d]"
                              >
                                {tag}
                              </span>
                            ))
                          )}
                          {lead.tags.length > 2 && (
                            <span className="text-[10px] text-gray-400 dark:text-[#6e7681]">+{lead.tags.length - 2}</span>
                          )}
                        </div>
                      </td>

                      {/* Last Activity */}
                      <td className="px-4 py-3">
                        <span className="text-[11px] text-gray-400 dark:text-[#6e7681] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {relativeTime(lead.lastActivity)}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setDetailLead(lead)}
                            className="p-1.5 rounded-md text-gray-400 dark:text-[#6e7681] hover:text-[#2f81f7] hover:bg-[#2f81f7]/10 transition-colors"
                            title="View Details"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-[#21262d] bg-gray-50 dark:bg-[#0d1117]">
            <span className="text-xs text-gray-500 dark:text-[#6e7681]">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredLeads.length)} of {filteredLeads.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-xs rounded-md border border-gray-200 dark:border-[#30363d] text-gray-600 dark:text-[#8b949e] hover:bg-gray-100 dark:hover:bg-[#21262d] disabled:opacity-30 transition-colors"
              >
                Previous
              </button>
              <span className="px-2 text-xs text-gray-500 dark:text-[#6e7681]">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-xs rounded-md border border-gray-200 dark:border-[#30363d] text-gray-600 dark:text-[#8b949e] hover:bg-gray-100 dark:hover:bg-[#21262d] disabled:opacity-30 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Panel ──────────────────────────────────────── */}
      {detailLead && (
        <LeadDetailPanel
          lead={detailLead}
          onClose={() => setDetailLead(null)}
          onUpdate={handleLeadUpdated}
        />
      )}

      {/* ── Add Lead Modal ────────────────────────────────────── */}
      {showAddModal && (
        <AddLeadModal
          onClose={() => setShowAddModal(false)}
          onAdded={handleLeadAdded}
        />
      )}
    </div>
  );
}
