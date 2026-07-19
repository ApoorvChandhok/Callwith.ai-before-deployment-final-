import { getOverviewStats } from "@/lib/actions";
export const dynamic = "force-dynamic";
import { Phone, CheckCircle, Hash, TrendingUp } from "lucide-react";
import Link from "next/link";
import GlobeWrapper from "@/components/GlobeWrapper";
import DashboardCharts from "@/components/DashboardCharts";
import TiltCard from "@/components/TiltCard";
import FormattedCurrency, { CurrencySymbol } from "@/components/FormattedCurrency";
import DashboardHeader from "@/components/DashboardHeader";

export default async function Overview() {
  const stats = await getOverviewStats();

  const statCards = [
    {
      label: "Calls Made",
      value: stats.totalCalls,
      change: stats.changes.totalCalls,
      iconBg: "bg-amber-50 dark:bg-[#1A1510] border border-amber-500/20",
      iconColor: "text-amber-500",
      icon: Phone,
      stagger: "stagger-1",
    },
    {
      label: "Total Spend",
      value: <FormattedCurrency value={stats.totalCost} />,
      change: stats.changes.totalCost,
      iconBg: "bg-blue-50 dark:bg-[#101525] border border-blue-500/20",
      iconColor: "text-blue-500",
      icon: null,
      iconText: <CurrencySymbol />,
      stagger: "stagger-2",
    },
    {
      label: "Call Pickup Rate",
      value: `${stats.pickupRate}%`,
      change: stats.changes.pickupRate,
      iconBg: "dark:bg-[#101F1A] border border-emerald-500/20",
      iconColor: "text-emerald-500",
      icon: CheckCircle,
      iconRound: true,
      stagger: "stagger-3",
    },
    {
      label: "SIP Trunk Calls",
      value: stats.sipTrunkCalls,
      change: stats.changes.sipTrunkCalls,
      iconBg: "bg-blue-50 dark:bg-[#101525] border border-blue-500/20",
      iconColor: "text-blue-500",
      icon: Phone,
      link: "/logs",
      stagger: "stagger-4",
    },
    {
      label: "Voice API Calls",
      value: stats.voiceApiCalls,
      change: stats.changes.voiceApiCalls,
      iconBg: "bg-orange-50 dark:bg-[#1A1510] border border-orange-500/20",
      iconColor: "text-orange-500",
      icon: Phone,
      link: "/logs",
      stagger: "stagger-5",
    },
    {
      label: "Active Numbers",
      value: stats.activeNumbers,
      change: stats.changes.activeNumbers,
      iconBg: "bg-violet-50 dark:bg-[#151020] border border-violet-500/20",
      iconColor: "text-violet-500",
      icon: Hash,
      stagger: "stagger-6",
    },
  ];

  return (
    <div className="space-y-6 min-h-screen pb-10 w-full max-w-7xl mx-auto">
      {/* ROW 1: Date Picker + 6 Summary Cards */}
      <DashboardHeader logs={stats.allLogs || []} />
      <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <TiltCard
              key={card.label}
              className={`glass-card p-5 flex flex-col justify-between relative group fade-in-up min-h-[130px] ${card.stagger}`}
              style={{ animation: `fade-in-up 0.5s cubic-bezier(0.4,0,0.2,1) both` }}
            >
              <div className="flex justify-between items-start" style={{ transform: "translateZ(30px)" }}>
                <div>
                  <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                    {card.label}
                  </p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1.5 tracking-tight">
                    {card.value}
                  </h3>
                </div>
                <div
                  className={`p-2 ${card.iconBg} ${card.iconColor} ${
                    card.iconRound ? "rounded-full" : "rounded-xl"
                  } icon-glow transition-transform duration-300 shadow-sm`}
                >
                  {Icon ? (
                    <Icon className="w-4 h-4" />
                  ) : (
                    <span className="text-sm font-bold leading-none px-0.5">
                      {card.iconText}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex justify-between items-end mt-3" style={{ transform: "translateZ(30px)" }}>
                {card.change ? (
                  <p className={`text-[10px] ${card.change && card.change.startsWith('-') ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'} font-bold flex items-center`}>
                    <TrendingUp className={`w-3 h-3 mr-1 ${card.change && card.change.startsWith('-') ? 'rotate-180' : ''}`} />
                    {card.change}
                    <span className="text-gray-400 dark:text-gray-500 ml-1 font-medium">
                      vs previous period
                    </span>
                  </p>
                ) : (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold flex items-center">
                    -- No change
                    <span className="text-gray-400 dark:text-gray-500 ml-1 font-medium">
                      vs previous period
                    </span>
                  </p>
                )}
              </div>

              {card.link && (
                <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ transform: "translateZ(40px)" }}>
                  <Link
                    href={card.link}
                    className="text-[10px] text-blue-500 hover:text-blue-400 font-semibold flex items-center"
                  >
                    View call logs <span className="ml-1">↗</span>
                  </Link>
                </div>
              )}
            </TiltCard>
          );
        })}
      </div>

      {/* ROW 2 & 3: Charts */}
      <div className="glass-card p-0 overflow-hidden" style={{ animation: `fade-in-up 0.5s 0.15s cubic-bezier(0.4,0,0.2,1) both` }}>
        <DashboardCharts stats={stats} logs={stats.allLogs || []} />
      </div>

      {/* Section title */}
      <div style={{ animation: `fade-in-up 0.5s 0.25s cubic-bezier(0.4,0,0.2,1) both` }}>
        <h2 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-8 mb-3">
          Account & Infrastructure
        </h2>
      </div>

      {/* ROW 4: Globe */}
      <div className="glass-card p-6" style={{ animation: `fade-in-up 0.5s 0.3s cubic-bezier(0.4,0,0.2,1) both` }}>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">
          Global Call Distribution
        </h3>
        <div className="w-full h-[400px] flex items-center justify-center bg-gray-50 dark:bg-[#111111] rounded-2xl overflow-hidden border border-gray-100 dark:border-white/5 relative">
          <GlobeWrapper />
        </div>
      </div>
    </div>
  );
}
