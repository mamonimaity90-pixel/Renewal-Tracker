import React, { useMemo, useState, memo } from 'react';
import { Hospital, Interaction, Application, User } from '../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList
} from 'recharts';
import { FileText, AlertCircle, CheckCircle2, Clock, TrendingUp, Filter, Search, X, ArrowUpDown, ChevronDown } from 'lucide-react';
import { format, isAfter, isBefore, parseISO, differenceInDays, differenceInMonths } from 'date-fns';
import { cn } from '../lib/utils';
import { generateHospitalReport } from '../lib/reportGenerator';

interface DashboardProps {
  hospitals: Hospital[];
  interactions: Interaction[];
  applications: Application[];
  users: User[];
}

export const Dashboard = memo(function Dashboard({ hospitals, interactions, applications, users }: DashboardProps) {
  const now = new Date();
  
  // Filter States
  const [filterUser, setFilterUser] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [trendGranularity, setTrendGranularity] = useState<'month' | 'year'>('month');
  const [trendView, setTrendView] = useState<'count' | 'percent'>('count');
  const [expandedStates, setExpandedStates] = useState<Set<string>>(new Set());
  const [stateSort, setStateSort] = useState<{ field: 'name' | 'total' | 'rate', order: 'asc' | 'desc' }>({ field: 'total', order: 'desc' });

  const states = useMemo(() => Array.from(new Set(hospitals.map(h => h.state))).sort(), [hospitals]);

  const filteredHospitals = useMemo(() => {
    return hospitals.filter(h => {
      const matchesUser = !filterUser || h.assignedTo === filterUser;
      const matchesState = !filterState || h.state === filterState;
      let matchesDate = true;
      if (filterDateStart || filterDateEnd) {
        const expiry = parseISO(h.expiryDate);
        if (filterDateStart && isBefore(expiry, parseISO(filterDateStart))) matchesDate = false;
        if (filterDateEnd && isAfter(expiry, parseISO(filterDateEnd))) matchesDate = false;
      }
      return matchesUser && matchesState && matchesDate;
    });
  }, [hospitals, filterUser, filterState, filterDateStart, filterDateEnd]);

  const timingAnalysis = useMemo(() => {
    const total = filteredHospitals.length;
    const buckets = {
      pre6m: { label: '> 6 Months Pre-Expiry', count: 0 },
      preWithin6m: { label: 'Within 6 Months Pre-Expiry', count: 0 },
      post3m: { label: 'Within 3 Months Post-Expiry', count: 0 },
      post3to6m: { label: '3-6 Months Post-Expiry', count: 0 },
      post6to12m: { label: '6-12 Months Post-Expiry', count: 0 },
      post12to24m: { label: '12-24 Months Post-Expiry', count: 0 },
      notRenewed: { label: 'Not Renewed Till Date', count: 0 },
    };

    filteredHospitals.forEach(h => {
      if (!h.reapplied) {
        buckets.notRenewed.count++;
        return;
      }

      if (!h.renewalApplicationDate) return;

      const expiry = parseISO(h.expiryDate);
      const renewal = parseISO(h.renewalApplicationDate);
      const diffMonths = differenceInMonths(renewal, expiry);

      if (isBefore(renewal, expiry)) {
        // renewal is before expiry, diffMonths will be negative
        if (diffMonths <= -6) buckets.pre6m.count++;
        else buckets.preWithin6m.count++;
      } else {
        // renewal is after or on expiry, diffMonths will be positive
        if (diffMonths <= 3) buckets.post3m.count++;
        else if (diffMonths <= 6) buckets.post3to6m.count++;
        else if (diffMonths <= 12) buckets.post6to12m.count++;
        else if (diffMonths <= 24) buckets.post12to24m.count++;
      }
    });

    return Object.values(buckets).map(b => ({
      ...b,
      percentage: total > 0 ? Math.round((b.count / total) * 100) : 0
    }));
  }, [filteredHospitals]);

  const filteredInteractions = useMemo(() => {
    const hospitalIds = new Set(filteredHospitals.map(h => h.id));
    return interactions.filter(i => hospitalIds.has(i.hospitalId));
  }, [interactions, filteredHospitals]);

  const stats = useMemo(() => {
    const total = filteredHospitals.length;
    const expiredHospitals = filteredHospitals.filter(h => isAfter(now, parseISO(h.expiryDate)));
    const expiredCount = expiredHospitals.length;
    
    const dueSoon = filteredHospitals.filter(h => {
      const days = differenceInDays(parseISO(h.expiryDate), now);
      return days > 0 && days <= 30;
    }).length;

    // Retention Rate = Renewed / Expired
    const renewedCount = filteredHospitals.filter(h => h.reapplied).length;
    const pendingRenewals = filteredHospitals.filter(h => !h.reapplied).length;
    const expiredRenewedCount = expiredHospitals.filter(h => h.reapplied).length;
    const retentionRate = expiredCount > 0 
      ? Math.round((expiredRenewedCount / expiredCount) * 100) 
      : 100; // 100% if no hospitals have reached expiry yet

    return { total, expired: expiredCount, renewed: renewedCount, pendingRenewals, retentionRate };
  }, [filteredHospitals, now]);

  const trendData = useMemo(() => {
    const timeLabels = [];
    if (trendGranularity === 'month') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        timeLabels.push(format(d, 'MMM yyyy'));
      }
    } else {
      const currentYear = new Date().getFullYear();
      for (let year = 2023; year <= currentYear; year++) {
        timeLabels.push(year.toString());
      }
    }

    return timeLabels.map(label => {
      const monthHospitals = filteredHospitals.filter(h => {
        const expiry = parseISO(h.expiryDate);
        return trendGranularity === 'month' 
          ? format(expiry, 'MMM yyyy') === label
          : expiry.getFullYear().toString() === label;
      });

      const counts = {
        pre6m: 0,
        pre0to6m: 0,
        post0to6m: 0,
        post6to12m: 0,
        post1to2y: 0,
        pending: 0,
      };

      monthHospitals.forEach(h => {
        if (!h.reapplied) {
          counts.pending++;
          return;
        }

        // If reapplied but no date, we count it as renewed but can't determine timing
        // We'll put it in Pre-0-6M as a default "on-time" bucket to avoid skewing Pending
        if (!h.renewalApplicationDate) {
          counts.pre0to6m++;
          return;
        }

        const expiry = parseISO(h.expiryDate);
        const renewal = parseISO(h.renewalApplicationDate);
        const diffMonths = differenceInMonths(renewal, expiry);

        if (isBefore(renewal, expiry)) {
          if (diffMonths <= -6) counts.pre6m++;
          else counts.pre0to6m++;
        } else {
          if (diffMonths <= 6) counts.post0to6m++;
          else if (diffMonths <= 12) counts.post6to12m++;
          else counts.post1to2y++;
        }
      });

      const total = monthHospitals.length;
      const renewedCount = monthHospitals.filter(h => h.reapplied).length;
      
      const dataPoint: any = {
        label,
        'Pre-6M': counts.pre6m,
        'Pre-0-6M': counts.pre0to6m,
        'Post-0-6M': counts.post0to6m,
        'Post-6-12M': counts.post6to12m,
        'Post-1-2Y': counts.post1to2y,
        'Pending': counts.pending,
        total: total,
        renewedPercent: total > 0 ? Math.round((renewedCount / total) * 100) : 0,
        pendingPercent: total > 0 ? Math.round((counts.pending / total) * 100) : 0
      };

      if (trendView === 'percent' && total > 0) {
        dataPoint['Pre-6M'] = Number(((counts.pre6m / total) * 100).toFixed(1));
        dataPoint['Pre-0-6M'] = Number(((counts.pre0to6m / total) * 100).toFixed(1));
        dataPoint['Post-0-6M'] = Number(((counts.post0to6m / total) * 100).toFixed(1));
        dataPoint['Post-6-12M'] = Number(((counts.post6to12m / total) * 100).toFixed(1));
        dataPoint['Post-1-2Y'] = Number(((counts.post1to2y / total) * 100).toFixed(1));
        dataPoint['Pending'] = Number(((counts.pending / total) * 100).toFixed(1));
      }

      return dataPoint;
    });
  }, [filteredHospitals, trendGranularity, trendView]);

  const renewalData = useMemo(() => [
    { name: 'Renewed', value: filteredHospitals.filter(h => h.reapplied).length },
    { name: 'Not Renewed', value: filteredHospitals.filter(h => !h.reapplied).length },
  ], [filteredHospitals]);

  const programMigrationData = useMemo(() => {
    const counts: Record<string, number> = {
      'HCO': 0,
      'SHCO': 0,
      'ECO': 0,
      'ELCP': 0
    };
    filteredHospitals.forEach(h => {
      if (h.reapplied && h.reappliedProgram) {
        counts[h.reappliedProgram] = (counts[h.reappliedProgram] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0);
  }, [filteredHospitals]);

  const bedRetentionData = useMemo(() => {
    const categories = [
      { label: 'Upto 50 Beds', min: 0, max: 50 },
      { label: '51-100 Beds', min: 51, max: 100 },
      { label: '101-300 Beds', min: 101, max: 300 },
      { label: '301 and Above', min: 301, max: 99999 },
    ];

    return categories.map(cat => {
      const cohort = filteredHospitals.filter(h => h.beds >= cat.min && h.beds <= cat.max);
      const total = cohort.length;
      const renewed = cohort.filter(h => h.reapplied).length;
      const rate = total > 0 ? Math.round((renewed / total) * 100) : 0;

      return {
        category: cat.label,
        total,
        renewed,
        pending: total - renewed,
        rate
      };
    });
  }, [filteredHospitals]);

  const notRenewedBreakdown = useMemo(() => {
    const notRenewedHospitals = filteredHospitals.filter(h => !h.reapplied);
    const hospitalIds = new Set(notRenewedHospitals.map(h => h.id));
    const relevantInteractions = interactions.filter(i => hospitalIds.has(i.hospitalId));
    
    // Get latest interaction for each not renewed hospital
    const latestInteractions = notRenewedHospitals.map(h => {
      return relevantInteractions
        .filter(i => i.hospitalId === h.id)
        .sort((a, b) => parseISO(b.timestamp).getTime() - parseISO(a.timestamp).getTime())[0];
    });

    const connected = latestInteractions.filter(i => i?.result === 'Connected').length;
    const notConnected = latestInteractions.filter(i => i?.result === 'Not Connected').length;
    const noInteraction = notRenewedHospitals.length - connected - notConnected;

    return [
      { name: 'Connected', value: connected },
      { name: 'Not Connected', value: notConnected },
      { name: 'No Interaction', value: noInteraction },
    ];
  }, [filteredHospitals, interactions]);

  const reasonData = useMemo(() => {
    const counts: Record<string, number> = {};
    const notAppliedHospitalIds = new Set(filteredHospitals.filter(h => !h.reapplied).map(h => h.id));
    
    filteredInteractions.forEach(i => {
      if (i.result === 'Connected' && i.reason && notAppliedHospitalIds.has(i.hospitalId)) {
        counts[i.reason] = (counts[i.reason] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredInteractions, filteredHospitals]);

  const COLORS = ['#1c1917', '#44403c', '#78716c', '#a8a29e', '#d6d3d1'];
  const RENEWAL_COLORS = ['#10b981', '#f43f5e'];
  const BREAKDOWN_COLORS = ['#3b82f6', '#f97316', '#d6d3d1'];
  const BED_COLORS = ['#0ea5e9', '#8b5cf6', '#ec4899', '#f97316'];

  const renderStackLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    if (height < 15 || !value) return null;
    return (
      <text 
        x={x + width / 2} 
        y={y + height / 2} 
        fill="#fff" 
        textAnchor="middle" 
        dominantBaseline="middle" 
        fontSize={8} 
        fontWeight="bold"
      >
        {value}
      </text>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <header>
          <h2 className="text-3xl font-serif font-bold text-stone-900">Dashboard</h2>
          <p className="text-stone-500">Manager's eagle eye view of compliance and retention.</p>
        </header>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              const doc = generateHospitalReport(filteredHospitals, filteredInteractions, {
                start: filterDateStart,
                end: filterDateEnd
              });
              doc.save(`Hospital_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-colors shadow-sm"
          >
            <FileText className="w-4 h-4" /> Download Dashboard Summary
          </button>
          {(filterUser || filterState || filterDateStart || filterDateEnd) && (
            <button 
              onClick={() => {
                setFilterUser('');
                setFilterState('');
                setFilterDateStart('');
                setFilterDateEnd('');
              }}
              className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 px-3 py-2 bg-red-50 rounded-xl transition-colors"
            >
              <X className="w-3 h-3" /> Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Filters / Slicers */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-6">
        <div>
          <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Team Member</label>
          <select
            className="w-full p-2.5 bg-stone-50 border-none rounded-xl text-xs focus:ring-2 focus:ring-stone-200"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
          >
            <option value="">All Members</option>
            {users.map(u => (
              <option key={u.uid} value={u.uid}>{u.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">State</label>
          <select
            className="w-full p-2.5 bg-stone-50 border-none rounded-xl text-xs focus:ring-2 focus:ring-stone-200"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
          >
            <option value="">All States</option>
            {states.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Expiry From</label>
          <input
            type="date"
            className="w-full p-2.5 bg-stone-50 border-none rounded-xl text-xs focus:ring-2 focus:ring-stone-200"
            value={filterDateStart}
            onChange={(e) => setFilterDateStart(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Expiry To</label>
          <input
            type="date"
            className="w-full p-2.5 bg-stone-50 border-none rounded-xl text-xs focus:ring-2 focus:ring-stone-200"
            value={filterDateEnd}
            onChange={(e) => setFilterDateEnd(e.target.value)}
          />
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Hospitals', value: stats.total, icon: TrendingUp, color: 'text-stone-600' },
          { label: 'Renewed', value: stats.renewed, icon: CheckCircle2, color: 'text-emerald-500' },
          { label: 'Pending Renewals', value: stats.pendingRenewals, icon: Clock, color: 'text-amber-500' },
          { label: 'Retention Rate', value: `${stats.retentionRate}%`, icon: CheckCircle2, color: 'text-blue-500' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-2 rounded-xl bg-stone-50", stat.color)}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
            <p className="text-stone-500 text-sm font-medium">{stat.label}</p>
            <p className="text-3xl font-serif font-bold text-stone-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Renewal Status */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <h3 className="text-lg font-serif font-bold text-stone-900 mb-6">Renewal Status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={renewalData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                >
                  {renewalData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={RENEWAL_COLORS[index % RENEWAL_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => [value, 'Count']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Program Migration */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <h3 className="text-lg font-serif font-bold text-stone-900 mb-6">Program Migration</h3>
          <div className="h-64">
            {programMigrationData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={programMigrationData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                  >
                    {programMigrationData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [value, 'Count']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-stone-400 italic text-sm">
                No migration data yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Month-on-Month Trend */}
      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-lg font-serif font-bold text-stone-900">Renewal Performance Trend</h3>
            <p className="text-xs text-stone-500">Analysis of reapplication timing relative to expiry</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-stone-100 p-1 rounded-xl">
              <button 
                onClick={() => setTrendGranularity('month')}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all",
                  trendGranularity === 'month' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}
              >
                Monthly
              </button>
              <button 
                onClick={() => setTrendGranularity('year')}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all",
                  trendGranularity === 'year' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}
              >
                Yearly
              </button>
            </div>

            <div className="flex bg-stone-100 p-1 rounded-xl">
              <button 
                onClick={() => setTrendView('count')}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all",
                  trendView === 'count' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}
              >
                Count
              </button>
              <button 
                onClick={() => setTrendView('percent')}
                className={cn(
                  "px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all",
                  trendView === 'percent' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}
              >
                Percentage
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {[
            { label: 'Pre-6M', color: 'bg-emerald-600', desc: '> 6m before' },
            { label: 'Pre-0-6M', color: 'bg-emerald-400', desc: '0-6m before' },
            { label: 'Post-0-6M', color: 'bg-amber-400', desc: '0-6m after' },
            { label: 'Post-6-12M', color: 'bg-orange-500', desc: '6-12m after' },
            { label: 'Post-1-2Y', color: 'bg-red-500', desc: '1-2y after' },
            { label: 'Pending', color: 'bg-stone-300', desc: 'Not renewed' },
          ].map((item, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <div className={cn("w-2.5 h-2.5 rounded-full", item.color)} />
                <span className="text-[10px] font-bold text-stone-900 uppercase tracking-wider">{item.label}</span>
              </div>
              <span className="text-[9px] text-stone-400 pl-4">{item.desc}</span>
            </div>
          ))}
        </div>

        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
              <XAxis 
                dataKey="label" 
                axisLine={false} 
                tickLine={false} 
                fontSize={10} 
                tick={{ fill: '#78716c' }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                fontSize={10} 
                tick={{ fill: '#78716c' }}
                label={trendView === 'percent' ? { value: '%', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10 } : undefined}
              />
              <Tooltip 
                cursor={{ fill: '#fafaf9' }}
                contentStyle={{ 
                  borderRadius: '16px', 
                  border: '1px solid #e7e5e4',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  fontSize: '12px'
                }}
                formatter={(value: any, name: string) => {
                  if (name === 'total') return null;
                  return trendView === 'percent' ? `${value}%` : value;
                }}
              />
              <Bar dataKey="Pre-6M" stackId="a" fill="#059669" barSize={40}>
                <LabelList dataKey="Pre-6M" content={(props: any) => renderStackLabel(props)} />
              </Bar>
              <Bar dataKey="Pre-0-6M" stackId="a" fill="#34d399" barSize={40}>
                <LabelList dataKey="Pre-0-6M" content={(props: any) => renderStackLabel(props)} />
              </Bar>
              <Bar dataKey="Post-0-6M" stackId="a" fill="#fbbf24" barSize={40}>
                <LabelList dataKey="Post-0-6M" content={(props: any) => renderStackLabel(props)} />
              </Bar>
              <Bar dataKey="Post-6-12M" stackId="a" fill="#f97316" barSize={40}>
                <LabelList dataKey="Post-6-12M" content={(props: any) => renderStackLabel(props)} />
              </Bar>
              <Bar dataKey="Post-1-2Y" stackId="a" fill="#ef4444" barSize={40}>
                <LabelList dataKey="Post-1-2Y" content={(props: any) => renderStackLabel(props)} />
              </Bar>
              <Bar dataKey="Pending" stackId="a" fill="#d6d3d1" radius={[4, 4, 0, 0]} barSize={40}>
                <LabelList dataKey="Pending" content={(props: any) => renderStackLabel(props)} />
                <LabelList 
                  dataKey="total" 
                  position="top" 
                  offset={10}
                  content={(props: any) => {
                    const { x, y, width, value, payload } = props;
                    if (!value || !payload) return null;
                    return (
                      <g>
                        <text x={x + width / 2} y={y - 25} fill="#1c1917" textAnchor="middle" fontSize={10} fontWeight="bold">
                          {payload.renewedPercent ?? 0}% Ren.
                        </text>
                        <text x={x + width / 2} y={y - 12} fill="#ef4444" textAnchor="middle" fontSize={10} fontWeight="bold">
                          {payload.pendingPercent ?? 0}% Pend.
                        </text>
                        <text x={x + width / 2} y={y + 12} fill="#78716c" textAnchor="middle" fontSize={9}>
                          (n={value})
                        </text>
                      </g>
                    );
                  }} 
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Retention by Hospital Size */}
      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
        <div className="mb-8">
          <h3 className="text-lg font-serif font-bold text-stone-900">Retention by Hospital Size</h3>
          <p className="text-xs text-stone-500">Are we retaining larger hospitals? Analysis by bed capacity.</p>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bedRetentionData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f5f5f4" />
              <XAxis 
                dataKey="category" 
                axisLine={false} 
                tickLine={false} 
                fontSize={12} 
                tick={{ fill: '#78716c' }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                fontSize={10} 
                tick={{ fill: '#78716c' }}
                label={{ value: 'Renewal Rate (%)', angle: -90, position: 'insideLeft', offset: 15, fontSize: 10, fill: '#a8a29e' }}
              />
              <Tooltip 
                cursor={{ fill: '#fafaf9' }}
                contentStyle={{ 
                  borderRadius: '16px', 
                  border: '1px solid #e7e5e4',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                }}
              />
              <Bar dataKey="rate" barSize={60} radius={[4, 4, 0, 0]}>
                {bedRetentionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={BED_COLORS[index % BED_COLORS.length]} />
                ))}
                <LabelList dataKey="rate" position="top" formatter={(val: any) => `${val}%`} fontSize={12} fontWeight="bold" fill="#1c1917" offset={10} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-8 border-t border-stone-100">
          {bedRetentionData.map((d, i) => (
            <div key={i} className="text-center">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">{d.category}</p>
              <p className="text-xl font-serif font-bold text-stone-900">{d.renewed} / {d.total}</p>
              <p className="text-[10px] text-stone-500 italic">Renewals</p>
            </div>
          ))}
        </div>
      </div>

      {/* Geographic Performance Table */}
      <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-xl font-serif font-bold text-stone-900">State & District Performance</h3>
            <p className="text-xs text-stone-500">Detailed renewal analysis by geography. Click a state to see district breakdown.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-bold text-stone-600 uppercase">Renewed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-stone-200" />
              <span className="text-[10px] font-bold text-stone-600 uppercase">Pending</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-100">
                <th className="pb-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                  <button 
                    onClick={() => setStateSort(prev => ({ field: 'name', order: prev.field === 'name' && prev.order === 'asc' ? 'desc' : 'asc' }))}
                    className="flex items-center gap-1 hover:text-stone-900 transition-colors"
                  >
                    State / District <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="pb-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-center">
                  <button 
                    onClick={() => setStateSort(prev => ({ field: 'total', order: prev.field === 'total' && prev.order === 'asc' ? 'desc' : 'asc' }))}
                    className="flex items-center gap-1 mx-auto hover:text-stone-900 transition-colors"
                  >
                    Total Hospitals <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="pb-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-center">Renewed</th>
                <th className="pb-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-center">Pending</th>
                <th className="pb-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest text-right">
                  <button 
                    onClick={() => setStateSort(prev => ({ field: 'rate', order: prev.field === 'rate' && prev.order === 'asc' ? 'desc' : 'asc' }))}
                    className="flex items-center gap-1 ml-auto hover:text-stone-900 transition-colors"
                  >
                    Renewal Rate <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {(() => {
                const stateData: Record<string, { total: number, renewed: number, districts: Record<string, { total: number, renewed: number }> }> = {};
                
                filteredHospitals.forEach(h => {
                  if (!stateData[h.state]) {
                    stateData[h.state] = { total: 0, renewed: 0, districts: {} };
                  }
                  stateData[h.state].total++;
                  if (h.reapplied) stateData[h.state].renewed++;

                  if (!stateData[h.state].districts[h.district]) {
                    stateData[h.state].districts[h.district] = { total: 0, renewed: 0 };
                  }
                  stateData[h.state].districts[h.district].total++;
                  if (h.reapplied) stateData[h.state].districts[h.district].renewed++;
                });

                const sortedStates = Object.entries(stateData)
                  .map(([name, data]) => ({
                    name,
                    total: data.total,
                    renewed: data.renewed,
                    pending: data.total - data.renewed,
                    rate: Math.round((data.renewed / data.total) * 100),
                    districts: data.districts
                  }))
                  .sort((a, b) => {
                    const order = stateSort.order === 'asc' ? 1 : -1;
                    if (stateSort.field === 'name') return a.name.localeCompare(b.name) * order;
                    if (stateSort.field === 'total') return (a.total - b.total) * order;
                    return (a.rate - b.rate) * order;
                  });

                return sortedStates.map(state => {
                  const isExpanded = expandedStates.has(state.name);
                  return (
                    <React.Fragment key={state.name}>
                      <tr 
                        className={cn(
                          "hover:bg-stone-50 transition-colors cursor-pointer group",
                          isExpanded && "bg-stone-50/50"
                        )}
                        onClick={() => {
                          const newExpanded = new Set(expandedStates);
                          if (isExpanded) newExpanded.delete(state.name);
                          else newExpanded.add(state.name);
                          setExpandedStates(newExpanded);
                        }}
                      >
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "p-1 rounded-md bg-stone-100 text-stone-400 transition-transform",
                              isExpanded && "rotate-180 bg-stone-900 text-white"
                            )}>
                              <ChevronDown className="w-3 h-3" />
                            </div>
                            <span className="font-bold text-stone-900">{state.name}</span>
                          </div>
                        </td>
                        <td className="py-4 text-center font-mono text-sm text-stone-600">{state.total}</td>
                        <td className="py-4 text-center">
                          <span className="text-sm font-bold text-emerald-600">{state.renewed}</span>
                        </td>
                        <td className="py-4 text-center">
                          <span className="text-sm font-bold text-stone-400">{state.pending}</span>
                        </td>
                        <td className="py-4">
                          <div className="flex items-center justify-end gap-3">
                            <div className="w-24 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-emerald-500 rounded-full" 
                                style={{ width: `${state.rate}%` }}
                              />
                            </div>
                            <span className="text-sm font-bold text-stone-900 w-10 text-right">{state.rate}%</span>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && Object.entries(state.districts)
                        .sort((a, b) => b[1].total - a[1].total)
                        .map(([distName, distData]) => {
                          const distRate = Math.round((distData.renewed / distData.total) * 100);
                          return (
                            <tr key={`${state.name}-${distName}`} className="bg-stone-50/30 border-l-2 border-stone-200">
                              <td className="py-3 pl-12">
                                <span className="text-xs text-stone-500 font-medium">{distName}</span>
                              </td>
                              <td className="py-3 text-center text-xs text-stone-400">{distData.total}</td>
                              <td className="py-3 text-center text-xs text-emerald-500/70 font-bold">{distData.renewed}</td>
                              <td className="py-3 text-center text-xs text-stone-300 font-bold">{distData.total - distData.renewed}</td>
                              <td className="py-3 pr-4">
                                <div className="flex items-center justify-end gap-3">
                                  <div className="w-16 h-1 bg-stone-100 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-emerald-400/60 rounded-full" 
                                      style={{ width: `${distRate}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] font-bold text-stone-400 w-8 text-right">{distRate}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Not Renewed Breakdown */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
          <h3 className="text-lg font-serif font-bold text-stone-900 mb-6">Not Renewed Breakdown</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={notRenewedBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {notRenewedBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={BREAKDOWN_COLORS[index % BREAKDOWN_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Reason Classification */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-serif font-bold text-stone-900 mb-6">Reason Classification (Connected)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reasonData} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={110} fontSize={10} />
                <Tooltip />
                <Bar dataKey="value" fill="#1c1917" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Reapplication Timing Analysis */}
        <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-serif font-bold text-stone-900 mb-6">Reapplication Timing Analysis</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-100">
                  <th className="py-3 text-xs font-bold text-stone-400 uppercase tracking-wider">Bucket</th>
                  <th className="py-3 text-xs font-bold text-stone-400 uppercase tracking-wider text-right">Count</th>
                  <th className="py-3 text-xs font-bold text-stone-400 uppercase tracking-wider text-right">Percentage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {timingAnalysis.map((b, i) => (
                  <tr key={i} className="hover:bg-stone-50 transition-colors">
                    <td className="py-3 text-sm text-stone-600">{b.label}</td>
                    <td className="py-3 text-sm font-bold text-stone-900 text-right">{b.count}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-sm font-bold text-stone-900">{b.percentage}%</span>
                        <div className="w-24 h-2 bg-stone-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-stone-900 rounded-full" 
                            style={{ width: `${b.percentage}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
});
