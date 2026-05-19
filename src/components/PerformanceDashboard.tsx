import React, { useMemo, useState } from 'react';
import { Hospital, Interaction, Zone, User, PerformanceStats } from '../types';
import { parseISO, isBefore, isAfter, subMonths, startOfYear, endOfYear, format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { Trophy, Target, AlertTriangle, TrendingUp, Users, Calendar, ChevronDown, Filter } from 'lucide-react';
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

  const quickRanges = [
    { label: 'This Month', start: startOfMonth(new Date()), end: endOfMonth(new Date()) },
    { label: 'Last Month', start: startOfMonth(subMonths(new Date(), 1)), end: endOfMonth(subMonths(new Date(), 1)) },
    { label: 'This Year', start: startOfYear(new Date()), end: endOfYear(new Date()) },
    { label: 'All Time', start: new Date(2020, 0, 1), end: new Date(2030, 0, 1) },
  ];

  const performanceStats = useMemo(() => {
    const statsMap = new Map<string, PerformanceStats>();
    
    // Initialize stats for each zone
    zones.forEach(zone => {
      statsMap.set(zone.id, {
        zoneId: zone.id,
        points: 0,
        earlyRenewals: 0,
        vintageRecoveries: 0,
        expirations: 0
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

    return Array.from(statsMap.values()).sort((a: PerformanceStats, b: PerformanceStats) => b.points - a.points);
  }, [hospitals, zones, dateRange]);

  const teamStats = useMemo(() => {
    const statsMap = new Map<string, { userId: string; name: string; interactions: number; conversions: number; points: number }>();
    
    users.forEach(u => {
      statsMap.set(u.uid, { userId: u.uid, name: u.name, interactions: 0, conversions: 0, points: 0 });
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
        const stats = statsMap.get(h.assignedTo);
        if (stats) {
          stats.conversions += 1;
          stats.points += 5; // 5 points per renewal
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
      points: stat.points,
      early: stat.earlyRenewals,
      vintage: stat.vintageRecoveries,
      expired: stat.expirations
    }));
  }, [performanceStats, zones]);

  return (
    <div className="space-y-8 pb-20">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
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
                <span className="font-bold text-stone-900">{stat.points} pts</span>
              </div>
            ))}
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
          <h3 className="text-lg font-bold text-stone-900 mb-6">Zone Point Comparison</h3>
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
          <h3 className="text-lg font-bold text-stone-900 mb-6">Performance Details</h3>
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
                    <span className="text-sm font-bold text-stone-900">{stat.points} Total Points</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase">Early</p>
                      <p className="text-sm font-bold text-emerald-600">+{stat.earlyRenewals * 3}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase">Vintage</p>
                      <p className="text-sm font-bold text-indigo-600">+{stat.vintageRecoveries * 10}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase">Dropout</p>
                      <p className="text-sm font-bold text-rose-600">-{stat.expirations}</p>
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
