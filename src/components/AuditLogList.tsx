import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { AuditLog, User } from '../types';
import { Search, Filter, History, Calendar, User as UserIcon, ArrowRight, Table, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '../lib/utils';

interface AuditLogListProps {
  users: User[];
  currentUser: User | null;
}

export function AuditLogList({ users, currentUser }: AuditLogListProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    // Listen to audit_logs collection, limit to most recent 500 logs for efficiency
    const q = query(
      collection(db, 'audit_logs'),
      orderBy('timestamp', 'desc'),
      limit(500)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedLogs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AuditLog[];
      setLogs(fetchedLogs);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching audit logs:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesAction = filterAction === 'all' || log.action === filterAction;
      const matchesUser = filterUser === 'all' || log.userId === filterUser || log.userEmail === filterUser;
      
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        (log.itemName && log.itemName.toLowerCase().includes(searchLower)) ||
        (log.userEmail && log.userEmail.toLowerCase().includes(searchLower)) ||
        (log.userName && log.userName.toLowerCase().includes(searchLower)) ||
        (log.changes?.some(c => c.field && c.field.toLowerCase().includes(searchLower)));

      return matchesAction && matchesUser && matchesSearch;
    });
  }, [logs, filterAction, filterUser, searchTerm]);

  const uniqueUsersInLogs = useMemo(() => {
    const userEmails = new Set(logs.map(l => l.userEmail).filter(Boolean));
    return Array.from(userEmails).map(email => {
      const logUser = logs.find(l => l.userEmail === email);
      return {
        email,
        name: logUser?.userName || email
      };
    });
  }, [logs]);

  const toggleExpand = (id: string) => {
    if (expandedLogId === id) {
      setExpandedLogId(null);
    } else {
      setExpandedLogId(id);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'create':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1">Create</span>;
      case 'update':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-sky-50 text-sky-700 border border-sky-100 flex items-center gap-1">Update</span>;
      case 'delete':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-50 text-rose-700 border border-rose-100 flex items-center gap-1">Delete</span>;
      case 'bulk_assign':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 border border-amber-100 flex items-center gap-1">Bulk Assign</span>;
      case 'bulk_upload':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-violet-50 text-violet-700 border border-violet-100 flex items-center gap-1">Bulk Upload</span>;
      case 'verify':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-teal-50 text-teal-700 border border-teal-100 flex items-center gap-1">Verify</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-stone-50 text-stone-700 border border-stone-100">{action}</span>;
    }
  };

  const formatFieldValue = (val: any) => {
    if (val === null || val === undefined || val === '') return <span className="text-stone-400 italic">None</span>;
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  };

  const formatFieldName = (name: string) => {
    // Convert camelCase to title case
    const result = name.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1);
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-serif font-bold text-stone-900 flex items-center gap-3">
          <History className="w-8 h-8 text-stone-700" />
          Field Change Audit Logs
        </h2>
        <p className="text-stone-500 mt-1">
          Detailed history of every record edit, field changes, and allocations by users.
        </p>
      </header>

      {/* Control Box / Filters bar */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search bar */}
          <div className="md:col-span-2 relative">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Search by hospital, email, username or modified field..."
              className="w-full pl-11 pr-4 py-3 bg-stone-50 border-none rounded-2xl text-sm placeholder-stone-400 focus:ring-1 focus:ring-stone-200 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Action Filter */}
          <div>
            <select
              className="w-full p-3 bg-stone-50 border-none rounded-2xl text-sm text-stone-600 focus:ring-1 focus:ring-stone-200 outline-none transition-all"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            >
              <option value="all">All Actions</option>
              <option value="create">Created hospital</option>
              <option value="update">Updated hospital</option>
              <option value="bulk_assign">Assignment Changes</option>
              <option value="bulk_upload">Bulk XLSX/CSV Uploads</option>
              <option value="verify">Verification Approvals</option>
            </select>
          </div>

          {/* User Filter */}
          <div>
            <select
              className="w-full p-3 bg-stone-50 border-none rounded-2xl text-sm text-stone-600 focus:ring-1 focus:ring-stone-200 outline-none transition-all"
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
            >
              <option value="all">All Users / Logins</option>
              {uniqueUsersInLogs.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white p-24 rounded-3xl border border-stone-200 shadow-sm text-center">
          <Loader2 className="w-10 h-10 animate-spin text-stone-400 mx-auto mb-4" />
          <p className="text-stone-500 font-medium">Fetching change log entries...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="bg-white p-16 rounded-3xl border border-stone-200 shadow-sm text-center">
          <History className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <h3 className="text-xl font-serif font-bold text-stone-900">No Logs Found</h3>
          <p className="text-stone-500 mt-1">Try adjusting your filters or search term.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            return (
              <div 
                key={log.id} 
                className={cn(
                  "bg-white border border-stone-200 rounded-3xl shadow-sm transition-all overflow-hidden",
                  isExpanded ? "ring-1 ring-stone-900/5" : "hover:border-stone-300"
                )}
              >
                {/* Header row click to expand */}
                <div 
                  onClick={() => toggleExpand(log.id)}
                  className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                >
                  <div className="flex items-start md:items-center gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-stone-50 flex items-center justify-center border border-stone-100 flex-shrink-0">
                      <UserIcon className="w-5 h-5 text-stone-500" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-stone-950 text-sm md:text-base">
                          {log.userName}
                        </span>
                        <span className="text-xs text-stone-400 font-mono bg-stone-100/60 px-2 py-0.5 rounded-md">
                          {log.userEmail}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 mt-1 flex items-center gap-1">
                        Performed <strong className="text-stone-700 font-semibold">{log.action === 'bulk_upload' ? 'bulk import on' : 'changes to'}</strong>
                        <span className="bg-stone-50 border border-stone-200 px-1.5 py-0.5 rounded text-stone-800 font-medium">
                          {log.itemName}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-auto">
                    {getActionBadge(log.action)}
                    <div className="text-right flex-shrink-0">
                      <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider flex items-center gap-1 justify-end">
                        <Calendar className="w-3 h-3" />
                        {format(parseISO(log.timestamp), 'MMM d, yyyy')}
                      </div>
                      <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                        {format(parseISO(log.timestamp), 'hh:mm a')}
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-stone-400" /> : <ChevronDown className="w-5 h-5 text-stone-400" />}
                  </div>
                </div>

                {/* Expanded Details Field Changes list */}
                {isExpanded && (
                  <div className="px-6 pb-6 pt-2 border-t border-stone-100 bg-stone-50/10">
                    <div className="rounded-2xl border border-stone-200 overflow-hidden bg-white">
                      <table className="w-full border-collapse text-left text-xs md:text-sm">
                        <thead>
                          <tr className="bg-stone-50 border-b border-stone-200 text-[10px] uppercase tracking-wider text-stone-400 font-bold">
                            <th className="py-3 px-4 w-1/4">Modified Field</th>
                            <th className="py-3 px-4">Old Value</th>
                            <th className="py-3 px-4 w-12 text-center"></th>
                            <th className="py-3 px-4">New Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {log.changes && log.changes.length > 0 ? (
                            log.changes.map((change, index) => (
                              <tr key={index} className="hover:bg-stone-50/50 transition-colors">
                                <td className="py-3.5 px-4 font-semibold text-stone-800">
                                  {formatFieldName(change.field)}
                                </td>
                                <td className="py-3.5 px-4 text-stone-500 font-mono truncate max-w-[200px] md:max-w-none text-xs">
                                  {formatFieldValue(change.oldValue)}
                                </td>
                                <td className="py-3.5 px-4 text-stone-400 text-center">
                                  <ArrowRight className="w-4 h-4 mx-auto" />
                                </td>
                                <td className="py-3.5 px-4 text-emerald-700 font-mono font-medium truncate max-w-[200px] md:max-w-none text-xs">
                                  {formatFieldValue(change.newValue)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} className="py-4 px-4 text-center text-stone-400 italic">
                                Action recorded but no specific fields were updated.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 text-[10px] text-stone-400 font-mono text-right">
                      Log ID: {log.id}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
