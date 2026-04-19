import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, onSnapshot, deleteDoc, doc, query, where } from 'firebase/firestore';
import { Calendar, Mail, Trash2, Plus, Loader2, CheckCircle2 } from 'lucide-react';
import { normalizeDate } from '../lib/utils';

export function ReportScheduler() {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [newSchedule, setNewSchedule] = useState({
    frequency: 'weekly',
    recipients: '',
    type: 'summary'
  });

  useEffect(() => {
    const q = query(collection(db, 'report_schedules'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const item = doc.data();
        return {
          id: doc.id,
          ...item,
          lastSent: normalizeDate(item.lastSent)
        };
      });
      setSchedules(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleAdd = async () => {
    if (!newSchedule.recipients) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'report_schedules'), {
        ...newSchedule,
        createdBy: auth.currentUser?.uid,
        lastSent: null
      });
      setShowAdd(false);
      setNewSchedule({ frequency: 'weekly', recipients: '', type: 'summary' });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this schedule?')) {
      await deleteDoc(doc(db, 'report_schedules', id));
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
        <div>
          <h3 className="text-lg font-serif font-bold text-stone-900">Automated Reports</h3>
          <p className="text-xs text-stone-500">Schedule periodic email reports for the team.</p>
        </div>
        <button 
          onClick={() => setShowAdd(!showAdd)}
          className="p-2 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 space-y-4">
        {showAdd && (
          <div className="p-6 bg-stone-50 rounded-2xl border border-stone-200 space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Frequency</label>
                <select 
                  className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-sm"
                  value={newSchedule.frequency}
                  onChange={e => setNewSchedule({...newSchedule, frequency: e.target.value})}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Report Type</label>
                <select 
                  className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-sm"
                  value={newSchedule.type}
                  onChange={e => setNewSchedule({...newSchedule, type: e.target.value})}
                >
                  <option value="summary">Summary Only</option>
                  <option value="detailed">Detailed Analysis</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Recipients (Comma separated emails)</label>
              <input 
                type="text"
                placeholder="manager@example.com, team@example.com"
                className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-sm"
                value={newSchedule.recipients}
                onChange={e => setNewSchedule({...newSchedule, recipients: e.target.value})}
              />
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleAdd}
                disabled={saving}
                className="flex-1 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Save Schedule
              </button>
              <button 
                onClick={() => setShowAdd(false)}
                className="px-6 py-2.5 text-stone-500 text-sm font-bold hover:bg-stone-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 text-stone-200 animate-spin" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-stone-100 rounded-2xl">
            <Calendar className="w-10 h-10 text-stone-200 mx-auto mb-2" />
            <p className="text-stone-400 text-sm">No automated reports scheduled yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map(s => (
              <div key={s.id} className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-100 hover:border-stone-200 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white rounded-xl shadow-sm">
                    <Mail className="w-5 h-5 text-stone-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-stone-900 capitalize">{s.frequency} {s.type} Report</p>
                    <p className="text-xs text-stone-500 truncate max-w-xs">{s.recipients}</p>
                  </div>
                </div>
                <button 
                  onClick={() => handleDelete(s.id)}
                  className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
