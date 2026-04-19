import React, { useState, useMemo } from 'react';
import { Hospital, Interaction, User } from '../types';
import { Phone, Mail, Users, Calendar, Search, Filter, Clock, ChevronRight } from 'lucide-react';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn } from '../lib/utils';

interface ActivityLogProps {
  hospitals: Hospital[];
  interactions: Interaction[];
  users: User[];
}

export function ActivityLog({ hospitals, interactions, users }: ActivityLogProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  const filteredLogs = useMemo(() => {
    return interactions
      .filter(log => {
        const hospital = hospitals.find(h => h.id === log.hospitalId);
        const matchesType = filterType === 'all' || log.type === filterType;
        const matchesUser = filterUser === 'all' || log.userId === filterUser;
        const matchesSearch = !searchTerm || 
          hospital?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          log.remarks?.toLowerCase().includes(searchTerm.toLowerCase());
        
        let matchesDate = true;
        if (dateStart || dateEnd) {
          const logDate = parseISO(log.timestamp);
          const start = dateStart ? startOfDay(parseISO(dateStart)) : new Date(0);
          const end = dateEnd ? endOfDay(parseISO(dateEnd)) : new Date();
          matchesDate = isWithinInterval(logDate, { start, end });
        }

        return matchesType && matchesUser && matchesSearch && matchesDate;
      })
      .sort((a, b) => parseISO(b.timestamp).getTime() - parseISO(a.timestamp).getTime());
  }, [interactions, hospitals, filterType, filterUser, searchTerm, dateStart, dateEnd]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-stone-900">Activity Logs</h2>
          <p className="text-stone-500">Live feed of all field interactions and calls.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-stone-100 rounded-2xl text-[10px] font-bold uppercase text-stone-500">
          <Clock className="w-3.5 h-3.5" />
          {filteredLogs.length} Records Found
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Search hospitals or remarks..."
              className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border-none rounded-xl text-sm"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          
          <select
            className="w-full p-2.5 bg-stone-50 border-none rounded-xl text-sm"
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
          >
            <option value="all">All Channels</option>
            <option value="Call">Calls</option>
            <option value="Email">Emails</option>
            <option value="Meeting">Meetings</option>
          </select>

          <select
            className="w-full p-2.5 bg-stone-50 border-none rounded-xl text-sm"
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
          >
            <option value="all">All Team Members</option>
            {users.map(u => (
              <option key={u.uid} value={u.uid}>{u.name}</option>
            ))}
          </select>

          <input
            type="date"
            className="w-full p-2.5 bg-stone-50 border-none rounded-xl text-sm"
            value={dateStart}
            onChange={e => setDateStart(e.target.value)}
          />
          <input
            type="date"
            className="w-full p-2.5 bg-stone-50 border-none rounded-xl text-sm"
            value={dateEnd}
            onChange={e => setDateEnd(e.target.value)}
          />
        </div>
      </div>

      {/* Log Feed */}
      <div className="space-y-4">
        {filteredLogs.map((log) => {
          const hospital = hospitals.find(h => h.id === log.hospitalId);
          const reporter = users.find(u => u.uid === log.userId);
          
          return (
            <div key={log.id} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm hover:shadow-md transition-all group">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Status Column */}
                <div className="md:w-48 flex flex-col gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider",
                      log.result === 'Connected' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    )}>
                      {log.result}
                    </span>
                    <span className="p-1.5 bg-stone-100 rounded-lg text-stone-500">
                      {log.type === 'Call' ? <Phone className="w-3 h-3" /> : 
                       log.type === 'Email' ? <Mail className="w-3 h-3" /> : 
                       <Users className="w-3 h-3" />}
                    </span>
                  </div>
                  <div className="text-[10px] text-stone-400 font-bold uppercase flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(parseISO(log.timestamp), 'MMM d, yyyy • h:mm a')}
                  </div>
                </div>

                {/* Content Column */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-stone-900 group-hover:text-stone-700 transition-colors">
                      {hospital?.name || 'Unknown Hospital'}
                    </h4>
                    <span className="text-[10px] text-stone-400 bg-stone-50 px-2 py-1 rounded-md">
                      {hospital?.state}
                    </span>
                  </div>

                  {log.reason && (
                    <div className="flex flex-wrap gap-2">
                      <span className="text-[10px] font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded uppercase">
                        Reason: {log.reason}
                      </span>
                      {log.verificationStatus && (
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded uppercase flex items-center gap-1",
                          log.verificationStatus === 'Pending' ? "bg-amber-100 text-amber-700" :
                          log.verificationStatus === 'Verified' ? "bg-emerald-100 text-emerald-700" :
                          "bg-red-100 text-red-700"
                        )}>
                          Verification: {log.verificationStatus}
                        </span>
                      )}
                    </div>
                  )}

                  {log.remarks && (
                    <p className="text-sm text-stone-600 italic border-l-2 border-stone-100 pl-4 py-1">
                      "{log.remarks}"
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 border-t border-stone-50">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 bg-stone-900 rounded-full flex items-center justify-center text-[8px] text-white font-bold">
                        {reporter?.name.charAt(0)}
                      </div>
                      <span className="text-[11px] font-medium text-stone-500">
                        Reporter: <span className="text-stone-900 font-bold">{reporter?.name || 'Unknown'}</span>
                      </span>
                    </div>
                    {log.assignedToName && (
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-stone-400" />
                        <span className="text-[11px] font-medium text-stone-500">
                          Assigned To: <span className="text-amber-600 font-bold">{log.assignedToName}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-center md:px-4">
                  <ChevronRight className="w-5 h-5 text-stone-200 group-hover:text-stone-400 transition-colors" />
                </div>
              </div>
            </div>
          );
        })}

        {filteredLogs.length === 0 && (
          <div className="bg-white p-20 rounded-3xl border border-stone-200 shadow-sm text-center">
            <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Filter className="w-8 h-8 text-stone-200" />
            </div>
            <h3 className="text-xl font-serif font-bold text-stone-900">No logs found</h3>
            <p className="text-stone-500">Try adjusting your filters or search terms.</p>
          </div>
        )}
      </div>
    </div>
  );
}
