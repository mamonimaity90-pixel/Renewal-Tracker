import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  ChevronDown
} from 'lucide-react';
import { format, parseISO, isBefore, isAfter } from 'date-fns';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { BulkUpload } from './BulkUpload';

interface HospitalListProps {
  hospitals: Hospital[];
  users: User[];
  interactions: Interaction[];
  isAdmin: boolean;
}

const ITEMS_PER_PAGE = 50;

export function HospitalList({ hospitals, users, interactions, isAdmin }: HospitalListProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<keyof Hospital>('expiryDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isAdding, setIsAdding] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [bulkAssignUserId, setBulkAssignUserId] = useState('');
  
  // New Filter States
  const [filterUsers, setFilterUsers] = useState<string[]>([]);
  const [filterStates, setFilterStates] = useState<string[]>([]);
  const [filterRenewal, setFilterRenewal] = useState<'all' | 'renewed' | 'pending'>('all');
  const [filterConnection, setFilterConnection] = useState<'all' | 'connected' | 'not-connected' | 'none'>('all');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [activeHospitalId, setActiveHospitalId] = useState<string | null>(null);

  const availableStates = useMemo(() => Array.from(new Set(hospitals.map(h => h.state))).sort(), [hospitals]);

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

        return matchesSearch && matchesUser && matchesState && matchesRenewal && matchesConnection && matchesDate;
      })
      .sort((a, b) => {
        const valA = a[sortField] || '';
        const valB = b[sortField] || '';
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [hospitals, interactions, search, filterUsers, filterStates, filterRenewal, filterConnection, filterDateStart, filterDateEnd, sortField, sortOrder]);

  const totalPages = Math.ceil(filteredHospitals.length / ITEMS_PER_PAGE);
  const paginatedHospitals = filteredHospitals.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleSort = (field: keyof Hospital) => {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <header>
          <h2 className="text-3xl font-serif font-bold text-stone-900">Hospitals</h2>
          <p className="text-stone-500">Manage and track hospital compliance status ({hospitals.length} total).</p>
        </header>
        {isAdmin && (
          <div className="flex gap-3">
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

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 pt-2 border-t border-stone-100">
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
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Renewal Status</label>
            <select
              className="w-full p-2 bg-stone-50 border-none rounded-lg text-xs focus:ring-1 focus:ring-stone-200"
              value={filterRenewal}
              onChange={(e) => setFilterRenewal(e.target.value as any)}
            >
              <option value="all">All Status</option>
              <option value="renewed">Renewed</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Call Status</label>
            <select
              className="w-full p-2 bg-stone-50 border-none rounded-lg text-xs focus:ring-1 focus:ring-stone-200"
              value={filterConnection}
              onChange={(e) => setFilterConnection(e.target.value as any)}
            >
              <option value="all">All Calls</option>
              <option value="connected">Connected</option>
              <option value="not-connected">Not Connected</option>
              <option value="none">No Calls Yet</option>
            </select>
          </div>
          <div>
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
                <th className="p-4 text-xs font-serif italic text-stone-400 uppercase tracking-wider">App No</th>
                <th className="p-4 text-xs font-serif italic text-stone-400 uppercase tracking-wider">
                  <button onClick={() => handleSort('state')} className="flex items-center gap-1">
                    Location <ArrowUpDown className="w-3 h-3" />
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
                      <span className="font-medium text-stone-700">{hospital.contactPerson || '—'}</span>
                      <span className="text-xs text-stone-400">{hospital.contactNumber || '—'}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-stone-600">
                    {hospital.applicationNo}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1 text-sm text-stone-600">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {hospital.district}, {hospital.state}
                      </div>
                      <span className="text-xs text-stone-400 ml-4">{hospital.pincode}</span>
                    </div>
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
                    <div className="flex flex-col gap-1">
                      <span className={cn(
                        "text-xs font-medium",
                        hospital.reapplied ? "text-emerald-600" : "text-stone-400"
                      )}>
                        {hospital.reapplied ? 'Yes' : 'No'}
                      </span>
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
                    <button className="p-2 text-stone-400 hover:text-stone-900 opacity-0 group-hover:opacity-100 transition-opacity">
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
        <AddHospitalModal users={users} onClose={() => setIsAdding(false)} />
      )}
      {isBulkUploading && (
        <BulkUpload 
          onClose={() => setIsBulkUploading(false)} 
          users={users}
          existingHospitals={hospitals}
        />
      )}
      {activeHospitalId && (
        <LogInteractionModal 
          hospital={hospitals.find(h => h.id === activeHospitalId)!}
          interactions={interactions.filter(i => i.hospitalId === activeHospitalId)}
          users={users}
          onClose={() => setActiveHospitalId(null)}
        />
      )}
    </div>
  );
}

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

function LogInteractionModal({ hospital, interactions, users, onClose }: { 
  hospital: Hospital, 
  interactions: Interaction[],
  users: User[],
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

  const reasons = [
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
      const dataToSave: any = {
        hospitalId: hospital.id,
        timestamp: new Date().toISOString(),
        ...formData
      };
      if (formData.result !== 'Connected') {
        delete dataToSave.reason;
        delete dataToSave.remarks;
        delete dataToSave.followUpDate;
      }
      await addDoc(collection(db, 'interactions'), dataToSave);
      onClose();
    } catch (error) {
      console.error('Failed to log interaction:', error);
    } finally {
      setLoading(false);
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
                        </span>
                      </div>
                      {interaction.reason && (
                        <p className="text-xs font-bold text-stone-700 mb-1">Reason: {interaction.reason}</p>
                      )}
                      {interaction.remarks && (
                        <p className="text-sm text-stone-600 mb-2 italic">"{interaction.remarks}"</p>
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
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Disposition</label>
                  <select
                    className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm"
                    value={formData.result}
                    onChange={e => setFormData({...formData, result: e.target.value as any})}
                  >
                    <option value="Connected">Connected</option>
                    <option value="Not Connected">Not Connected</option>
                  </select>
                </div>
              </div>

              {formData.result === 'Connected' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Reason Classification</label>
                    <select
                      required
                      className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm"
                      value={formData.reason}
                      onChange={e => setFormData({...formData, reason: e.target.value as any})}
                    >
                      <option value="">Select Reason...</option>
                      {reasons.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>
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

function AddHospitalModal({ users, onClose }: { users: User[], onClose: () => void }) {
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
    currentProgram: '',
    assignedTo: '',
    status: 'Active' as const,
    contactPerson: '',
    contactNumber: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const dataToSave: any = { ...formData };
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
        <h3 className="text-2xl font-serif font-bold text-stone-900 mb-6">Add New Hospital</h3>
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
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Current Program</label>
              <input
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.currentProgram}
                onChange={e => setFormData({...formData, currentProgram: e.target.value})}
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
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Contact Number</label>
              <input
                className="w-full p-3 bg-stone-50 border-none rounded-xl"
                value={formData.contactNumber}
                onChange={e => setFormData({...formData, contactNumber: e.target.value})}
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
                  <input
                    className="w-full p-3 bg-white border border-stone-200 rounded-xl text-sm"
                    value={formData.reappliedProgram}
                    onChange={e => setFormData({...formData, reappliedProgram: e.target.value})}
                  />
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
