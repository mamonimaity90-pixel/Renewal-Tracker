import React, { useState, useMemo, useRef, useEffect, memo } from 'react';
import { Hospital, User, Interaction } from '../types';
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  Plus, 
  MoreVertical, 
  MapPin, 
  Bed,
  Calendar,
  UserPlus,
  Upload,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  X,
  Loader2,
  ChevronDown,
  AlertCircle,
  Download,
  Clock
} from 'lucide-react';
import { format, parseISO, isBefore, isAfter, startOfDay, differenceInDays } from 'date-fns';
import Papa from 'papaparse';
import { db, auth } from '../firebase';
import { collection, addDoc, updateDoc, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { BulkUpload } from './BulkUpload';

interface HospitalListProps {
  hospitals: Hospital[];
  users: User[];
  interactions: Interaction[];
  isAdmin: boolean;
}

const ITEMS_PER_PAGE = 50;

export const HospitalList = memo(function HospitalList({ hospitals, users, interactions, isAdmin }: HospitalListProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<keyof Hospital | 'lastAttemptedDate'>('expiryDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isAdding, setIsAdding] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [editingHospital, setEditingHospital] = useState<Hospital | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [bulkAssignUserId, setBulkAssignUserId] = useState('');
  
  // New Filter States
  const [filterUsers, setFilterUsers] = useState<string[]>([]);
  const [filterStates, setFilterStates] = useState<string[]>([]);
  const [filterRenewal, setFilterRenewal] = useState<'all' | 'renewed' | 'pending'>('all');
  const [filterConnection, setFilterConnection] = useState<'all' | 'connected' | 'not-connected' | 'none' | 'never-ever-connected'>('all');
  const [filterBatch, setFilterBatch] = useState<'all' | 'historical' | 'upcoming'>('all');
  const [filterEffortLed, setFilterEffortLed] = useState(false);
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterFollowUp, setFilterFollowUp] = useState<'all' | 'today' | 'overdue' | 'upcoming'>('all');
  const [activeHospitalId, setActiveHospitalId] = useState<string | null>(null);

  const availableStates = useMemo(() => Array.from(new Set(hospitals.map(h => h.state))).sort(), [hospitals]);

  const effortLedHospitals = useMemo(() => {
    const set = new Set<string>();
    hospitals.forEach(h => {
      if (h.reapplied && h.renewalApplicationDate) {
        const renewalDate = parseISO(h.renewalApplicationDate);
        const hospitalInteractions = interactions.filter(i => i.hospitalId === h.id);
        const hasInteractionBeforeRenewal = hospitalInteractions.some(i => 
          i.result === 'Connected' &&
          isBefore(parseISO(i.timestamp), renewalDate)
        );
        if (hasInteractionBeforeRenewal) set.add(h.id);
      }
    });
    return set;
  }, [hospitals, interactions]);

  const filteredHospitals = useMemo(() => {
    return hospitals
      .filter(h => {
        const matchesSearch = 
          h.name.toLowerCase().includes(search.toLowerCase()) ||
          h.state.toLowerCase().includes(search.toLowerCase()) ||
          h.district.toLowerCase().includes(search.toLowerCase()) ||
          h.applicationNo?.toLowerCase().includes(search.toLowerCase()) ||
          h.contactPerson?.toLowerCase().includes(search.toLowerCase());
        
        const matchesUser = filterUsers.length === 0 || filterUsers.includes(h.assignedTo || '');
        const matchesState = filterStates.length === 0 || filterStates.includes(h.state);
        
        let matchesBatch = true;
        if (filterBatch !== 'all') {
          const year = parseISO(h.expiryDate).getFullYear();
          if (filterBatch === 'historical') matchesBatch = year < 2026;
          if (filterBatch === 'upcoming') matchesBatch = year >= 2026;
        }

        const matchesRenewal = 
          filterRenewal === 'all' || 
          (filterRenewal === 'renewed' && h.reapplied) || 
          (filterRenewal === 'pending' && !h.reapplied);

        let matchesConnection = true;
        if (filterConnection !== 'all') {
          const hospitalInteractions = interactions.filter(i => i.hospitalId === h.id);
          const latestInteraction = hospitalInteractions.sort((a, b) => 
            parseISO(b.timestamp).getTime() - parseISO(a.timestamp).getTime()
          )[0];

          if (filterConnection === 'none') {
            matchesConnection = hospitalInteractions.length === 0;
          } else if (filterConnection === 'never-ever-connected') {
            // Has interactions but none of them are "Connected"
            matchesConnection = hospitalInteractions.length > 0 && !hospitalInteractions.some(i => i.result === 'Connected');
          } else if (filterConnection === 'connected') {
            matchesConnection = latestInteraction?.result === 'Connected';
          } else if (filterConnection === 'not-connected') {
            matchesConnection = latestInteraction?.result === 'Not Connected';
          }
        }
        
        let matchesDate = true;
        if (filterDateStart || filterDateEnd) {
          const expiry = parseISO(h.expiryDate);
          if (filterDateStart && isBefore(expiry, parseISO(filterDateStart))) matchesDate = false;
          if (filterDateEnd && isAfter(expiry, parseISO(filterDateEnd))) matchesDate = false;
        }

        const matchesEffort = !filterEffortLed || effortLedHospitals.has(h.id);

        let matchesFollowUp = true;
        if (filterFollowUp !== 'all' && h.nextFollowUpDate) {
          const fuDate = parseISO(h.nextFollowUpDate);
          const today = startOfDay(new Date());
          if (filterFollowUp === 'today') {
            matchesFollowUp = format(fuDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          } else if (filterFollowUp === 'overdue') {
            matchesFollowUp = isBefore(fuDate, today);
          } else if (filterFollowUp === 'upcoming') {
            matchesFollowUp = isAfter(fuDate, today) || format(fuDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
          }
        } else if (filterFollowUp !== 'all' && !h.nextFollowUpDate) {
          matchesFollowUp = false;
        }

        return matchesSearch && matchesUser && matchesState && matchesBatch && matchesRenewal && matchesConnection && matchesDate && matchesEffort && matchesFollowUp;
      })
      .map(h => {
        const hospitalInteractions = interactions.filter(i => i.hospitalId === h.id);
        const lastAtt = hospitalInteractions.sort((a, b) => 
          parseISO(b.timestamp).getTime() - parseISO(a.timestamp).getTime()
        )[0];
        
        return {
          ...h,
          lastAttemptedDate: lastAtt?.timestamp || null
        };
      })
      .sort((a, b) => {
        if (sortField === 'lastAttemptedDate') {
          const valA = (a as any).lastAttemptedDate || '';
          const valB = (b as any).lastAttemptedDate || '';
          if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
          if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
          return 0;
        }
        const valA = (a as any)[sortField] || '';
        const valB = (b as any)[sortField] || '';
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [hospitals, interactions, search, filterUsers, filterStates, filterRenewal, filterConnection, filterDateStart, filterDateEnd, filterEffortLed, filterFollowUp, sortField, sortOrder, effortLedHospitals]);

  const totalPages = Math.ceil(filteredHospitals.length / ITEMS_PER_PAGE);
  const paginatedHospitals = filteredHospitals.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSort = (field: keyof Hospital | 'lastAttemptedDate') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedHospitals.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedHospitals.map(h => h.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const handleBulkAssign = async () => {
    if (!bulkAssignUserId || selectedIds.size === 0) return;
    
    const batch = writeBatch(db);
    selectedIds.forEach(id => {
      batch.update(doc(db, 'hospitals', id), { assignedTo: bulkAssignUserId });
    });

    try {
      await batch.commit();
      setSelectedIds(new Set());
      setIsBulkAssigning(false);
      setBulkAssignUserId('');
    } catch (error) {
      console.error('Bulk assignment failed:', error);
    }
  };

  const assignHospital = async (hospitalId: string, userId: string) => {
    try {
      await updateDoc(doc(db, 'hospitals', hospitalId), { assignedTo: userId });
    } catch (error) {
      console.error('Assignment failed:', error);
    }
  };

  const handleExportCSV = () => {
    const dataToExport = filteredHospitals.map(h => ({
      'Hospital Name': h.name,
      'Application No': h.applicationNo,
      'State': h.state,
      'District': h.district,
      'Pincode': h.pincode,
      'Beds': h.beds,
      'Expiry Date': h.expiryDate ? format(parseISO(h.expiryDate), 'dd-MM-yyyy') : '',
      'Status': h.status,
      'Contact Person': h.contactPerson || '',
      'Designation': h.designation || '',
      'Contact Number': h.contactNumber || '',
      'Alternate Number': h.alternateNumber || '',
      'Assigned To': users.find(u => u.uid === h.assignedTo)?.name || 'Unassigned',
      'Reapplied': h.reapplied ? 'Yes' : 'No',
      'Reapplied Program': h.reappliedProgram || '',
      'Renewal App No': h.renewalApplicationNo || '',
      'Renewal App Date': h.renewalApplicationDate ? format(parseISO(h.renewalApplicationDate), 'dd-MM-yyyy') : ''
    }));

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Hospitals_Export_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <header>
          <h2 className="text-3xl font-serif font-bold text-stone-900">Hospitals</h2>
          <p className="text-stone-500">
            {filteredHospitals.length !== hospitals.length 
              ? `Showing ${filteredHospitals.length} leads out of ${hospitals.length} total`
              : `Manage and track hospital compliance status (${hospitals.length} total)`}
          </p>
        </header>
        {isAdmin && (
          <div className="flex gap-3">
            <button 
              onClick={handleExportCSV}
              className="flex items-center gap-2 bg-white border border-stone-200 text-stone-600 px-6 py-3 rounded-xl hover:bg-stone-50 transition-colors"
            >
              <Download className="w-5 h-5" />
              Export Table Data
            </button>
            <button 
              onClick={() => setIsBulkUploading(true)}
              className="flex items-center gap-2 bg-stone-100 text-stone-600 px-6 py-3 rounded-xl hover:bg-stone-200 transition-colors"
            >
              <Upload className="w-5 h-5" />
              Bulk Upload
            </button>
            <button 
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 bg-stone-900 text-white px-6 py-3 rounded-xl hover:bg-stone-800 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Hospital
            </button>
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && isAdmin && (
        <div className="bg-stone-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-lg animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">{selectedIds.size} hospitals selected</span>
            <div className="h-4 w-px bg-stone-700" />
            <div className="flex items-center gap-2">
              <select
                className="bg-stone-800 border-none rounded-lg text-xs text-white focus:ring-1 focus:ring-stone-600"
                value={bulkAssignUserId}
                onChange={(e) => setBulkAssignUserId(e.target.value)}
              >
                <option value="">Select Team Member...</option>
                {users.map(u => (
                  <option key={u.uid} value={u.uid}>{u.name}</option>
                ))}
              </select>
              <button 
                onClick={handleBulkAssign}
                disabled={!bulkAssignUserId}
                className="flex items-center gap-1 bg-white text-stone-900 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-stone-100 transition-colors disabled:opacity-50"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Assign Selected
              </button>
            </div>
          </div>
          <button 
            onClick={() => setSelectedIds(new Set())}
            className="text-stone-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
            <input
              type="text"
              placeholder="Search by name, state, district, app no, or contact..."
              className="w-full pl-10 pr-4 py-2 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-stone-200 text-sm"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="flex items-center gap-4">
            {(search || filterUsers.length > 0 || filterStates.length > 0 || filterRenewal !== 'all' || filterConnection !== 'all' || filterDateStart || filterDateEnd) && (
              <button 
                onClick={() => {
                  setSearch('');
                  setFilterUsers([]);
                  setFilterStates([]);
                  setFilterRenewal('all');
                  setFilterConnection('all');
                  setFilterEffortLed(false);
                  setFilterFollowUp('all');
                  setFilterDateStart('');
                  setFilterDateEnd('');
                  setCurrentPage(1);
                }}
                className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 px-3 py-2 bg-red-50 rounded-xl transition-colors"
              >
                <X className="w-3 h-3" /> Clear All
              </button>
            )}
            <div className="flex items-center gap-1 text-xs text-stone-400 font-medium">
              <span>Page {currentPage} of {totalPages || 1}</span>
            </div>
            <div className="flex gap-1">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="p-2 bg-stone-50 text-stone-600 rounded-lg hover:bg-stone-100 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="p-2 bg-stone-50 text-stone-600 rounded-lg hover:bg-stone-100 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4 pt-2 border-t border-stone-100">
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Assigned To</label>
            <MultiSelect
              options={users.map(u => ({ label: u.name, value: u.uid }))}
              selected={filterUsers}
              onChange={setFilterUsers}
              placeholder="All Team Members"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">State</label>
            <MultiSelect
              options={availableStates.map(s => ({ label: s, value: s }))}
              selected={filterStates}
              onChange={setFilterStates}
              placeholder="All States"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Status</label>
            <select
              className="w-full p-2 bg-stone-50 border-none rounded-lg text-xs focus:ring-1 focus:ring-stone-200"
              value={filterRenewal}
              onChange={(e) => setFilterRenewal(e.target.value as any)}
            >
              <option value="all">All Renewal Status</option>
              <option value="renewed">Renewed</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Latest Call Status</label>
            <select
              className="w-full p-2 bg-stone-50 border-none rounded-lg text-xs focus:ring-1 focus:ring-stone-200"
              value={filterConnection}
              onChange={(e) => setFilterConnection(e.target.value as any)}
            >
              <option value="all">All Status</option>
              <option value="connected">Connected (Last)</option>
              <option value="not-connected">Not Connected (Last)</option>
              <option value="none">Never Called</option>
              <option value="never-ever-connected">Never Connected</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Follow-up</label>
            <select
              className="w-full p-2 bg-stone-50 border-none rounded-lg text-xs focus:ring-1 focus:ring-stone-200"
              value={filterFollowUp}
              onChange={(e) => setFilterFollowUp(e.target.value as any)}
            >
              <option value="all">All Schedule</option>
              <option value="today">Today</option>
              <option value="overdue">Overdue</option>
              <option value="upcoming">Upcoming</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Effort Only</label>
            <button
              onClick={() => setFilterEffortLed(!filterEffortLed)}
              className={cn(
                "w-full p-2 rounded-lg text-xs font-bold transition-all border",
                filterEffortLed 
                  ? "bg-stone-900 border-stone-900 text-white" 
                  : "bg-white border-stone-200 text-stone-400 hover:border-stone-400"
              )}
            >
              Effort-Led Only
            </button>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Lead Batch</label>
            <select
              className="w-full p-2 bg-stone-50 border-none rounded-lg text-xs focus:ring-1 focus:ring-stone-200"
              value={filterBatch}
              onChange={(e) => setFilterBatch(e.target.value as any)}
            >
              <option value="all">Total Dataset</option>
              <option value="historical">2023-25 Batch</option>
              <option value="upcoming">2026 Batch</option>
            </select>
          </div>
          <div className="lg:col-span-1">
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Expiry From</label>
            <input
              type="date"
              className="w-full p-2 bg-stone-50 border-none rounded-lg text-xs focus:ring-1 focus:ring-stone-200"
              value={filterDateStart}
              onChange={(e) => setFilterDateStart(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Expiry To</label>
            <input
              type="date"
              className="w-full p-2 bg-stone-50 border-none rounded-lg text-xs focus:ring-1 focus:ring-stone-200"
              value={filterDateEnd}
              onChange={(e) => setFilterDateEnd(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-bottom border-stone-100 bg-stone-50/50">
                {isAdmin && (
                  <th className="p-4 w-10">
                    <button onClick={toggleSelectAll} className="text-stone-400 hover:text-stone-600">
                      {selectedIds.size === paginatedHospitals.length && paginatedHospitals.length > 0 ? (
                        <CheckSquare className="w-5 h-5 text-stone-900" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </th>
                )}
                <th className="p-4 text-xs font-serif italic text-stone-400 uppercase tracking-wider">
                  <button onClick={() => handleSort('name')} className="flex items-center gap-1">
                    Hospital Name <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="p-4 text-xs font-serif italic text-stone-400 uppercase tracking-wider">Contact Details</th>
                <th className="p-4 text-xs font-serif italic text-stone-400 uppercase tracking-wider">Location</th>
                <th className="p-4 text-xs font-serif italic text-stone-400 uppercase tracking-wider">
                  <button onClick={() => handleSort('nextFollowUpDate')} className="flex items-center gap-1">
                    Follow-up <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="p-4 text-xs font-serif italic text-stone-400 uppercase tracking-wider text-center">
                  <button onClick={() => handleSort('beds')} className="flex items-center gap-1 mx-auto">
                    Beds <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="p-4 text-xs font-serif italic text-stone-400 uppercase tracking-wider">
                  <button onClick={() => handleSort('expiryDate')} className="flex items-center gap-1">
                    Expiry Date <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="p-4 text-xs font-serif italic text-stone-400 uppercase tracking-wider">
                  <button onClick={() => handleSort('lastAttemptedDate')} className="flex items-center gap-1">
                    Last Attempt <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="p-4 text-xs font-serif italic text-stone-400 uppercase tracking-wider">Reapplied?</th>
                <th className="p-4 text-xs font-serif italic text-stone-400 uppercase tracking-wider">Assigned To</th>
                <th className="p-4 text-xs font-serif italic text-stone-400 uppercase tracking-wider">Status</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {paginatedHospitals.map((hospital) => (
                <tr key={hospital.id} className={cn(
                  "hover:bg-stone-50/50 transition-colors group",
                  selectedIds.has(hospital.id) && "bg-stone-50"
                )}>
                  {isAdmin && (
                    <td className="p-4">
                      <button onClick={() => toggleSelect(hospital.id)} className="text-stone-400 hover:text-stone-600">
                        {selectedIds.has(hospital.id) ? (
                          <CheckSquare className="w-5 h-5 text-stone-900" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </td>
                  )}
                  <td className="p-4">
                    <button 
                      onClick={() => setActiveHospitalId(hospital.id)}
                      className="text-left group/name"
                    >
                      <p className="font-semibold text-stone-900 group-hover/name:text-blue-600 transition-colors">{hospital.name}</p>
                      <p className="text-[10px] text-stone-400 flex items-center gap-1">
                        <Plus className="w-2.5 h-2.5" /> Log Interaction
                      </p>
                    </button>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-stone-700">{hospital.contactPerson || '—'}</span>
                        {hospital.designation && (
                          <span className="text-[10px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded font-bold uppercase">{hospital.designation}</span>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-stone-400">{hospital.contactNumber || '—'}</span>
                        {hospital.alternateNumber && (
                          <span className="text-[10px] text-stone-400 italic">Alt: {hospital.alternateNumber}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-stone-600">
                    <div className="flex flex-col gap-1 text-sm text-stone-600">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {hospital.district}, {hospital.state}
                      </div>
                      <span className="text-xs text-stone-400 ml-4">{hospital.pincode}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    {hospital.nextFollowUpDate ? (
                      <div className={cn(
                        "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg border",
                        isBefore(parseISO(hospital.nextFollowUpDate), startOfDay(new Date())) 
                          ? "bg-red-50 text-red-700 border-red-100" 
                          : "bg-amber-50 text-amber-700 border-amber-100"
                      )}>
                        <Clock className="w-3 h-3" />
                        {format(parseISO(hospital.nextFollowUpDate), 'MMM d, yyyy')}
                      </div>
                    ) : (
                      <span className="text-[10px] text-stone-300 uppercase font-black italic">No Schedule</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <div className="inline-flex items-center gap-1 px-2 py-1 bg-stone-100 rounded-lg text-xs font-mono">
                      <Bed className="w-3 h-3" />
                      {hospital.beds}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 text-sm text-stone-600">
                      <Calendar className="w-3 h-3" />
                      {format(parseISO(hospital.expiryDate), 'MMM d, yyyy')}
                    </div>
                  </td>
                  <td className="p-4">
                    {(hospital as any).lastAttemptedDate ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-stone-700">
                          {format(parseISO((hospital as any).lastAttemptedDate), 'MMM d, yyyy')}
                        </span>
                        <span className="text-[9px] text-stone-400 uppercase font-medium">
                          {differenceInDays(new Date(), parseISO((hospital as any).lastAttemptedDate))} days ago
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-stone-300 uppercase font-black italic">Never Called</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-xs font-medium",
                          hospital.reapplied ? "text-emerald-600" : "text-stone-400"
                        )}>
                          {hospital.reapplied ? 'Yes' : 'No'}
                        </span>
                        {effortLedHospitals.has(hospital.id) && (
                          <span className="bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md border border-emerald-200 tracking-tighter" title="Renewed after team engagement">
                            Effort-Led
                          </span>
                        )}
                      </div>
                      {hospital.reapplied && (
                        <span className="text-[10px] text-stone-400 italic">
                          {hospital.reappliedProgram}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    {isAdmin ? (
                      <select
                        className="text-xs bg-stone-50 border-none rounded-lg focus:ring-1 focus:ring-stone-200"
                        value={hospital.assignedTo || ''}
                        onChange={(e) => assignHospital(hospital.id, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {users.map(u => (
                          <option key={u.uid} value={u.uid}>{u.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm text-stone-500">
                        {users.find(u => u.uid === hospital.assignedTo)?.name || 'Unassigned'}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      hospital.status === 'Active' ? "bg-emerald-100 text-emerald-700" :
                      hospital.status === 'Expired' ? "bg-red-100 text-red-700" :
                      "bg-amber-100 text-amber-700"
                    )}>
                      {hospital.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => setEditingHospital(hospital)}
                      className="p-2 text-stone-400 hover:text-stone-900 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paginatedHospitals.length === 0 && (
          <div className="p-20 text-center">
            <p className="text-stone-400 italic">No hospitals found matching your criteria.</p>
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button 
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(prev => prev - 1)}
            className="flex items-center gap-1 px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          <div className="flex gap-1">
            {[...Array(totalPages)].map((_, i) => {
              const page = i + 1;
              // Only show a few pages around current
              if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      "w-10 h-10 rounded-xl text-sm font-bold transition-colors",
                      currentPage === page 
                        ? "bg-stone-900 text-white" 
                        : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-50"
                    )}
                  >
                    {page}
                  </button>
                );
              }
              if (page === currentPage - 2 || page === currentPage + 2) {
                return <span key={page} className="w-10 h-10 flex items-center justify-center text-stone-400">...</span>;
              }
              return null;
            })}
          </div>
          <button 
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(prev => prev + 1)}
            className="flex items-center gap-1 px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50 transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Add Hospital Modal (Simplified) */}
      {isAdding && (
        <AddHospitalModal 
          users={users} 
          hospitals={hospitals}
          onClose={() => setIsAdding(false)} 
        />
      )}
      {isBulkUploading && (
        <BulkUpload 
          onClose={() => setIsBulkUploading(false)} 
          users={users}
          existingHospitals={hospitals}
        />
      )}
      {editingHospital && (
        <EditHospitalModal
          hospital={editingHospital}
          users={users}
          onClose={() => setEditingHospital(null)}
        />
      )}
      {activeHospitalId && (
        <LogInteractionModal 
          hospital={hospitals.find(h => h.id === activeHospitalId)!}
          interactions={interactions.filter(i => i.hospitalId === activeHospitalId)}
          users={users}
          isAdmin={isAdmin}
          onClose={() => setActiveHospitalId(null)}
        />
      )}
    </div>
  );
});

function MultiSelect({ options, selected, onChange, placeholder }: { 
  options: { label: string, value: string }[], 
  selected: string[], 
  onChange: (val: string[]) => void,
  placeholder: string
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter(v => v !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-2 bg-stone-50 border-none rounded-lg text-xs flex items-center justify-between text-left min-h-[32px]"
      >
        <span className="truncate pr-2">
          {selected.length === 0 
            ? placeholder 
            : selected.length === 1 
              ? options.find(o => o.value === selected[0])?.label 
              : `${selected.length} selected`}
        </span>
        <ChevronDown className={cn("w-3 h-3 text-stone-400 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-xl max-h-60 overflow-y-auto p-2 space-y-1 animate-in fade-in zoom-in-95 duration-100">
          {options.map(option => (
            <label
              key={option.value}
              className="flex items-center gap-2 p-2 hover:bg-stone-50 rounded-lg cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                className="rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                checked={selected.includes(option.value)}
                onChange={() => toggleOption(option.value)}
              />
              <span className="text-xs text-stone-700">{option.label}</span>
            </label>
          ))}
          {options.length === 0 && (
            <p className="text-[10px] text-stone-400 italic p-2">No options available</p>
          )}
        </div>
      )}
    </div>
  );
}

function LogInteractionModal({ hospital, interactions, users, isAdmin, onClose }: { 
  hospital: Hospital, 
  interactions: Interaction[],
  users: User[],
  isAdmin: boolean,
  onClose: () => void 
}) {
  const [formData, setFormData] = useState({
    type: 'Call' as const,
    result: 'Connected' as const,
    reason: '' as any,
    remarks: '',
    notes: '',
    followUpDate: ''
  });
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editReason, setEditReason] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [isUpdatingHistory, setIsUpdatingHistory] = useState(false);
  const [reapplicationData, setReapplicationData] = useState({
    reapplied: false,
    reapplicationProgram: '',
    reapplicationNumber: '',
    reapplicationDate: ''
  });

  // Handle Manual Update logic
  useEffect(() => {
    if (formData.type === 'Manual Update') {
      setFormData(prev => ({ 
        ...prev, 
        result: 'Direct Update', 
        reason: 'Already applied for renewal' 
      }));
      setReapplicationData(prev => ({ ...prev, reapplied: true }));
    } else if (formData.result === 'Direct Update') {
      setFormData(prev => ({ ...prev, result: 'Connected' }));
    }
  }, [formData.type]);

  const needsReapplicationDetails = 
    formData.reason === 'Certification to Accreditation' || 
    formData.reason === 'Already applied for renewal' ||
    formData.type === 'Manual Update';

  const reasons = [
    'Certification to Accreditation',
    'Already applied for renewal',
    'Applied elsewhere',
    'Concerned person not available',
    'Does not see benefit',
    'Hospital shut down',
    'Need assistance',
    'Not interested',
    'Not Prepared',
    'SPOC change',
    'Will apply soon',
    'Yet to decide',
    'Others'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const assignedUser = users.find(u => u.uid === hospital.assignedTo);
      const dataToSave: any = {
        hospitalId: hospital.id,
        timestamp: serverTimestamp(),
        userId: auth.currentUser?.uid,
        assignedToName: assignedUser?.name || 'Unassigned',
        ...formData
      };

      if (needsReapplicationDetails) {
        dataToSave.reapplied = reapplicationData.reapplied;
        dataToSave.reapplicationProgram = reapplicationData.reapplicationProgram;
        dataToSave.reapplicationNumber = reapplicationData.reapplicationNumber;
        dataToSave.reapplicationDate = reapplicationData.reapplicationDate;
        dataToSave.verificationStatus = 'Pending';
      }

      if (formData.result !== 'Connected') {
        delete dataToSave.reason;
        delete dataToSave.remarks;
        delete dataToSave.followUpDate;
      }
      
      await addDoc(collection(db, 'interactions'), dataToSave);

      // Update hospital's next follow up date
      if (formData.followUpDate) {
        await updateDoc(doc(db, 'hospitals', hospital.id), {
          nextFollowUpDate: new Date(formData.followUpDate).toISOString()
        });
      }

      onClose();
    } catch (error) {
      console.error('Failed to log interaction:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateHistoryReason = async (interactionId: string) => {
    if (!editReason) return;
    setIsUpdatingHistory(true);
    try {
      await updateDoc(doc(db, 'interactions', interactionId), {
        reason: editReason,
        adminChangeRemarks: editRemarks.trim()
      });
      setEditingHistoryId(null);
      setEditReason('');
      setEditRemarks('');
    } catch (error) {
      console.error('History update failed:', error);
      alert('Failed to update interaction history.');
    } finally {
      setIsUpdatingHistory(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div>
            <h3 className="text-xl font-serif font-bold text-stone-900">Log Interaction</h3>
            <p className="text-xs text-stone-400">{hospital.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs font-bold text-stone-500 hover:text-stone-900 px-3 py-1.5 rounded-lg border border-stone-200"
            >
              {showHistory ? 'Show Form' : 'View History'}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-stone-400" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {showHistory ? (
            <div className="space-y-6">
              <h4 className="text-sm font-bold text-stone-900 uppercase tracking-wider">Interaction History</h4>
              {interactions.length === 0 ? (
                <p className="text-stone-400 italic text-sm">No previous interactions logged.</p>
              ) : (
                <div className="space-y-4">
                  {interactions.map((interaction) => (
                    <div key={interaction.id} className="p-4 bg-stone-50 rounded-2xl border border-stone-100">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                            interaction.result === 'Connected' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          )}>
                            {interaction.result}
                          </span>
                          <span className="text-xs text-stone-400">
                            {format(parseISO(interaction.timestamp), 'MMM d, yyyy HH:mm')}
                          </span>
                        </div>
                        <span className="text-[10px] font-medium text-stone-500">
                          by {users.find(u => u.uid === interaction.userId)?.name || 'Unknown'}
                          {interaction.assignedToName && ` • Assigned to: ${interaction.assignedToName}`}
                        </span>
                      </div>
                      
                      {editingHistoryId === interaction.id ? (
                        <div className="space-y-3 bg-white p-3 rounded-xl border border-stone-200 shadow-sm mt-1">
                          <div>
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">New Category</label>
                            <select
                              className="w-full bg-stone-50 border-none rounded-lg p-2 text-xs font-bold text-stone-900"
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                            >
                              {reasons.map(r => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest block mb-1">Correction Remark (for team visibility)</label>
                            <input
                              type="text"
                              className="w-full bg-stone-50 border-none rounded-lg p-2 text-xs"
                              placeholder="Why is this being changed?"
                              value={editRemarks}
                              onChange={(e) => setEditRemarks(e.target.value)}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              disabled={isUpdatingHistory}
                              onClick={() => handleUpdateHistoryReason(interaction.id)}
                              className="flex-1 bg-stone-900 text-white text-[10px] font-bold py-1.5 rounded-lg hover:bg-black disabled:opacity-50"
                            >
                              {isUpdatingHistory ? 'Updating...' : 'Save Change'}
                            </button>
                            <button
                              disabled={isUpdatingHistory}
                              onClick={() => setEditingHistoryId(null)}
                              className="flex-1 bg-stone-100 text-stone-600 text-[10px] font-bold py-1.5 rounded-lg hover:bg-stone-200 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between group/hist">
                          {interaction.reason && (
                            <p className="text-xs font-bold text-stone-700">Reason: {interaction.reason}</p>
                          )}
                          {isAdmin && interaction.reason && (
                            <button
                              onClick={() => {
                                setEditingHistoryId(interaction.id);
                                setEditReason(interaction.reason || '');
                                setEditRemarks(interaction.adminChangeRemarks || '');
                              }}
                              className="text-[10px] font-bold text-stone-400 hover:text-stone-900 px-2 py-0.5 rounded border border-stone-200 border-dashed opacity-0 group-hover/hist:opacity-100 transition-opacity"
                            >
                              Edit Category
                            </button>
                          )}
                        </div>
                      )}

                      {interaction.remarks && (
                        <p className="text-sm text-stone-600 mb-2 italic">"{interaction.remarks}"</p>
                      )}

                      {interaction.adminChangeRemarks && (
                        <div className="mb-2 p-2 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2">
                          <AlertCircle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[9px] font-bold text-amber-700 uppercase tracking-tighter">Admin Correction</p>
                            <p className="text-xs text-stone-600 italic">"{interaction.adminChangeRemarks}"</p>
                          </div>
                        </div>
                      )}
                      {interaction.notes && (
                        <div className="mt-2 pt-2 border-t border-stone-200">
                          <p className="text-xs text-stone-500"><span className="font-bold">Notes:</span> {interaction.notes}</p>
                        </div>
                      )}
                      {interaction.followUpDate && (
                        <p className="mt-2 text-[10px] text-amber-600 font-bold flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Follow-up: {format(parseISO(interaction.followUpDate), 'MMM d, yyyy')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Type</label>
                  <select
                    className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm"
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value as any})}
                  >
                    <option value="Call">Call</option>
                    <option value="Email">Email</option>
                    <option value="Meeting">Meeting</option>
                    <option value="Manual Update">Manual Update (Conversion Report)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Disposition</label>
                  <select
                    className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm"
                    disabled={formData.type === 'Manual Update'}
                    value={formData.result}
                    onChange={e => setFormData({...formData, result: e.target.value as any})}
                  >
                    <option value="Connected">Connected</option>
                    <option value="Not Connected">Not Connected</option>
                    {formData.type === 'Manual Update' && <option value="Direct Update">Direct Update</option>}
                  </select>
                </div>
              </div>

              {(formData.result === 'Connected' || formData.type === 'Manual Update') && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
                  {(formData.result === 'Connected' || formData.type === 'Manual Update') && (
                    <div>
                      <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">
                        {formData.type === 'Manual Update' ? 'Reported Classification' : 'Reason Classification'}
                      </label>
                      <select
                        required
                        className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm"
                        value={formData.reason}
                        onChange={e => setFormData({...formData, reason: e.target.value as any})}
                      >
                        <option value="">Select Reason...</option>
                        {formData.type === 'Manual Update' ? (
                          <>
                            <option value="Already applied for renewal">Already applied for renewal</option>
                            <option value="Certification to Accreditation">Certification to Accreditation</option>
                          </>
                        ) : (
                          reasons.map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))
                        )}
                      </select>
                    </div>
                  )}

                  {needsReapplicationDetails && (
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-4 animate-in zoom-in-95 duration-200">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="modal-reapplied"
                          className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                          checked={reapplicationData.reapplied}
                          onChange={e => setReapplicationData({...reapplicationData, reapplied: e.target.checked})}
                        />
                        <label htmlFor="modal-reapplied" className="text-xs font-bold text-stone-700 uppercase">Reapplied for renewal?</label>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold text-amber-900 uppercase mb-1">Reapplication Program</label>
                          <select
                            required={needsReapplicationDetails}
                            className="w-full p-2.5 bg-white border border-amber-200 rounded-xl text-sm"
                            value={reapplicationData.reapplicationProgram}
                            onChange={e => setReapplicationData({...reapplicationData, reapplicationProgram: e.target.value})}
                          >
                            <option value="">Select Program</option>
                            <option value="HCO">HCO</option>
                            <option value="SHCO">SHCO</option>
                            <option value="ECO">ECO</option>
                            <option value="ELCP">ELCP</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-amber-900 uppercase mb-1">Application Number</label>
                          <input
                            type="text"
                            required={needsReapplicationDetails}
                            placeholder="NABH-202X-XXXX"
                            className="w-full p-2.5 bg-white border border-amber-200 rounded-xl text-sm"
                            value={reapplicationData.reapplicationNumber}
                            onChange={e => setReapplicationData({...reapplicationData, reapplicationNumber: e.target.value})}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-amber-900 uppercase mb-1">Renewal Application Date</label>
                          <input
                            type="date"
                            required={needsReapplicationDetails}
                            className="w-full p-2.5 bg-white border border-amber-200 rounded-xl text-sm"
                            value={reapplicationData.reapplicationDate}
                            onChange={e => setReapplicationData({...reapplicationData, reapplicationDate: e.target.value})}
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-amber-600 italic leading-relaxed">
                        * Note: These details will be sent to the admin for verification.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Remarks</label>
                    <textarea
                      className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm min-h-[80px]"
                      placeholder="What was discussed?"
                      value={formData.remarks}
                      onChange={e => setFormData({...formData, remarks: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Follow-up Date</label>
                    <input
                      type="date"
                      className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm"
                      value={formData.followUpDate}
                      onChange={e => setFormData({...formData, followUpDate: e.target.value})}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">General Notes</label>
                <textarea
                  className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm min-h-[80px]"
                  placeholder="Any other notes for future follow-ups?"
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={onClose}
                  className="flex-1 py-3 px-6 rounded-xl text-stone-500 font-medium hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 px-6 rounded-xl bg-stone-900 text-white font-medium hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Interaction
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function EditHospitalModal({ hospital, users, onClose }: { 
  hospital: Hospital, 
  users: User[], 
  onClose: () => void 
}) {
  const [formData, setFormData] = useState({
    name: hospital.name,
    state: hospital.state,
    district: hospital.district,
    pincode: hospital.pincode,
    beds: hospital.beds,
    applicationNo: hospital.applicationNo,
    expiryDate: hospital.expiryDate,
    reapplied: hospital.reapplied,
    reappliedProgram: hospital.reappliedProgram || '',
    renewalApplicationNo: hospital.renewalApplicationNo || '',
    renewalApplicationDate: hospital.renewalApplicationDate ? format(parseISO(hospital.renewalApplicationDate), 'yyyy-MM-dd') : '',
    assignedTo: hospital.assignedTo || '',
    contactPerson: hospital.contactPerson || '',
    contactNumber: hospital.contactNumber || '',
    alternateNumber: hospital.alternateNumber || '',
    designation: hospital.designation || '',
    status: hospital.status
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dataToSave: any = { ...formData, applicationNo: formData.applicationNo.trim() };
      if (!dataToSave.reapplied) {
        dataToSave.reappliedProgram = '';
        dataToSave.renewalApplicationNo = '';
        dataToSave.renewalApplicationDate = '';
      } else if (dataToSave.renewalApplicationDate) {
        dataToSave.renewalApplicationDate = new Date(dataToSave.renewalApplicationDate).toISOString();
      }
      
      await updateDoc(doc(db, 'hospitals', hospital.id), dataToSave);
      onClose();
    } catch (error) {
      console.error('Update failed:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-serif font-bold text-stone-900">Edit Hospital Details</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-stone-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Hospital Name</label>
              <input
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Application No</label>
              <input
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.applicationNo}
                onChange={e => setFormData({...formData, applicationNo: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Status</label>
              <select
                className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm"
                value={formData.status}
                onChange={e => setFormData({...formData, status: e.target.value as any})}
              >
                <option value="Active">Active</option>
                <option value="Expired">Expired</option>
                <option value="Pending Renewal">Pending Renewal</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Assigned To</label>
              <select
                className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm"
                value={formData.assignedTo}
                onChange={e => setFormData({...formData, assignedTo: e.target.value})}
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.uid} value={u.uid}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Contact Person</label>
              <input
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.contactPerson}
                onChange={e => setFormData({...formData, contactPerson: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Designation</label>
              <input
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.designation}
                onChange={e => setFormData({...formData, designation: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Contact Number</label>
              <input
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.contactNumber}
                onChange={e => setFormData({...formData, contactNumber: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Alternate Number</label>
              <input
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.alternateNumber}
                onChange={e => setFormData({...formData, alternateNumber: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">State</label>
              <input
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.state}
                onChange={e => setFormData({...formData, state: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">District</label>
              <input
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.district}
                onChange={e => setFormData({...formData, district: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Pincode</label>
              <input
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.pincode}
                onChange={e => setFormData({...formData, pincode: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Beds</label>
              <input
                type="number"
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.beds}
                onChange={e => setFormData({...formData, beds: parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Cert Expiry Date</label>
              <input
                type="date"
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.expiryDate ? format(parseISO(formData.expiryDate), 'yyyy-MM-dd') : ''}
                onChange={e => setFormData({...formData, expiryDate: e.target.value ? new Date(e.target.value).toISOString() : ''})}
              />
            </div>
          </div>

          <div className="p-4 bg-stone-50 rounded-2xl space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="edit-reapplied"
                className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                checked={formData.reapplied}
                onChange={e => setFormData({...formData, reapplied: e.target.checked})}
              />
              <label htmlFor="edit-reapplied" className="text-sm font-medium text-stone-700">Reapplied for Renewal?</label>
            </div>

            {formData.reapplied && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Reapplied Program</label>
                  <select
                    className="w-full p-3 bg-white border border-stone-200 rounded-xl text-sm"
                    value={formData.reappliedProgram}
                    onChange={e => setFormData({...formData, reappliedProgram: e.target.value})}
                  >
                    <option value="">Select Program</option>
                    <option value="HCO">HCO</option>
                    <option value="SHCO">SHCO</option>
                    <option value="ECO">ECO</option>
                    <option value="ELCP">ELCP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Renewal App No</label>
                  <input
                    className="w-full p-3 bg-white border border-stone-200 rounded-xl text-sm"
                    value={formData.renewalApplicationNo}
                    onChange={e => setFormData({...formData, renewalApplicationNo: e.target.value})}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Renewal App Date</label>
                  <input
                    type="date"
                    className="w-full p-3 bg-white border border-stone-200 rounded-xl text-sm"
                    value={formData.renewalApplicationDate}
                    onChange={e => setFormData({...formData, renewalApplicationDate: e.target.value})}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 py-3 px-6 rounded-xl text-stone-500 font-medium hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-1 py-3 px-6 rounded-xl bg-stone-900 text-white font-medium hover:bg-stone-800 transition-colors"
            >
              Update Details
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddHospitalModal({ users, hospitals, onClose }: { users: User[], hospitals: Hospital[], onClose: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    state: '',
    district: '',
    pincode: '',
    beds: 0,
    applicationNo: '',
    expiryDate: '', // Start empty to force selection
    reapplied: false,
    reappliedProgram: '',
    renewalApplicationNo: '',
    renewalApplicationDate: '',
    assignedTo: '',
    status: 'Active' as const,
    contactPerson: '',
    contactNumber: '',
    alternateNumber: '',
    designation: ''
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Check for duplicate Application Number
    const duplicate = hospitals.find(h => h.applicationNo === formData.applicationNo.trim());
    if (duplicate) {
      setError(`A hospital with Application No "${formData.applicationNo}" already exists (${duplicate.name}).`);
      return;
    }

    try {
      const dataToSave: any = { ...formData, applicationNo: formData.applicationNo.trim() };
      if (!dataToSave.reapplied) {
        delete dataToSave.reappliedProgram;
        delete dataToSave.renewalApplicationNo;
        delete dataToSave.renewalApplicationDate;
      } else if (dataToSave.renewalApplicationDate) {
        dataToSave.renewalApplicationDate = new Date(dataToSave.renewalApplicationDate).toISOString();
      }
      
      await addDoc(collection(db, 'hospitals'), dataToSave);
      onClose();
    } catch (error) {
      console.error('Add failed:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-serif font-bold text-stone-900">Add New Hospital</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-stone-400" />
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600 text-sm animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Hospital Name</label>
              <input
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Application No</label>
              <input
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.applicationNo}
                onChange={e => setFormData({...formData, applicationNo: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Assigned To</label>
              <select
                className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm"
                value={formData.assignedTo}
                onChange={e => setFormData({...formData, assignedTo: e.target.value})}
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.uid} value={u.uid}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Contact Person</label>
              <input
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.contactPerson}
                onChange={e => setFormData({...formData, contactPerson: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Designation</label>
              <input
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.designation}
                onChange={e => setFormData({...formData, designation: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Contact Number</label>
              <input
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.contactNumber}
                onChange={e => setFormData({...formData, contactNumber: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Alternate Number</label>
              <input
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.alternateNumber}
                onChange={e => setFormData({...formData, alternateNumber: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">State</label>
              <input
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.state}
                onChange={e => setFormData({...formData, state: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">District</label>
              <input
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.district}
                onChange={e => setFormData({...formData, district: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Pincode</label>
              <input
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.pincode}
                onChange={e => setFormData({...formData, pincode: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Beds</label>
              <input
                type="number"
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.beds}
                onChange={e => setFormData({...formData, beds: parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Cert Expiry Date</label>
              <input
                type="date"
                required
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.expiryDate ? format(parseISO(formData.expiryDate), 'yyyy-MM-dd') : ''}
                onChange={e => setFormData({...formData, expiryDate: e.target.value ? new Date(e.target.value).toISOString() : ''})}
              />
            </div>
          </div>

          <div className="p-4 bg-stone-50 rounded-2xl space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="reapplied"
                className="w-4 h-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                checked={formData.reapplied}
                onChange={e => setFormData({...formData, reapplied: e.target.checked})}
              />
              <label htmlFor="reapplied" className="text-sm font-medium text-stone-700">Reapplied for Renewal?</label>
            </div>

            {formData.reapplied && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Reapplied Program</label>
                  <select
                    className="w-full p-3 bg-white border border-stone-200 rounded-xl text-sm"
                    value={formData.reappliedProgram}
                    onChange={e => setFormData({...formData, reappliedProgram: e.target.value})}
                  >
                    <option value="">Select Program</option>
                    <option value="HCO">HCO</option>
                    <option value="SHCO">SHCO</option>
                    <option value="ECO">ECO</option>
                    <option value="ELCP">ELCP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Renewal App No</label>
                  <input
                    className="w-full p-3 bg-white border border-stone-200 rounded-xl text-sm"
                    value={formData.renewalApplicationNo}
                    onChange={e => setFormData({...formData, renewalApplicationNo: e.target.value})}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Renewal App Date</label>
                  <input
                    type="date"
                    className="w-full p-3 bg-white border border-stone-200 rounded-xl text-sm"
                    value={formData.renewalApplicationDate}
                    onChange={e => setFormData({...formData, renewalApplicationDate: e.target.value})}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 py-3 px-6 rounded-xl text-stone-500 font-medium hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-1 py-3 px-6 rounded-xl bg-stone-900 text-white font-medium hover:bg-stone-800 transition-colors"
            >
              Save Hospital
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
