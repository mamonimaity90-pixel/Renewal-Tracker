import React, { useMemo } from 'react';
import { Hospital, Interaction, Zone, User, PerformanceStats } from '../types';
import { parseISO, isBefore, isAfter, subMonths, startOfYear, endOfYear, format } from 'date-fns';
import { Trophy, Target, AlertTriangle, TrendingUp, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

interface PerformanceDashboardProps {
  hospitals: Hospital[];
  interactions: Interaction[];
  zones: Zone[];
  users: User[];
}

export function PerformanceDashboard({ hospitals, interactions, zones, users }: PerformanceDashboardProps) {
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
      const now = new Date();

      // Rule 1: Early Renewal (+3 points)
      // Hospital applies 3 months prior to its expiry
      if (h.reapplied && h.renewalApplicationDate) {
        const renewalDate = parseISO(h.renewalApplicationDate);
        const threeMonthsPrior = subMonths(expiryDate, 3);
        if (isBefore(renewalDate, threeMonthsPrior)) {
          stats.points += 3;
          stats.earlyRenewals += 1;
        }
      }

      // Rule 2: Vintage Recovery (+10 points)
      // Bring back a hospital from 2023-2025
      if (h.reapplied) {
        const year = expiryDate.getFullYear();
        if (year >= 2023 && year <= 2025) {
          stats.points += 10;
          stats.vintageRecoveries += 1;
        }
      }

      // Rule 3: Fail to bring back (-1 point)
      // We fail to bring back hospitals (Expired without reapplying)
      if (!h.reapplied && isBefore(expiryDate, now)) {
        stats.points -= 1;
        stats.expirations += 1;
      }
    });

    return Array.from(statsMap.values()).sort((a: PerformanceStats, b: PerformanceStats) => b.points - a.points);
  }, [hospitals, zones]);

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
      <header>
        <h2 className="text-3xl font-serif font-bold text-stone-900">Team Performance</h2>
        <p className="text-stone-500">Regional zone performance based on retention targets.</p>
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
      </div>
    </div>
  );
}
