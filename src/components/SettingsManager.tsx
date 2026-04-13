import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Key, Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export function SettingsManager() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    const fetchKey = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'resend_api_key'));
        if (docSnap.exists()) {
          setApiKey(docSnap.data().value);
        }
      } catch (err) {
        console.error('Error fetching settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchKey();
  }, []);

  const handleSave = async () => {
    if (!apiKey) return;
    setSaving(true);
    setStatus('idle');
    try {
      await setDoc(doc(db, 'settings', 'resend_api_key'), {
        key: 'RESEND_API_KEY',
        value: apiKey,
        updatedAt: new Date().toISOString()
      });
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-stone-100 bg-stone-50/50">
        <h3 className="text-lg font-serif font-bold text-stone-900">System Configuration</h3>
        <p className="text-xs text-stone-500">Manage API keys and global application settings.</p>
      </div>
      
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1 flex items-center gap-1">
            <Key className="w-3 h-3" /> Resend API Key
          </label>
          <div className="flex gap-2">
            <input 
              type="password"
              placeholder="re_123456789..."
              className="flex-1 p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm font-mono"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
            <button 
              onClick={handleSave}
              disabled={saving || !apiKey}
              className="px-4 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : status === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              ) : status === 'error' ? (
                <AlertCircle className="w-4 h-4 text-red-400" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? 'Saving...' : 'Save Key'}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-stone-400 italic">
            * This key is stored securely in Firestore and used by the server for automated reports.
          </p>
        </div>
      </div>
    </div>
  );
}
