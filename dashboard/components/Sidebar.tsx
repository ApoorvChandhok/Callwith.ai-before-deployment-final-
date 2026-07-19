"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser, type UserRole } from "@/lib/context/user-context";
import {
  LayoutDashboard,
  PhoneOutgoing,
  Activity,
  Users,
  Settings,
  Database,
  Moon,
  Sun,
  DollarSign,
  Wallet,
  Bot,
  GitBranch,
  Key,
  PhoneIncoming,
  Sparkles,
  Menu,
  User,
  LogOut,
  ChevronDown,
  ShieldCheck,
  Building,
  Car,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAppContext } from "./app-provider";
import { motion, AnimatePresence } from "framer-motion";
import { flushSync } from "react-dom";
import { createClient } from "@/lib/supabase/client";

// ── Role-based route visibility ──────────────────────────────────────────────

const ROLE_RANK: Record<UserRole, number> = {
  read_only: 1, manager: 2, admin: 3, super_admin: 4,
};

function minRole(role: UserRole | undefined, min: UserRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

const ROLE_LABELS: Record<UserRole, { label: string; color: string }> = {
  super_admin: { label: "Super Admin", color: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  admin:       { label: "Admin",       color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
  manager:     { label: "Manager",     color: "bg-blue-500/20   text-blue-300   border-blue-500/30" },
  read_only:   { label: "View Only",   color: "bg-gray-500/20   text-gray-300   border-gray-500/30" },
};

// ── Inline Profile Avatar + Dropdown ─────────────────────────────────────────

function ProfileAvatar({
  isCollapsed,
}: {
  isCollapsed: boolean;
}) {
  const { profile } = useUser();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = profile?.fullName
    ? profile.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  const roleMeta = profile?.role ? ROLE_LABELS[profile.role] : null;

  return (
    <div className="relative" ref={menuRef}>
      {/* ── Trigger ── */}
      <motion.button
        whileTap={{ scale: 0.93 }}
        onClick={() => setIsOpen((o) => !o)}
        className={`flex items-center focus:outline-none ${
          isCollapsed
            ? "rounded-full"
            : "gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-white/8 transition-colors max-w-[130px]"
        }`}
        title={isCollapsed ? (profile?.fullName ?? "Profile") : undefined}
      >
        {/* Avatar circle */}
        <div className={`${isCollapsed ? "w-9 h-9" : "w-7 h-7"} rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-[10px] shrink-0 ring-2 ring-white/10 shadow-md shadow-indigo-500/30`}>
          {initials}
        </div>

        {/* Expanded: name + role pill */}
        {!isCollapsed && profile && (
          <div className="flex flex-col items-start min-w-0" style={{ maxWidth: 72 }}>
            <span className="text-[11px] font-semibold text-white truncate w-full leading-tight">
              {profile.fullName}
            </span>
            {roleMeta && (
              <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full border mt-0.5 leading-none truncate ${roleMeta.color}`}>
                {roleMeta.label}
              </span>
            )}
          </div>
        )}

        {!isCollapsed && (
          <ChevronDown
            className={`w-3 h-3 text-gray-500 shrink-0 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        )}
      </motion.button>

      {/* ── Dropdown ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className={`absolute top-full mt-2 w-56 bg-[#111111]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl shadow-black/40 z-50 overflow-hidden ${
              isCollapsed ? "left-0" : "right-0"
            }`}
          >
            {/* Profile header */}
            <div className="p-4 border-b border-white/5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {profile?.fullName ?? "User"}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate mt-0.5">
                    {profile?.email ?? ""}
                  </p>
                </div>
              </div>
              {roleMeta && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleMeta.color}`}>
                  {roleMeta.label}
                </span>
              )}
              {profile?.businessName && (
                <p className="text-[10px] text-gray-500 mt-1.5 truncate">
                  {profile.businessName}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="p-1.5">
              <button
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-gray-300 hover:bg-white/5 rounded-xl transition-colors duration-150"
              >
                <Settings className="w-4 h-4 text-gray-500" />
                Settings
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-red-400 hover:bg-red-500/10 rounded-xl transition-colors duration-150"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { currency, setCurrency, isSidebarCollapsed: isCollapsed, setIsSidebarCollapsed: setIsCollapsed } = useAppContext();
  const { profile } = useUser();
  const [mounted, setMounted] = React.useState(false);
  const [logoHover, setLogoHover] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const toggleThemeFn = (newTheme: string) => {
    if (!document.startViewTransition) {
      setTheme(newTheme);
      return;
    }
    document.startViewTransition(() => {
      flushSync(() => setTheme(newTheme));
    });
  };

  const role = profile?.role;

  const allRoutes = [
    { name: "Overview",        path: "/",            icon: LayoutDashboard, minRoleRequired: "read_only"  as UserRole },
    { name: "Outbound Dialer", path: "/dialer",       icon: PhoneOutgoing,   minRoleRequired: "manager"   as UserRole },
    { name: "Real Estate",     path: "/real-estate",  icon: Building,        minRoleRequired: "manager"   as UserRole },
    { name: "Car Dealership",  path: "/car-dealership", icon: Car,           minRoleRequired: "manager"   as UserRole },
    { name: "Call Logs",       path: "/logs",         icon: Activity,        minRoleRequired: "read_only"  as UserRole },
    { name: "Leads / CRM",     path: "/leads",        icon: Users,           minRoleRequired: "read_only"  as UserRole },
    { name: "Workflows",       path: "/workflows",    icon: GitBranch,       minRoleRequired: "manager"   as UserRole },
    { name: "Integrations",    path: "/integrations", icon: Key,             minRoleRequired: "admin"     as UserRole },
    { name: "Wallet",          path: "/wallet",        icon: Wallet,          minRoleRequired: "admin"     as UserRole },
  ];

  const allConfigRoutes = [
    { name: "Inbound Agent",  path: "/config/inbound",  icon: PhoneIncoming, minRoleRequired: "admin" as UserRole },
    { name: "Outbound Agent", path: "/config/outbound", icon: Bot,           minRoleRequired: "admin" as UserRole },
  ];

  const routes       = allRoutes.filter(r => minRole(role, r.minRoleRequired));
  const configRoutes = allConfigRoutes.filter(r => minRole(role, r.minRoleRequired));

  const currentTheme = mounted ? resolvedTheme : "light";

  const navItemVariants = {
    initial: { opacity: 0, x: -12 },
    animate: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        delay: i * 0.04,
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1] as const,
      },
    }),
  };

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1, width: isCollapsed ? 80 : 260 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="h-full bg-[#0a0a0a] border-r border-white/5 flex flex-col hidden md:flex relative overflow-hidden shrink-0 text-white z-20"
    >
      {/* Ambient glow behind logo */}
      <div className="absolute top-0 left-0 w-40 h-40 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* ── Header row: Logo (always top) ── */}
      <div className={`p-4 flex relative z-10 ${isCollapsed ? 'flex-col items-center gap-4 pt-5' : 'items-center justify-between gap-2'}`}>

        {/* Collapsed: hamburger on top */}
        {isCollapsed ? (
          <>
            <button
              suppressHydrationWarning
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
          </>
        ) : (
          <>
            {/* Logo — fixed width so it never bleeds into profile area */}
            <motion.div
              className="flex items-center gap-2.5 cursor-pointer shrink-0"
              style={{ width: 110 }}
              onHoverStart={() => setLogoHover(true)}
              onHoverEnd={() => setLogoHover(false)}
            >
              <motion.div
                whileHover={{ scale: 1.08, rotate: 2 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/25 shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </motion.div>

              <div className="relative h-6 overflow-hidden" style={{ perspective: "1000px", width: 64 }}>
                <motion.div
                  className="relative w-full h-full"
                  style={{ transformStyle: "preserve-3d" }}
                  animate={{ rotateX: logoHover ? -90 : 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  {/* Front */}
                  <div className="absolute inset-0 flex items-center" style={{ transform: "translateZ(12px)" }}>
                    <span className="text-[15px] font-bold tracking-tight gradient-text whitespace-nowrap">CallWith.ai</span>
                  </div>
                  {/* Bottom */}
                  <div className="absolute inset-0 flex items-center" style={{ transform: "rotateX(90deg) translateZ(12px)" }}>
                    <span className="text-[9px] font-bold tracking-widest text-indigo-400 uppercase whitespace-nowrap">AI-Agent</span>
                  </div>
                </motion.div>
              </div>
            </motion.div>

            {/* Right side: hamburger — pushed to the far right */}
            <div className="flex items-center gap-1 ml-auto shrink-0">
              <button
                suppressHydrationWarning
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors shrink-0"
              >
                <Menu className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 px-3 space-y-0.5 mt-2 overflow-y-auto scrollbar-hide">
        {isCollapsed ? (
          <div className="h-4" />
        ) : (
          <div className="px-3 mb-3 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-[0.15em] transition-opacity">
            Menu
          </div>
        )}
        {routes.map((route, i) => {
          const isActive =
            route.path === "/" ? pathname === "/" : pathname.startsWith(route.path);
          const Icon = route.icon;
          return (
            <motion.div
              key={route.path}
              custom={i}
              variants={navItemVariants}
              initial="initial"
              animate="animate"
            >
              <Link
                href={route.path}
                className={`group relative flex items-center ${isCollapsed ? 'justify-center' : 'gap-4 px-4'} py-3 rounded-xl transition-all duration-200 text-[13px] font-medium ${
                  isActive
                    ? "font-semibold shadow-sm"
                    : "text-gray-400 hover:bg-white/10 hover:text-white"
                }`}
                title={isCollapsed ? route.name : undefined}
              >
                {/* Active indicator pill */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute inset-0 bg-white rounded-xl shadow-md"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    />
                  )}
                </AnimatePresence>

                <Icon
                  className={`relative z-10 w-[18px] h-[18px] transition-colors duration-200 ${
                    isActive
                      ? "text-black"
                      : "text-gray-400 group-hover:text-white"
                  }`}
                />
                {!isCollapsed && (
                  <span className={`relative z-10 flex-1 flex items-center justify-between ${isActive ? 'text-black' : ''}`}>
                    {route.name}
                    {route.name === "Workflows" && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${isActive ? 'bg-black text-white' : 'bg-white/10 text-white'}`}>
                        13
                      </span>
                    )}
                  </span>
                )}

                {/* Hover highlight */}
                {!isActive && (
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-500/0 to-indigo-500/0 group-hover:from-indigo-500/[0.03] group-hover:to-transparent transition-all duration-300 pointer-events-none" />
                )}
              </Link>
            </motion.div>
          );
        })}

        {isCollapsed ? (
          <div className="h-6 mt-6 border-t border-gray-200/50 dark:border-white/5 mx-2" />
        ) : (
          <div className="px-3 mb-3 mt-6 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-[0.15em]">
            Configuration
          </div>
        )}
        {configRoutes.map((route, i) => {
          const isActive = pathname.startsWith(route.path);
          const Icon = route.icon;
          return (
            <motion.div
              key={route.path}
              custom={i + routes.length}
              variants={navItemVariants}
              initial="initial"
              animate="animate"
            >
              <Link
                href={route.path}
                className={`group relative flex items-center ${isCollapsed ? 'justify-center' : 'gap-4 px-4'} py-3 rounded-xl transition-all duration-200 text-[13px] font-medium ${
                  isActive
                    ? "font-semibold shadow-sm"
                    : "text-gray-400 hover:bg-white/10 hover:text-white"
                }`}
                title={isCollapsed ? route.name : undefined}
              >
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      layoutId="activeNavConfig"
                      className="absolute inset-0 bg-white rounded-xl shadow-md"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    />
                  )}
                </AnimatePresence>
                <Icon
                  className={`relative z-10 w-[18px] h-[18px] transition-colors duration-200 ${
                    isActive
                      ? "text-black"
                      : "text-gray-400 group-hover:text-white"
                  }`}
                />
                {!isCollapsed && <span className={`relative z-10 flex-1 ${isActive ? 'text-black' : ''}`}>{route.name}</span>}
              </Link>
            </motion.div>
          );
        })}

        {/* ── Super Admin Control Plane link ── */}
        {role === 'super_admin' && (
          <>
            {isCollapsed ? (
              <div className="h-6 mt-4 border-t border-violet-500/20 mx-2" />
            ) : (
              <div className="px-3 mb-3 mt-6 text-[10px] font-semibold text-violet-400/70 uppercase tracking-[0.15em]">
                Control Plane
              </div>
            )}
            <motion.div
              custom={routes.length + configRoutes.length + 1}
              variants={navItemVariants}
              initial="initial"
              animate="animate"
            >
              <Link
                href="/super-admin"
                className={`group relative flex items-center ${
                  isCollapsed ? 'justify-center' : 'gap-4 px-4'
                } py-3 rounded-xl transition-all duration-200 text-[13px] font-medium ${
                  pathname.startsWith('/super-admin')
                    ? 'bg-violet-500/15 text-violet-300'
                    : 'text-violet-400/60 hover:bg-violet-500/10 hover:text-violet-300'
                }`}
                title={isCollapsed ? 'Control Panel' : undefined}
              >
                <ShieldCheck className="relative z-10 w-[18px] h-[18px] shrink-0" />
                {!isCollapsed && <span className="relative z-10 flex-1">Control Panel</span>}
              </Link>
            </motion.div>
          </>
        )}
      </div>

      {/* Bottom controls (currency + theme + settings — no profile here anymore) */}
      <div className={`p-4 border-t border-gray-200/50 dark:border-white/5 space-y-1 ${isCollapsed ? 'px-2' : ''}`}>
        {/* Currency selector */}
        <div
          className={`relative flex items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-3'} py-2 text-[13px] font-medium text-gray-500 dark:text-gray-400 rounded-xl hover:bg-gray-100/80 dark:hover:bg-white/5 transition-all duration-200`}
          title={isCollapsed ? `Currency: ${currency}` : undefined}
        >
          <DollarSign className="w-[18px] h-[18px] text-gray-400 dark:text-gray-500 shrink-0" />
          {!isCollapsed && (
            <select
              suppressHydrationWarning
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
              className="bg-transparent outline-none flex-1 cursor-pointer text-gray-500 dark:text-gray-400 text-[13px]"
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          )}
          {isCollapsed && (
            <select
              suppressHydrationWarning
              value={currency}
              onChange={(e) => setCurrency(e.target.value as any)}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          )}
        </div>

        {/* Segmented Theme Toggle */}
        {!isCollapsed && (
          <div className="px-3 pt-4 pb-2">
            <div className="text-[11px] font-semibold text-gray-500 mb-3">Theme</div>
            <div className="flex bg-[#0A0A0A] rounded-xl p-1 relative border border-white/5">
              <button
                onClick={() => { if (currentTheme !== "dark") toggleThemeFn("dark"); }}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium z-10 transition-colors ${currentTheme === "dark" ? "text-black" : "text-gray-400 hover:text-white"}`}
              >
                <Moon className="w-3.5 h-3.5" /> Dark
              </button>
              <button
                onClick={() => { if (currentTheme !== "light") toggleThemeFn("light"); }}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium z-10 transition-colors ${currentTheme === "light" ? "text-black" : "text-gray-400 hover:text-white"}`}
              >
                <Sun className="w-3.5 h-3.5" /> Light
              </button>

              {/* Sliding background */}
              <motion.div
                className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm"
                initial={false}
                animate={{ x: currentTheme === "dark" ? 0 : "100%" }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              />
            </div>
          </div>
        )}

        {/* Settings */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-3'} py-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-gray-200 transition-all duration-200 w-full text-[13px] font-medium`}
          title={isCollapsed ? "Settings" : undefined}
        >
          <Settings className="w-[18px] h-[18px] shrink-0" />
          {!isCollapsed && "Settings"}
        </motion.button>
      </div>
    </motion.div>
  );
}
