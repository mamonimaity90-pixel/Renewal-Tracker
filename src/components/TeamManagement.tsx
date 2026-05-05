import React, { useState, useEffect } from 'react';
import { User, Zone } from '../types';
import { Shield, User as UserIcon, Mail, Users, Plus, Trash2, CheckCircle2, ChevronRight, Globe, BarChart3 } from 'lucide-react';
import { db } from '../firebase';
import { doc, updateDoc, collection, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';

interface TeamManagementProps {
  users: User[];
  zones: Zone[];
}

const ALL_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 
  'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 
  'Ladakh', 'Lakshadweep', 'Puducherry'
];

const ZONE_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500'
];

export function TeamManagement({ users, zones }: TeamManagementProps) {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'zones'>('zones');
  const [isAddingZone, setIsAddingZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'team' : 'admin';
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (error) {
      console.error('Role update failed:', error);
    }
  };

  const handleAddZone = async () => {
    if (!newZoneName.trim()) return;
    const id = newZoneName.toLowerCase().replace(/\s+/g, '-');
    const color = ZONE_COLORS[zones.length % ZONE_COLORS.length];
    
    try {
      await setDoc(doc(db, 'zones', id), {
        id,
        name: newZoneName,
        states: selectedStates,
        color
      });
      setNewZoneName('');
      setSelectedStates([]);
      setIsAddingZone(false);
    } catch (error) {
      console.error('Failed to add zone:', error);
    }
  };

  const handleRemoveZone = async (zoneId: string) => {
    if (!confirm('Are you sure you want to delete this zone?')) return;
    try {
      await deleteDoc(doc(db, 'zones', zoneId));
      // Unassign users from this zone
      const usersInZone = users.filter(u => u.zoneId === zoneId);
      for (const u of usersInZone) {
        await updateDoc(doc(db, 'users', u.uid), { zoneId: null });
      }
    } catch (error) {
      console.error('Failed to remove zone:', error);
    }
  };

  const toggleStateInZone = (state: string) => {
    setSelectedStates(prev => 
      prev.includes(state) ? prev.filter(s => s !== state) : [...prev, state]
    );
  };

  const assignUserToZone = async (userId: string, zoneId: string | null) => {
    try {
      await updateDoc(doc(db, 'users', userId), { zoneId });
    } catch (error) {
      console.error('Failed to assign user:', error);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-stone-900">Team Structure</h2>
          <p className="text-stone-500">Configure regional zones and assign team members.</p>
        </div>
        <div className="flex bg-stone-100 p-1 rounded-2xl w-fit">
          <button 
            onClick={() => setActiveSubTab('zones')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeSubTab === 'zones' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-400 hover:text-stone-600'}`}
          >
            Regional Zones
          </button>
          <button 
            onClick={() => setActiveSubTab('users')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${activeSubTab === 'users' ? 'bg-white shadow-sm text-stone-900' : 'text-stone-400 hover:text-stone-600'}`}
          >
            Team Assignments
          </button>
        </div>
      </header>

      {activeSubTab === 'zones' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {zones.map(zone => (
              <div key={zone.id} className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden flex flex-col">
                <div className={`h-2 ${zone.color}`} />
                <div className="p-6 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-stone-900">{zone.name}</h3>
                      <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                        {users.filter(u => u.zoneId === zone.id).length} Members
                      </p>
                    </div>
                    <button 
                      onClick={() => handleRemoveZone(zone.id)}
                      className="p-2 text-stone-300 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-stone-400 uppercase mb-2 block">Covering States</label>
                      <div className="flex flex-wrap gap-2">
                        {zone.states.map(state => (
                          <span key={state} className="px-2.5 py-1 bg-stone-50 text-stone-600 rounded-lg text-[10px] font-medium border border-stone-100">
                            {state}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-stone-50">
                      <label className="text-[10px] font-bold text-stone-400 uppercase mb-2 block">Zone Team</label>
                      <div className="flex -space-x-2 overflow-hidden">
                        {users.filter(u => u.zoneId === zone.id).map(u => (
                          <div key={u.uid} className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-stone-100 flex items-center justify-center text-[10px] font-bold text-stone-600" title={u.name}>
                            {u.name[0]}
                          </div>
                        ))}
                        {users.filter(u => u.zoneId === zone.id).length === 0 && (
                          <p className="text-[10px] text-stone-300 italic">No members assigned yet</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {!isAddingZone ? (
              <button 
                onClick={() => setIsAddingZone(true)}
                className="bg-stone-50 border-2 border-dashed border-stone-200 rounded-3xl p-8 flex flex-col items-center justify-center gap-3 text-stone-400 hover:text-stone-600 hover:border-stone-300 transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                  <Plus className="w-6 h-6" />
                </div>
                <span className="font-bold text-sm">Add New Zone</span>
              </button>
            ) : (
              <div className="bg-white rounded-3xl border-2 border-stone-900 p-6 flex flex-col gap-4">
                <div>
                  <label className="text-[10px] font-bold text-stone-400 uppercase mb-1 block ml-1">Zone Name</label>
                  <input 
                    type="text" 
                    autoFocus
                    placeholder="e.g. North Zone"
                    className="w-full bg-stone-50 border-none rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-stone-200"
                    value={newZoneName}
                    onChange={e => setNewZoneName(e.target.value)}
                  />
                </div>
                
                <div>
                  <label className="text-[10px] font-bold text-stone-400 uppercase mb-2 block ml-1">Select States</label>
                  <div className="max-h-48 overflow-y-auto pr-2 space-y-1 custom-scrollbar">
                    {ALL_STATES.map(state => (
                      <button 
                        key={state}
                        onClick={() => toggleStateInZone(state)}
                        className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex items-center justify-between ${selectedStates.includes(state) ? 'bg-stone-900 text-white' : 'bg-stone-50 text-stone-600 hover:bg-stone-100'}`}
                      >
                        {state}
                        {selectedStates.includes(state) && <CheckCircle2 className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    onClick={handleAddZone}
                    className="flex-1 bg-stone-900 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-stone-800"
                  >
                    Create Zone
                  </button>
                  <button 
                    onClick={() => {
                      setIsAddingZone(false);
                      setNewZoneName('');
                      setSelectedStates([]);
                    }}
                    className="px-4 bg-stone-100 text-stone-600 py-2.5 rounded-xl text-xs font-bold hover:bg-stone-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'users' && (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-stone-400 uppercase tracking-widest">Team Member</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-stone-400 uppercase tracking-widest">Regional Assignment</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-stone-400 uppercase tracking-widest">Role</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold text-stone-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users.map(user => (
                <tr key={user.uid} className="hover:bg-stone-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-600">
                        {user.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-stone-900">{user.name}</p>
                        <p className="text-xs text-stone-400">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <select 
                      className="bg-transparent border-none text-xs font-bold text-stone-600 focus:ring-0 cursor-pointer"
                      value={user.zoneId || ''}
                      onChange={e => assignUserToZone(user.uid, e.target.value || null)}
                    >
                      <option value="">No Zone Assigned</option>
                      {zones.map(z => (
                        <option key={z.id} value={z.id}>{z.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${user.role === 'admin' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => toggleRole(user.uid, user.role)}
                      className="text-[10px] font-bold text-stone-400 hover:text-stone-900 uppercase tracking-widest"
                    >
                      Promote/Demote
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
