import React, { useState } from 'react';
import { Hospital } from '../types';
import { FileText, Save } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';

interface LogApplicationProps {
  hospitals: Hospital[];
}

export function LogApplication({ hospitals }: LogApplicationProps) {
  const [formData, setFormData] = useState({
    hospitalId: '',
    applicationNumber: '',
    applicationDate: new Date().toISOString().split('T')[0],
    programType: '',
    status: 'Applied' as const
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.hospitalId) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'applications'), {
        ...formData,
        applicationDate: new Date(formData.applicationDate).toISOString()
      });
      setFormData({
        hospitalId: '',
        applicationNumber: '',
        applicationDate: new Date().toISOString().split('T')[0],
        programType: '',
        status: 'Applied'
      });
      alert('Application recorded successfully!');
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
          <FileText className="w-5 h-5" />
        </div>
        <h3 className="text-xl font-serif font-bold text-stone-900">Record Application</h3>
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

        <div>
          <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Application Number</label>
          <input
            required
            className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm"
            value={formData.applicationNumber}
            onChange={e => setFormData({...formData, applicationNumber: e.target.value})}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Date</label>
            <input
              type="date"
              required
              className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm"
              value={formData.applicationDate}
              onChange={e => setFormData({...formData, applicationDate: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-400 uppercase mb-1">Program Type</label>
            <input
              required
              placeholder="e.g. Entry Level"
              className="w-full p-3 bg-stone-50 border-none rounded-xl text-sm"
              value={formData.programType}
              onChange={e => setFormData({...formData, programType: e.target.value})}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-xl hover:bg-stone-800 transition-colors font-medium disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          {loading ? 'Recording...' : 'Record Application'}
        </button>
      </form>
    </div>
  );
}
