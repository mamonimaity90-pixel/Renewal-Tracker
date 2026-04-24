import React, { useState } from 'react';
import { Interaction, Hospital, User } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, XCircle, Clock, Hospital as HospitalIcon, User as UserIcon, Calendar, ClipboardCheck, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn, normalizeDate } from '../lib/utils';

interface VerificationQueueProps {
  interactions: Interaction[];
  hospitals: Hospital[];
  users: User[];
  currentUser: User;
}

export function VerificationQueue({ interactions, hospitals, users, currentUser }: VerificationQueueProps) {
  const pendingVerifications = interactions.filter(i => i.verificationStatus === 'Pending');

  if (pendingVerifications.length === 0) {
    return (
      <div className="bg-white p-12 rounded-3xl border border-stone-200 shadow-sm text-center">
        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-xl font-serif font-bold text-stone-900">Queue is Empty</h3>
        <p className="text-stone-500">No reapplication details are currently waiting for verification.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <header>
          <h2 className="text-3xl font-serif font-bold text-stone-900">Verification Queue</h2>
          <p className="text-stone-500">Review and approve self-reported reapplication details from the field.</p>
        </header>
        <div className="px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold flex items-center gap-2 border border-amber-100">
          <Clock className="w-4 h-4" />
          {pendingVerifications.length} Pending
        </div>
      </div>

      <div className="space-y-6">
        {pendingVerifications.map((log) => (
          <VerificationItem 
            key={log.id} 
            interaction={log} 
            hospitals={hospitals} 
            users={users} 
            currentUser={currentUser} 
          />
        ))}
      </div>
    </div>
  );
}

const REASONS = [
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
  'Certification to Accreditation',
  'Already applied for renewal',
  'Others'
];

function VerificationItem(props: any) {
  const { interaction, hospitals, users, currentUser } = props;
  const hospital = hospitals.find(h => h.id === interaction.hospitalId);
  const caller = users.find(u => u.uid === interaction.userId);
  const [loading, setLoading] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [editingReason, setEditingReason] = useState(false);
  const [currentReason, setCurrentReason] = useState(interaction.reason || '');
  const [adminChangeRemarks, setAdminChangeRemarks] = useState(interaction.adminChangeRemarks || '');

  // Initialize form data from interaction and hospital
  const [formData, setFormData] = useState({
    name: hospital?.name || '',
    state: hospital?.state || '',
    district: hospital?.district || '',
    pincode: hospital?.pincode || '',
    beds: hospital?.beds || 0,
    applicationNo: hospital?.applicationNo || '',
    expiryDate: hospital?.expiryDate || '',
    reapplied: true,
    reappliedProgram: interaction.reapplicationProgram || '',
    renewalApplicationNo: interaction.reapplicationNumber || '',
    renewalApplicationDate: interaction.reapplicationDate || (interaction.timestamp ? normalizeDate(interaction.timestamp).split('T')[0] : ''),
    assignedTo: hospital?.assignedTo || '',
    contactPerson: hospital?.contactPerson || '',
    contactNumber: hospital?.contactNumber || '',
    alternateNumber: hospital?.alternateNumber || '',
    designation: hospital?.designation || '',
    status: hospital?.status || 'Active'
  });
  const [verificationRemarks, setVerificationRemarks] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  const handleAction = async (status: 'Verified' | 'Rejected') => {
    if (status === 'Rejected' && !showRejectForm) {
      setShowRejectForm(true);
      return;
    }

    if (status === 'Rejected' && !verificationRemarks.trim()) {
      alert('Please provide remarks for rejection.');
      return;
    }

    if (status === 'Verified') {
      setLoading(true);
    } else {
      setRejecting(true);
    }

    try {
      const interactionRef = doc(db, 'interactions', interaction.id);
      
      // Update Interaction
      await updateDoc(interactionRef, {
        verificationStatus: status,
        verifiedBy: currentUser.uid,
        verifiedAt: serverTimestamp(),
        verificationRemarks: verificationRemarks.trim(),
        adminChangeRemarks: adminChangeRemarks.trim(),
        reason: currentReason,
        // Also update the reported data in the interaction if admin edited it
        reapplicationProgram: formData.reappliedProgram,
        reapplicationNumber: formData.renewalApplicationNo,
        reapplicationDate: formData.renewalApplicationDate
      });

      // If verified, update the hospital record with the edited form data
      if (status === 'Verified') {
        const hospitalRef = doc(db, 'hospitals', interaction.hospitalId);
        const hospitalDataToSave: any = { 
          ...formData, 
          applicationNo: formData.applicationNo.trim(),
          status: 'Active' 
        };

        if (hospitalDataToSave.renewalApplicationDate) {
          hospitalDataToSave.renewalApplicationDate = new Date(hospitalDataToSave.renewalApplicationDate).toISOString();
        }

        await updateDoc(hospitalRef, hospitalDataToSave);
      }

      // No alert needed for success if we want a smoother experience, but let's keep one simple alert
      console.log(`Action ${status} completed`);
    } catch (err) {
      console.error('Action failed:', err);
      alert('Action failed. Please check console.');
    } finally {
      setLoading(false);
      setRejecting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden border-t-4 border-t-amber-400">
      <div className="p-6 border-b border-stone-100 bg-stone-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-stone-100">
            <HospitalIcon className="w-6 h-6 text-stone-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-stone-400 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider">{hospital?.state} / {hospital?.district}</span>
            </div>
            <h4 className="text-lg font-serif font-bold text-stone-900">{hospital?.name}</h4>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5 text-stone-400 text-[10px] font-bold uppercase">
            <Calendar className="w-3.5 h-3.5" />
            Logged: {format(parseISO(normalizeDate(interaction.timestamp)), 'MMM d, yyyy')}
          </div>
          <div className="flex items-center gap-1.5 text-stone-500 text-xs font-medium bg-white px-2.5 py-1 rounded-full border border-stone-100">
            <UserIcon className="w-3.5 h-3.5" />
            By {caller?.name || 'Unknown'}
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {/* Interaction Context */}
        <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100 space-y-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-stone-200"></div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Original Log Reason</p>
              <span className={cn(
                "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                interaction.type === 'Manual Update' ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-600"
              )}>
                {interaction.type || 'Call'}
              </span>
            </div>
            {!editingReason && (
              <button 
                onClick={() => setEditingReason(true)}
                className="text-[10px] font-bold text-stone-400 hover:text-stone-900 border-b border-stone-200 border-dashed"
              >
                Edit Category
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {editingReason ? (
              <div className="flex items-center gap-2 w-full">
                <select
                  className="flex-1 p-2 bg-white border border-stone-200 rounded-xl text-sm font-bold text-stone-900 focus:ring-2 focus:ring-amber-200 outline-none"
                  value={currentReason}
                  onChange={(e) => setCurrentReason(e.target.value)}
                >
                  {REASONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button 
                  onClick={() => setEditingReason(false)}
                  className="p-2 bg-stone-900 text-white rounded-xl hover:bg-black transition-colors"
                  title="DoneEditing"
                >
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <span className="text-sm font-bold text-stone-900">{currentReason}</span>
            )}
          </div>
          
          {editingReason && (
            <div className="space-y-2 pt-2">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Reason for correction (shows in activity logs)</label>
              <input 
                type="text"
                placeholder="Why are you changing the category?"
                className="w-full p-3 bg-white border border-stone-100 rounded-xl text-xs focus:ring-2 focus:ring-amber-200 outline-none transition-all"
                value={adminChangeRemarks}
                onChange={(e) => setAdminChangeRemarks(e.target.value)}
              />
            </div>
          )}

          {interaction.remarks && (
            <p className="text-sm text-stone-600 italic">"{interaction.remarks}"</p>
          )}
        </div>

        {/* The "Same Form" section */}
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-stone-400 uppercase mb-2">Hospital Name</label>
              <input
                className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl text-sm focus:ring-2 focus:ring-amber-200 outline-none transition-all"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-2">Application No</label>
              <input
                className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl text-sm focus:ring-2 focus:ring-amber-200 outline-none transition-all"
                value={formData.applicationNo}
                onChange={e => setFormData({...formData, applicationNo: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-2">Assigned To</label>
              <select
                className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl text-sm focus:ring-2 focus:ring-amber-200 outline-none transition-all"
                value={formData.assignedTo}
                onChange={e => setFormData({...formData, assignedTo: e.target.value})}
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u.uid} value={u.uid}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-2">Contact Person</label>
              <input
                className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl text-sm focus:ring-2 focus:ring-amber-200 outline-none transition-all"
                value={formData.contactPerson}
                onChange={e => setFormData({...formData, contactPerson: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-2">Contact Number</label>
              <input
                className="w-full p-4 bg-stone-50 border border-stone-100 rounded-2xl text-sm focus:ring-2 focus:ring-amber-200 outline-none transition-all"
                value={formData.contactNumber}
                onChange={e => setFormData({...formData, contactNumber: e.target.value})}
              />
            </div>
          </div>

          {/* Verification-specific details with the "Same Form" look */}
          <div className="p-6 bg-emerald-50 rounded-3xl border border-emerald-100 space-y-6">
            <h5 className="text-sm font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              Reapplication Details to Verify
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-[10px] font-bold text-emerald-600 uppercase mb-2">Renewal Program</label>
                <select
                  className="w-full p-4 bg-white border border-emerald-100 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
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
                <label className="block text-[10px] font-bold text-emerald-600 uppercase mb-2">Renewal App No</label>
                <input
                  className="w-full p-4 bg-white border border-emerald-100 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-200 outline-none transition-all font-mono"
                  value={formData.renewalApplicationNo}
                  onChange={e => setFormData({...formData, renewalApplicationNo: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-emerald-600 uppercase mb-2">Renewal App Date</label>
                <input
                  type="date"
                  className="w-full p-4 bg-white border border-emerald-100 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                  value={formData.renewalApplicationDate}
                  onChange={e => setFormData({...formData, renewalApplicationDate: e.target.value})}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Unified Verification Actions */}
        <div className="flex flex-col gap-6 pt-8 border-t border-stone-100">
          {showRejectForm && (
            <div className="p-6 bg-red-50 rounded-2xl border border-red-100 space-y-3">
              <label className="block text-xs font-bold text-red-800 uppercase tracking-widest">Provide Remarks for Rejection</label>
              <textarea
                className="w-full p-4 bg-white border border-red-200 rounded-xl text-sm focus:ring-2 focus:ring-red-200 outline-none transition-all"
                rows={3}
                placeholder="Explain why these details are being rejected..."
                value={verificationRemarks}
                onChange={e => setVerificationRemarks(e.target.value)}
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowRejectForm(false)}
                  className="px-4 py-2 text-xs font-bold text-stone-500 hover:text-stone-700 uppercase"
                >
                  Go Back
                </button>
                <button
                  disabled={rejecting || !verificationRemarks.trim()}
                  onClick={() => handleAction('Rejected')}
                  className="px-6 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors uppercase"
                >
                  {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4">
            {!showRejectForm && (
              <>
                <button
                  disabled={loading || rejecting}
                  onClick={() => handleAction('Verified')}
                  className="flex-1 flex items-center justify-center gap-2 bg-stone-900 text-white py-4 px-8 rounded-2xl hover:bg-black transition-all font-bold disabled:opacity-50 text-sm shadow-md active:scale-[0.98]"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  Approve & Update Records
                </button>
                <button
                  disabled={loading || rejecting}
                  onClick={() => handleAction('Rejected')}
                  className="flex items-center justify-center gap-2 bg-white text-red-600 border border-red-100 py-4 px-8 rounded-2xl hover:bg-red-50 transition-all font-bold disabled:opacity-50 text-sm active:scale-[0.98]"
                >
                  <XCircle className="w-5 h-5" />
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
