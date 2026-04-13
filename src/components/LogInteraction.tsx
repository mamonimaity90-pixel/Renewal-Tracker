import React, { useState } from 'react';
import { Hospital, User } from '../types';
import { Phone, MessageSquare, Save } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';

interface LogInteractionProps {
  hospitals: Hospital[];
  user: User;
}

export function LogInteraction({ hospitals, user }: LogInteractionProps) {
  const [formData, setFormData] = useState({
    hospitalId: '',
    type: 'Call' as const,
    result: 'Connected' as const,
    reason: '' as any,
    remarks: '',
    notes: '',
    followUpDate: ''
  });
  const [loading, setLoading] = useState(false);

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
    if (!formData.hospitalId) return;
    
    setLoading(true);
    try {
      const dataToSave: any = {
        ...formData,
        userId: user.uid,
        timestamp: new Date().toISOString()
      };
      if (formData.result !== 'Connected') {
        delete dataToSave.reason;
        delete dataToSave.remarks;
        delete dataToSave.followUpDate;
      }
      await addDoc(collection(db, 'interactions'), dataToSave);
      setFormData({ 
        hospitalId: '',
        type: 'Call' as const,
        result: 'Connected' as const,
        reason: '',
        remarks: '',
        notes: '',
        followUpDate: ''
      });
      alert('Interaction logged successfully!');
    } catch (error) {
      console.error('Log failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-3xl border border-stone-200 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-stone-900 rounded-xl text-white">
          <Phone className="w-5 h-5" />
        </div>
        <h3 className="text-xl font-serif font-bold text-stone-900">Log Interaction</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Hospital</label>
          <select
            required
            className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm"
            value={formData.hospitalId}
            onChange={e => setFormData({...formData, hospitalId: e.target.value})}
          >
            <option value="">Select Hospital</option>
            {hospitals.map(h => (
              <option key={h.id} value={h.id}>{h.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Type</label>
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
            <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Result</label>
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
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Reason Classification</label>
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
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Remarks</label>
              <textarea
                className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm min-h-[80px]"
                placeholder="What was discussed?"
                value={formData.remarks}
                onChange={e => setFormData({...formData, remarks: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Follow-up Date</label>
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
          <label className="block text-xs font-bold text-stone-400 uppercase mb-1">General Notes</label>
          <textarea
            className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm h-24 resize-none"
            placeholder="Any other notes for future follow-ups..."
            value={formData.notes}
            onChange={e => setFormData({...formData, notes: e.target.value})}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-xl hover:bg-stone-800 transition-colors font-medium disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          {loading ? 'Saving...' : 'Save Interaction'}
        </button>
      </form>
    </div>
  );
}
