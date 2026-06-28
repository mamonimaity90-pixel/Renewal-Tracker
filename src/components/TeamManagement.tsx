import React, { useState, useEffect } from 'react';
import { User, Zone } from '../types';
import { Shield, User as UserIcon, Mail, Users, Plus, Trash2, CheckCircle2, ChevronRight, Globe, BarChart3, Clock, XCircle, Edit2, Check, X } from 'lucide-react';
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
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState('');
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [selectedStateToAdd, setSelectedStateToAdd] = useState('');
  const [customStateToAdd, setCustomStateToAdd] = useState('');

  const handleAddStateToZone = async (zone: Zone) => {
    const stateName = selectedStateToAdd || customStateToAdd.trim();
    if (!stateName) return;
    if (zone.states.some(s => s.toLowerCase() === stateName.toLowerCase())) {
      alert("This state is already in the zone.");
      return;
    }
    const updatedStates = [...zone.states, stateName];
    try {
      await updateDoc(doc(db, 'zones', zone.id), { states: updatedStates });
      setSelectedStateToAdd('');
      setCustomStateToAdd('');
      setEditingZoneId(null);
    } catch (error: any) {
      console.error('Failed to add state to zone:', error);
      alert(`Error adding state: ${error.message || 'Unknown error'}`);
    }
  };

  const handleRemoveStateFromZone = async (zone: Zone, stateToRemove: string) => {
    if (!window.confirm(`Are you sure you want to remove ${stateToRemove} from ${zone.name}?`)) return;
    const updatedStates = zone.states.filter(s => s !== stateToRemove);
    try {
      await updateDoc(doc(db, 'zones', zone.id), { states: updatedStates });
    } catch (error: any) {
      console.error('Failed to remove state from zone:', error);
      alert(`Error removing state: ${error.message || 'Unknown error'}`);
    }
  };

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'team' : 'admin';
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      alert(`User role updated to ${newRole}.`);
    } catch (error: any) {
      console.error('Role update failed:', error);
      alert(`Error updating role: ${error.message || 'Unknown error'}`);
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
    if (!window.confirm('Are you sure you want to delete this zone?')) return;
    try {
      await deleteDoc(doc(db, 'zones', zoneId));
      // Unassign users from this zone
      const usersInZone = users.filter(u => u.zoneId === zoneId);
      for (const u of usersInZone) {
        await updateDoc(doc(db, 'users', u.uid), { zoneId: null });
      }
      alert("Zone removed successfully.");
    } catch (error: any) {
      console.error('Failed to remove zone:', error);
      alert(`Error removing zone: ${error.message || 'Unknown error'}`);
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

  const updateUserStatus = async (userId: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'users', userId), { status });
      alert(`User status updated to ${status}.`);
    } catch (error: any) {
      console.error('Failed to update status:', error);
      alert(`Error updating status: ${error.message}`);
    }
  };

  const deleteUser = async (userId: string) => {
    if (userId === 'mDP3OgGwqvReP8FqRRDMgZv16V53' || userId === 'mamoni.maity90@gmail.com') {
      alert("Cannot delete the primary admin account.");
      return;
    }
    
    if (!window.confirm('Are you sure you want to delete this user profile? This action cannot be undone.')) return;
    
    try {
      await deleteDoc(doc(db, 'users', userId));
      alert("User profile deleted successfully.");
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      alert(`Error: ${error.message || 'Failed to delete user. You may have exceeded your Firebase quota.'}`);
    }
  };

  const handleUpdateEmail = async (userId: string) => {
    if (!editEmailValue.includes('@')) {
      alert("Please enter a valid email address.");
      return;
    }
    try {
      await updateDoc(doc(db, 'users', userId), { email: editEmailValue });
      setEditingEmailId(null);
      alert("Email updated successfully.");
    } catch (error: any) {
      console.error('Failed to update email:', error);
      alert(`Error: ${error.message || 'Failed to update email.'}`);
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
            Management & Access
          </button>
        </div>
      </header>

      {activeSubTab === 'users' && users.some(u => u.status === 'pending') && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-bold text-stone-900">Pending Approval Requests</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.filter(u => u.status === 'pending').map(pendingUser => (
              <div key={pendingUser.uid} className="bg-white p-5 rounded-3xl border border-blue-100 shadow-sm bg-blue-50/10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xs font-bold text-blue-600">
                    {pendingUser.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-stone-900 truncate">{pendingUser.name}</p>
                    <p className="text-xs text-stone-400 truncate">{pendingUser.email}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => updateUserStatus(pendingUser.uid, 'approved')}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-[10px] font-bold hover:bg-blue-700 transition-colors"
                  >
                    Approve
                  </button>
                  <button 
                    onClick={() => updateUserStatus(pendingUser.uid, 'rejected')}
                    className="flex-1 bg-stone-100 text-stone-600 py-2 rounded-xl text-[10px] font-bold hover:bg-stone-200 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
                          <span key={state} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-stone-50 text-stone-600 rounded-lg text-[10px] font-medium border border-stone-100">
                            {state}
                            <button
                              onClick={() => handleRemoveStateFromZone(zone, state)}
                              className="p-0.5 rounded text-stone-300 hover:text-red-500 hover:bg-stone-200/50 transition-colors"
                              title={`Remove ${state}`}
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                        {zone.states.length === 0 && (
                          <span className="text-[10px] text-stone-400 italic">No states configured for this zone</span>
                        )}
                      </div>

                      {/* Inline Add State Trigger / Form */}
                      {editingZoneId === zone.id ? (
                        <div className="mt-3 p-3 bg-stone-50 rounded-2xl border border-stone-200/60 space-y-2">
                          <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase block mb-1">Predefined States</label>
                            <select
                              value={selectedStateToAdd}
                              onChange={(e) => {
                                setSelectedStateToAdd(e.target.value);
                                setCustomStateToAdd('');
                              }}
                              className="w-full bg-white border border-stone-200 rounded-xl p-2 text-xs font-medium focus:ring-2 focus:ring-stone-200"
                            >
                              <option value="">-- Select State --</option>
                              {ALL_STATES.filter(s => !zone.states.includes(s)).map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                          <div className="text-center text-[10px] text-stone-400 font-bold uppercase tracking-wider">— OR —</div>
                          <div>
                            <label className="text-[9px] font-bold text-stone-400 uppercase block mb-1">Custom State Name</label>
                            <input
                              type="text"
                              placeholder="Type custom state name..."
                              value={customStateToAdd}
                              onChange={(e) => {
                                setCustomStateToAdd(e.target.value);
                                setSelectedStateToAdd('');
                              }}
                              className="w-full bg-white border border-stone-200 rounded-xl p-2 text-xs font-medium focus:ring-2 focus:ring-stone-200"
                            />
                          </div>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => handleAddStateToZone(zone)}
                              disabled={!selectedStateToAdd && !customStateToAdd.trim()}
                              className="flex-1 bg-stone-900 text-white py-2 rounded-xl text-xs font-bold hover:bg-stone-800 disabled:opacity-50 transition-colors"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => {
                                setEditingZoneId(null);
                                setSelectedStateToAdd('');
                                setCustomStateToAdd('');
                              }}
                              className="px-3 bg-white border border-stone-200 text-stone-600 py-2 rounded-xl text-xs font-bold hover:bg-stone-100 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingZoneId(zone.id);
                            setSelectedStateToAdd('');
                            setCustomStateToAdd('');
                          }}
                          className="mt-2.5 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-bold uppercase tracking-wider transition-colors"
                        >
                          <Plus className="w-3 h-3" /> Add State
                        </button>
                      )}
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
                <th className="px-6 py-4 text-left text-[10px] font-bold text-stone-400 uppercase tracking-widest">Status / Role</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold text-stone-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users.filter(u => u.status !== 'pending').sort((a, b) => a.name.localeCompare(b.name)).map(user => (
                <tr key={user.uid} className="hover:bg-stone-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-600">
                        {user.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-stone-900">{user.name}</p>
                        {editingEmailId === user.uid ? (
                          <div className="flex items-center gap-1 mt-1">
                            <input 
                              type="email"
                              className="text-xs p-1 border rounded bg-white w-48"
                              value={editEmailValue}
                              onChange={e => setEditEmailValue(e.target.value)}
                              autoFocus
                            />
                            <button onClick={() => handleUpdateEmail(user.uid)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-3 h-3" /></button>
                            <button onClick={() => setEditingEmailId(null)} className="p-1 text-rose-600 hover:bg-rose-50 rounded"><X className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group">
                            <p className="text-xs text-stone-400">{user.email}</p>
                            <button 
                              onClick={() => {
                                setEditingEmailId(user.uid);
                                setEditEmailValue(user.email);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-stone-900 transition-all"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
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
                    <div className="flex items-center gap-2">
                       <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                        user.status === 'approved' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 
                        'bg-rose-50 text-rose-600 border border-rose-100'
                      }`}>
                        {user.status}
                      </span>
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${user.role === 'admin' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}>
                        {user.role}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-4">
                      <button 
                        onClick={() => toggleRole(user.uid, user.role)}
                        className="text-[10px] font-bold text-stone-400 hover:text-stone-900 uppercase tracking-widest transition-colors"
                      >
                        {user.role === 'admin' ? 'Demote' : 'Promote'}
                      </button>
                      <button 
                        onClick={() => deleteUser(user.uid)}
                        className="p-2 text-stone-300 hover:text-rose-600 transition-colors"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
