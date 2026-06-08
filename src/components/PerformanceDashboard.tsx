import React, { useMemo, useState } from 'react';
import { Hospital, Interaction, Zone, User, PerformanceStats } from '../types';
import { parseISO, isBefore, isAfter, subMonths, startOfYear, endOfYear, format, startOfMonth, endOfMonth, isWithinInterval, startOfDay } from 'date-fns';
import { Trophy, Target, AlertTriangle, TrendingUp, Users, Calendar, ChevronDown, Filter, Info, HelpCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

interface PerformanceDashboardProps {
  hospitals: Hospital[];
  interactions: Interaction[];
  zones: Zone[];
  users: User[];
}

export function PerformanceDashboard({ hospitals, interactions, zones, users }: PerformanceDashboardProps) {
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date; label: string }>({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date()),
    label: 'This Month'
  });
  const [balancingStrategy, setBalancingStrategy] = useState<'portfolio' | 'opportunity' | 'raw'>('portfolio');
  const [showScoringGuide, setShowScoringGuide] = useState(true);

  const quickRanges = [
    { label: 'This Month', start: startOfMonth(new Date()), end: endOfMonth(new Date()) },
    { label: 'Last Month', start: startOfMonth(subMonths(new Date(), 1)), end: endOfMonth(subMonths(new Date(), 1)) },
    { label: 'This Year', start: startOfYear(new Date()), end: endOfYear(new Date()) },
    { label: 'All Time', start: new Date(2020, 0, 1), end: new Date(2030, 0, 1) },
  ];

  interface ExtendedPerformanceStats extends PerformanceStats {
    totalZoneVolume: number;
    activeOpportunitiesCount: number;
    balancedScore: number;
  }

  const performanceStats = useMemo(() => {
    const statsMap = new Map<string, ExtendedPerformanceStats>();
    
    // Initialize stats for each zone with hospital volumes
    zones.forEach(zone => {
      // 1. Total Volume / Portfolio: Number of hospitals belonging to states of this zone
      const totalZoneVolume = hospitals.filter(h => zone.states.includes(h.state)).length;

      // 2. Active Due Volume: Number of expiring hospitals in range for this zone
      const activeOpportunitiesCount = hospitals.filter(h => {
        if (!zone.states.includes(h.state)) return false;
        if (!h.expiryDate) return false;
        try {
          const date = parseISO(h.expiryDate);
          return isWithinInterval(date, { start: dateRange.start, end: dateRange.end });
        } catch {
          return false;
        }
      }).length;

      statsMap.set(zone.id, {
        zoneId: zone.id,
        points: 0,
        earlyRenewals: 0,
        vintageRecoveries: 0,
        expirations: 0,
        totalZoneVolume,
        activeOpportunitiesCount,
        balancedScore: 0
      });
    });

    hospitals.forEach(h => {
      const hospitalZone = zones.find(z => z.states.includes(h.state));
      if (!hospitalZone) return;

      const stats = statsMap.get(hospitalZone.id)!;
      const expiryDate = parseISO(h.expiryDate);
      
      const isInRange = (dateStr?: string) => {
        if (!dateStr) return false;
        try {
          const date = parseISO(dateStr);
          return isWithinInterval(date, { start: dateRange.start, end: dateRange.end });
        } catch {
          return false;
        }
      };

      // Rule 1: Early Renewal (+3 points)
      // Check if the renewal application happened WITHIN the selected range
      if (h.reapplied && h.renewalApplicationDate && isInRange(h.renewalApplicationDate)) {
        const renewalDate = parseISO(h.renewalApplicationDate);
        const threeMonthsPrior = subMonths(expiryDate, 3);
        if (isBefore(renewalDate, threeMonthsPrior)) {
          stats.points += 3;
          stats.earlyRenewals += 1;
        }
      }

      // Rule 2: Vintage Recovery (+10 points)
      // Check if the recovery application happened WITHIN the selected range
      if (h.reapplied && h.renewalApplicationDate && isInRange(h.renewalApplicationDate)) {
        const year = expiryDate.getFullYear();
        if (year >= 2023 && year <= 2025) {
          stats.points += 10;
          stats.vintageRecoveries += 1;
        }
      }

      // Rule 3: Fail to bring back (-1 point)
      // Check if the EXPIRY happened WITHIN the selected range
      if (!h.reapplied && isInRange(h.expiryDate)) {
        const now = new Date();
        if (isBefore(expiryDate, now)) {
          stats.points -= 1;
          stats.expirations += 1;
        }
      }
    });

    // Compute balanced metric index for each zone
    return Array.from(statsMap.values()).map(stats => {
      let balancedScore = stats.points;
      if (balancingStrategy === 'portfolio') {
        // Points earned divided by total region hospitals portfolio, multiplied by 100 for a readable index metric
        balancedScore = Number(((stats.points / Math.max(1, stats.totalZoneVolume)) * 100).toFixed(1));
      } else if (balancingStrategy === 'opportunity') {
        // Points earned divided by active expiring opportunities in the period, multiplied by 10 for standard weights
        balancedScore = Number(((stats.points / Math.max(1, stats.activeOpportunitiesCount)) * 10).toFixed(1));
      }
      return {
        ...stats,
        balancedScore
      };
    }).sort((a, b) => {
      const scoreA = balancingStrategy === 'raw' ? a.points : a.balancedScore;
      const scoreB = balancingStrategy === 'raw' ? b.points : b.balancedScore;
      return scoreB - scoreA;
    });
  }, [hospitals, zones, dateRange, balancingStrategy]);

  const teamStats = useMemo(() => {
    const statsMap = new Map<string, { userId: string; name: string; interactions: number; conversions: number; points: number }>();
    
    users.forEach(u => {
      statsMap.set(u.uid, { userId: u.uid, name: u.name, interactions: 0, conversions: 0, points: 0 });
    });

    const hospitalInteractionsMap = new Map<string, Interaction[]>();
    interactions.forEach(i => {
      if (!hospitalInteractionsMap.has(i.hospitalId)) {
        hospitalInteractionsMap.set(i.hospitalId, []);
      }
      hospitalInteractionsMap.get(i.hospitalId)!.push(i);
    });

    const isInRange = (dateStr?: string) => {
      if (!dateStr) return false;
      try {
        const date = parseISO(dateStr);
        return isWithinInterval(date, { start: dateRange.start, end: dateRange.end });
      } catch {
        return false;
      }
    };

    // Count interactions in range
    interactions.forEach(i => {
      if (isInRange(i.timestamp)) {
        const stats = statsMap.get(i.userId);
        if (stats) {
          stats.interactions += 1;
          stats.points += 1; // 1 point per interaction
        }
      }
    });

    // Count renewals (effort-led) in range
    hospitals.forEach(h => {
      if (h.reapplied && h.renewalApplicationDate && isInRange(h.renewalApplicationDate) && h.assignedTo) {
        const hInteractions = hospitalInteractionsMap.get(h.id) || [];
        const hasOutreachBeforeOrSameDay = hInteractions.some(i => {
          if (i.result !== 'Connected') return false;
          try {
            const interDate = startOfDay(parseISO(i.timestamp));
            const renewalDate = startOfDay(parseISO(h.renewalApplicationDate!));
            return isBefore(interDate, renewalDate) || interDate.getTime() === renewalDate.getTime();
          } catch {
            return false;
          }
        });

        if (hasOutreachBeforeOrSameDay) {
          const stats = statsMap.get(h.assignedTo);
          if (stats) {
            stats.conversions += 1;
            stats.points += 5; // 5 points per renewal
          }
        }
      }
    });

    return Array.from(statsMap.values())
      .filter(s => s.interactions > 0 || s.conversions > 0)
      .sort((a, b) => b.points - a.points);
  }, [users, interactions, hospitals, dateRange]);

  const chartData = useMemo(() => {
    return performanceStats.map(stat => ({
      name: zones.find(z => z.id === stat.zoneId)?.name || 'Unknown',
      points: balancingStrategy === 'raw' ? stat.points : stat.balancedScore,
      early: stat.earlyRenewals,
      vintage: stat.vintageRecoveries,
      expired: stat.expirations
    }));
  }, [performanceStats, zones, balancingStrategy]);

  return (
    <div className="space-y-8 pb-20 animate-fade-in">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-stone-900">Team Performance</h2>
          <p className="text-stone-500">Regional zone performance based on retention targets.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-white p-2 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-2 px-3 py-2 text-stone-400 whitespace-nowrap">
            <Filter className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Competition Period</span>
          </div>
          <div className="flex bg-stone-50 p-1 rounded-2xl w-full sm:w-auto">
            {quickRanges.map(range => (
              <button
                key={range.label}
                onClick={() => setDateRange({ ...range })}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all whitespace-nowrap ${dateRange.label === range.label ? 'bg-white shadow-sm text-stone-900' : 'text-stone-400 hover:text-stone-600'}`}
              >
                {range.label}
              </button>
            ))}
          </div>
          <div className="hidden sm:block w-px h-6 bg-stone-100 mx-1" />
          <div className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-2xl cursor-default">
            <Calendar className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold">
              {format(dateRange.start, 'MMM d')} - {format(dateRange.end, 'MMM d, yyyy')}
            </span>
          </div>
        </div>
      </header>

      {/* Balanced Scoring Controller Board */}
      <div className="bg-stone-50 border border-stone-200 p-6 rounded-3xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-stone-900 text-white font-mono text-[9px] font-bold rounded uppercase tracking-wider">Inbuilt Normalization</span>
            <h3 className="text-sm font-bold text-stone-900">Balanced Performance Metric</h3>
          </div>
          <p className="text-xs text-stone-500 max-w-2xl leading-relaxed">
            By default, different zones have highly unequal hospital volumes. To establish a balanced, uniform scoreboard, choose to normalize points by the total regional portfolio or period opportunities.
          </p>
        </div>
        
        <div className="flex items-center gap-1.5 p-1 bg-stone-200/50 rounded-2xl w-full lg:w-auto border border-stone-200">
          <button
            onClick={() => setBalancingStrategy('portfolio')}
            className={`flex-1 lg:flex-none px-4 py-2 rounded-xl text-[10px] font-bold tracking-tight transition-all whitespace-nowrap ${
              balancingStrategy === 'portfolio' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Portfolio-Balanced (BPI)
          </button>
          <button
            onClick={() => setBalancingStrategy('opportunity')}
            className={`flex-1 lg:flex-none px-4 py-2 rounded-xl text-[10px] font-bold tracking-tight transition-all whitespace-nowrap ${
              balancingStrategy === 'opportunity' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Opportunity-Balanced (OBI)
          </button>
          <button
            onClick={() => setBalancingStrategy('raw')}
            className={`flex-1 lg:flex-none px-4 py-2 rounded-xl text-[10px] font-bold tracking-tight transition-all whitespace-nowrap ${
              balancingStrategy === 'raw' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Traditional Gross Points
          </button>
        </div>
      </div>

      {/* Scoring Matrix & Calculation Reference */}
      <div className="bg-white border border-stone-200 p-8 rounded-3xl shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-stone-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-900 text-white flex items-center justify-center">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-serif font-bold text-stone-900">Scoring Matrix & Methodology Guide</h3>
              <p className="text-xs text-stone-500">Understand exactly how performance points and normalization indexes are calculated.</p>
            </div>
          </div>
          <button 
            onClick={() => setShowScoringGuide(!showScoringGuide)} 
            className="text-xs font-bold text-stone-500 hover:text-stone-900 px-3 py-1.5 bg-stone-50 rounded-xl flex items-center gap-1.5 transition-all"
          >
            {showScoringGuide ? "Hide Guide" : "Show Guide"}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showScoringGuide ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showScoringGuide && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Rule 1: Early Renewal card */}
            <div className="p-5 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase font-black text-emerald-800 tracking-wider">Early Success</span>
                  <span className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-mono font-bold rounded-lg">+3 Points</span>
                </div>
                <h4 className="font-serif font-bold text-stone-950 text-base mb-1">Early Renewal Task</h4>
                <p className="text-stone-600 text-xs leading-relaxed">
                  Issued to the zone whenever a hospital submits their renewal application <strong className="text-emerald-800">3 or more months prior</strong> to their compliance expiry date.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-emerald-100 text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                Focuses on Proactive Retention
              </div>
            </div>

            {/* Rule 2: Vintage Recovery card */}
            <div className="p-5 rounded-2xl bg-amber-50/50 border border-amber-100 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase font-black text-amber-800 tracking-wider">Strategic Recovery</span>
                  <span className="px-2.5 py-1 bg-amber-600 text-white text-xs font-mono font-bold rounded-lg">+10 Points</span>
                </div>
                <h4 className="font-serif font-bold text-stone-950 text-base mb-1">Vintage Recovery Block</h4>
                <p className="text-stone-600 text-xs leading-relaxed">
                  Issued when a historically lost hospital from a past compliance cohort (<strong className="text-amber-800">2023 - 2025</strong>) is successfully won back and reapplies.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-amber-100 text-[10px] text-amber-700 font-bold uppercase tracking-wider">
                Rewards Hard-to-Win Retroactive Saves
              </div>
            </div>

            {/* Rule 3: Fail to Renew card */}
            <div className="p-5 rounded-2xl bg-red-50/30 border border-red-100/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] uppercase font-black text-red-800 tracking-wider">Compliance Drop</span>
                  <span className="px-2.5 py-1 bg-red-500 text-white text-xs font-mono font-bold rounded-lg">-1 Point</span>
                </div>
                <h4 className="font-serif font-bold text-stone-950 text-base mb-1">Compliance Expiration</h4>
                <p className="text-stone-600 text-xs leading-relaxed">
                  Deducted if a facility's compliance expiry date passes within the selected window, and they <strong className="text-red-800">fail to submit a reapplication</strong>.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-red-100/60 text-[10px] text-red-700 font-bold uppercase tracking-wider">
                Incentivizes Preventing Attrition
              </div>
            </div>

            {/* Index Formulas Information Footer Grid */}
            <div className="lg:col-span-3 bg-stone-50 border border-stone-200/60 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h5 className="text-xs font-bold text-stone-900 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-stone-800" /> Balanced Portfolio Index (BPI)
                </h5>
                <p className="text-stone-500 text-xs leading-relaxed mb-3">
                  Standardizes overall points across regions with highly unequal hospital portfolios.
                </p>
                <div className="bg-stone-100/80 rounded-xl p-3 font-mono text-[10px] text-stone-700 border border-stone-200 text-center">
                  Score = (Raw Points / Total Portfolio Volume) &times; 100
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold text-stone-900 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Target className="w-3.5 h-3.5 text-stone-800" /> Opportunity Balanced Index (OBI)
                </h5>
                <p className="text-stone-500 text-xs leading-relaxed mb-3">
                  Measures renewal efficiency targeting only current expirations inside this active period window.
                </p>
                <div className="bg-stone-100/80 rounded-xl p-3 font-mono text-[10px] text-stone-700 border border-stone-200 text-center">
                  Score = (Raw Points / Period Opportunities) &times; 10
                </div>
              </div>

              <div>
                <h5 className="text-xs font-bold text-stone-900 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <span className="font-bold text-stone-800">Team Points Distribution Matrix</span>
                </h5>
                <p className="text-stone-500 text-xs leading-relaxed mb-3">
                  Individual team members accumulate personal points for directly executing interactions and securings:
                </p>
                <div className="bg-stone-100/80 rounded-xl p-3 font-mono text-[10px] text-stone-700 border border-stone-200 flex flex-col gap-1 text-left">
                  <div className="flex justify-between"><span>Any Successful Logged Interaction:</span> <strong className="text-stone-900">+1 Point</strong></div>
                  <div className="flex justify-between"><span>Directly Secured Hospital Reapplication:</span> <strong className="text-stone-900">+5 Points</strong></div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Trophy className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-stone-900">Leaderboard</h4>
            </div>
            <div className="space-y-3">
              {performanceStats.slice(0, 3).map((stat, idx) => (
                <div key={stat.zoneId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${idx === 0 ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-600'}`}>
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium text-stone-700">
                      {zones.find(z => z.id === stat.zoneId)?.name}
                    </span>
                  </div>
                  <span className="font-bold text-stone-900">
                    {balancingStrategy === 'raw' ? `${stat.points} pts` : `${stat.balancedScore} idx`}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-stone-100">
            <p className="text-[10px] text-stone-400 leading-tight">
              {balancingStrategy === 'portfolio' && "BPI: Normalized against entire regional portfolio volume."}
              {balancingStrategy === 'opportunity' && "OBI: Normalized against active expirations in current period."}
              {balancingStrategy === 'raw' && "Gross: Non-normalized raw point summation."}
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Target className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-stone-900">Early Renewals</h4>
          </div>
          <p className="text-3xl font-serif font-bold text-stone-900">
            {performanceStats.reduce((sum, s) => sum + s.earlyRenewals, 0)}
          </p>
          <p className="text-xs text-stone-400 mt-1">+3 points each</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-stone-900">Vintage Recovery</h4>
          </div>
          <p className="text-3xl font-serif font-bold text-stone-900">
            {performanceStats.reduce((sum, s) => sum + s.vintageRecoveries, 0)}
          </p>
          <p className="text-xs text-stone-400 mt-1">+10 points each (2023-25)</p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-stone-900">Expired Dropout</h4>
          </div>
          <p className="text-3xl font-serif font-bold text-rose-600">
            {performanceStats.reduce((sum, s) => sum + s.expirations, 0)}
          </p>
          <p className="text-xs text-stone-400 mt-1">-1 point each</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <h3 className="text-lg font-bold text-stone-900 mb-2">Zone Scoring Distribution</h3>
          <p className="text-xs text-stone-400 mb-6">
            Showing {balancingStrategy === 'raw' ? 'gross points' : `normalized ${balancingStrategy === 'portfolio' ? 'BPI' : 'OBI'} rating`} across regions.
          </p>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a8a29e' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#a8a29e' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#fafaf9' }}
                />
                <Bar dataKey="points" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={zones.find(z => z.name === entry.name)?.color.replace('bg-', '#').replace('-500', '') || '#444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <h3 className="text-lg font-bold text-stone-900 mb-2">Normalized Regional Breakdown</h3>
          <p className="text-xs text-stone-400 mb-6">Regional volumes & normalized calculations.</p>
          <div className="space-y-4">
            {performanceStats.map(stat => {
              const zone = zones.find(z => z.id === stat.zoneId);
              return (
                <div key={stat.zoneId} className="group p-4 bg-stone-50 rounded-2xl hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-stone-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${zone?.color}`} />
                      <span className="font-bold text-stone-900">{zone?.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-stone-900 block">
                        {balancingStrategy === 'raw' ? `${stat.points} Gross Pts` : `${stat.balancedScore} Normalized Index`}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-stone-100/60 mt-1">
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase">Gross Points</p>
                      <p className="text-xs font-bold text-stone-800">{stat.points} pts</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase">Total Portfolio</p>
                      <p className="text-xs font-bold text-stone-800">{stat.totalZoneVolume} hosp.</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase">Period Due</p>
                      <p className="text-xs font-bold text-stone-800">{stat.activeOpportunitiesCount} hosp.</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase">Efficiency</p>
                      <p className="text-xs font-extrabold text-stone-950">
                        {stat.totalZoneVolume > 0 ? `${(( (stat.earlyRenewals + stat.vintageRecoveries) / Math.max(1, stat.totalZoneVolume) ) * 100).toFixed(0)}%` : '0%'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-stone-900">Individual Team Competition</h3>
            <span className="px-2 py-1 bg-amber-50 text-amber-600 text-[10px] font-bold rounded-lg uppercase">Range Stats</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamStats.map((u, idx) => (
              <div key={u.userId} className="p-5 bg-stone-50 rounded-3xl border border-stone-100 flex flex-col gap-3 relative overflow-hidden">
                {idx === 0 && <div className="absolute top-0 right-0 p-2"><Trophy className="w-4 h-4 text-amber-500" /></div>}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center text-xs font-bold text-stone-600">
                    {idx + 1}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-stone-900">{u.name}</h4>
                    <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">{u.points} Points Earned</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="bg-white p-2 rounded-xl border border-stone-100">
                    <p className="text-[8px] font-bold text-stone-400 uppercase">Calls</p>
                    <p className="text-xs font-bold text-stone-900">{u.interactions}</p>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-stone-100">
                    <p className="text-[8px] font-bold text-stone-400 uppercase">Renewals</p>
                    <p className="text-xs font-bold text-emerald-600">{u.conversions}</p>
                  </div>
                </div>
              </div>
            ))}
            {teamStats.length === 0 && (
              <div className="col-span-full py-10 text-center text-stone-400 italic text-sm">
                No individual activity recorded in this period.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
