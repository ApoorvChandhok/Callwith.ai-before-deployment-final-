"use client";

import React, { useState, useMemo } from "react";
import {
  UserPlus, PhoneOff, Clock, Webhook, RefreshCw, FileText, Tag, Heart,
  GitBranch, Filter, Search, Hash, Smile,
  Mail, MessageCircle, UserCheck, XCircle, PhoneOutgoing, Globe, StickyNote,
  Bell, Calendar, Timer, Play, AlertTriangle, Code2, Shuffle, Repeat,
  Smartphone, MessageSquare, Send, Building2, Cloud, Table2, FileCode2,
  ChevronDown, ChevronRight, Edit2, Copy, BarChart3, FileUp, Pencil, Circle, Octagon, Reply, Layers,
} from "lucide-react";
import { buildPaletteSections, type NodeMetadata } from "@/lib/workflow-types";

// Combine icon
const CombineIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2H2v6" /><path d="M16 2h6v6" /><path d="M8 22H2v-6" /><path d="M16 22h6v-6" />
    <path d="M2 12h4" /><path d="M18 12h4" /><path d="M12 2v4" /><path d="M12 18v4" />
  </svg>
);

const WorkflowIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/>
    <rect x="9" y="16" width="6" height="6" rx="1"/><path d="M5 8v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/>
    <path d="M12 14v2"/>
  </svg>
);

const InstagramIcon = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/>
    <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
  </svg>
);

// Icon mapping
const ICON_MAP: Record<string, React.ElementType> = {
  UserPlus, PhoneOff, Clock, Webhook, RefreshCw, FileText, Tag, Heart,
  GitBranch, Filter, Search, Hash, Smile,
  Mail, MessageCircle, UserCheck, TagIcon: Tag, XCircle, PhoneOutgoing, Globe,
  StickyNote, Bell, Sheet: FileText, Calendar, Timer, Play, AlertTriangle,
  Code2, Shuffle, Combine: CombineIcon, Repeat,
  Smartphone, MessageSquare, Send, Building2, Cloud, Table2, FileCode2,
  Workflow: WorkflowIcon, Instagram: InstagramIcon,
  Edit2, Copy, BarChart3, FileUp, Pencil, Circle, Octagon, Reply, Layers,
};

interface Props {
  onAddNode: (metadata: NodeMetadata) => void;
  isCollapsed?: boolean;
}

export default function WorkflowNodePalette({ onAddNode, isCollapsed }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const sections = useMemo(() => buildPaletteSections(searchQuery), [searchQuery]);

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (isCollapsed) return null;

  return (
    <div
      className="w-72 bg-white dark:bg-[#161b22] border-r border-gray-200 dark:border-[#30363d] flex flex-col transition-colors duration-200 flex-shrink-0"
      style={{ height: "100%", minHeight: 0, maxHeight: "100%" }}
    >
      {/* Header + Search — pinned at top */}
      <div className="flex-shrink-0 p-3 border-b border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] space-y-2.5 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-[#e6edf3] tracking-tight">
            Node Palette
          </h3>
          <span className="text-[10px] text-gray-400 dark:text-[#6e7681] font-medium">
            {sections.reduce((acc, s) => acc + s.nodes.length, 0)} nodes
          </span>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-[#6e7681] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-[#30363d]
              bg-gray-50 dark:bg-[#0d1117] text-gray-900 dark:text-[#e6edf3]
              placeholder-gray-400 dark:placeholder-[#484f58]
              focus:outline-none focus:ring-1 focus:ring-[#2f81f7]/50 focus:border-[#2f81f7]
              transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable node list — contained scroll, thin custom scrollbar */}
      <div
        className="flex-1 overflow-y-auto p-2 space-y-1"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(99,102,241,0.25) transparent",
        }}
      >

        {sections.length === 0 && (
          <div className="py-8 text-center">
            <Search className="w-6 h-6 text-gray-300 dark:text-[#30363d] mx-auto mb-2" />
            <p className="text-xs text-gray-400 dark:text-[#6e7681]">No nodes match &quot;{searchQuery}&quot;</p>
          </div>
        )}

        {sections.map((section) => {
          const isCollapsedSection = collapsedSections.has(section.id);
          return (
            <div key={section.id} className="mb-1">
              {/* Section header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-[#21262d] transition-colors group"
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: section.accent }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-[#8b949e] flex-1 text-left">
                  {section.title}
                </span>
                <span className="text-[9px] bg-gray-100 dark:bg-[#21262d] text-gray-400 dark:text-[#6e7681] px-1.5 py-0.5 rounded font-medium">
                  {section.nodes.length}
                </span>
                {isCollapsedSection ? (
                  <ChevronRight className="w-3 h-3 text-gray-400 dark:text-[#6e7681]" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-gray-400 dark:text-[#6e7681]" />
                )}
              </button>

              {/* Node list */}
              {!isCollapsedSection && (
                <div className="mt-0.5 space-y-0.5 pl-1">
                  {section.nodes.map((node) => {
                    const Icon = ICON_MAP[node.icon] || FileText;
                    return (
                      <button
                        key={node.type}
                        onClick={() => onAddNode(node)}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("application/workflow-node", JSON.stringify(node));
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-150
                          text-gray-700 dark:text-[#c9d1d9]
                          hover:bg-gray-100 dark:hover:bg-[#21262d]
                          border border-transparent hover:border-gray-200 dark:hover:border-[#30363d]
                          group cursor-pointer active:scale-[0.98]"
                      >
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150 group-hover:scale-110"
                          style={{
                            backgroundColor: `${node.color}18`,
                            border: `1px solid ${node.color}35`,
                          }}
                        >
                          <Icon className="w-3.5 h-3.5" style={{ color: node.color }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-medium truncate text-gray-800 dark:text-[#e6edf3]">
                              {node.label}
                            </span>
                            {node.badge && (
                              <span
                                className="text-[8px] font-bold px-1 py-px rounded-sm flex-shrink-0"
                                style={{
                                  backgroundColor: `${node.color}25`,
                                  color: node.color,
                                  border: `1px solid ${node.color}40`,
                                }}
                              >
                                {node.badge}
                              </span>
                            )}
                          </div>
                          <div className="text-[9px] text-gray-400 dark:text-[#6e7681] truncate leading-tight mt-0.5">
                            {node.description}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Bottom padding */}
        <div className="h-4" />
      </div>
    </div>
  );
}
