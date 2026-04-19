import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Key, Save, Loader2, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { cn } from '../lib/utils';

export function SettingsManager() {
  const [apiKey, setApiKey] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [reportSubject, setReportSubject] = useState('');
  const [reportTemplate, setReportTemplate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [testStatus, setTestStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [keySnap, senderSnap, subjectSnap, templateSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'resend_api_key')),
          getDoc(doc(db, 'settings', 'resend_sender_email')),
          getDoc(doc(db, 'settings', 'report_subject')),
          getDoc(doc(db, 'settings', 'report_template'))
        ]);
        
        if (keySnap.exists()) setApiKey(keySnap.data().value);
        if (senderSnap.exists()) setSenderEmail(senderSnap.data().value);
        if (subjectSnap.exists()) setReportSubject(subjectSnap.data().value);
        if (templateSnap.exists()) setReportTemplate(subjectSnap.data().value);
      } catch (err) {
        console.error('Error fetching settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!apiKey) return;
    setSaving(true);
    setStatus('idle');
    try {
      await Promise.all([
        setDoc(doc(db, 'settings', 'resend_api_key'), {
          key: 'RESEND_API_KEY',
          value: apiKey,
          updatedAt: new Date().toISOString()
        }),
        setDoc(doc(db, 'settings', 'resend_sender_email'), {
          key: 'SENDER_EMAIL',
          value: senderEmail,
          updatedAt: new Date().toISOString()
        }),
        setDoc(doc(db, 'settings', 'report_subject'), {
          key: 'REPORT_SUBJECT',
          value: reportSubject,
          updatedAt: new Date().toISOString()
        }),
        setDoc(doc(db, 'settings', 'report_template'), {
          key: 'REPORT_TEMPLATE',
          value: reportTemplate,
          updatedAt: new Date().toISOString()
        })
      ]);
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setTesting(true);
    setTestStatus(null);
    try {
      // Get the email of the logged in user to send the test to
      const userEmail = auth.currentUser?.email || '';
      
      const response = await fetch('/api/test-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: userEmail }),
      });
      const data = await response.json();
      if (response.ok) {
        setTestStatus({ type: 'success', message: 'Test email sent successfully!' });
      } else {
        setTestStatus({ type: 'error', message: data.error || 'Failed to send test email.' });
      }
    } catch (err) {
      setTestStatus({ type: 'error', message: 'Network error occurred.' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-stone-100 bg-stone-50/50">
        <h3 className="text-lg font-serif font-bold text-stone-900">System Configuration</h3>
        <p className="text-xs text-stone-500">Manage API keys and global application settings.</p>
      </div>
      
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1 flex items-center gap-1">
              <Key className="w-3 h-3" /> Resend API Key
            </label>
            <input 
              type="password"
              placeholder="re_123456789..."
              className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm font-mono mb-2"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1 flex items-center gap-1">
              <Send className="w-3 h-3" /> Sender Email Address
            </label>
            <input 
              type="email"
              placeholder="reports@yourdomain.com"
              className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm mb-1"
              value={senderEmail}
              onChange={e => setSenderEmail(e.target.value)}
            />
            <p className="text-[10px] text-stone-400 italic">
              * Leave blank to use Resend's default onboarding address.
            </p>
          </div>

          <div className="pt-4 border-t border-stone-100 space-y-4">
            <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wider">Email Template Customization</h4>
            
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Default Report Subject</label>
              <input 
                type="text"
                placeholder="Automated Compliance Report"
                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm"
                value={reportSubject}
                onChange={e => setReportSubject(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1">Email Body Template (HTML)</label>
              <textarea 
                rows={6}
                placeholder="<h1>Report</h1><p>Total: {{total}}</p>..."
                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm font-mono leading-relaxed"
                value={reportTemplate}
                onChange={e => setReportTemplate(e.target.value)}
              />
              <div className="mt-2 p-3 bg-stone-50 rounded-xl border border-stone-100">
                <p className="text-[10px] font-bold text-stone-400 uppercase mb-2">Available Variables</p>
                <div className="flex flex-wrap gap-2">
                  {['{{total}}', '{{expired}}', '{{pending}}', '{{renewed}}', '{{frequency}}'].map(v => (
                    <code key={v} className="bg-white px-1.5 py-0.5 rounded border border-stone-200 text-[10px] font-mono text-stone-600">{v}</code>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button 
            onClick={handleSave}
            disabled={saving || !apiKey}
            className="w-full px-4 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
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
            {saving ? 'Saving Settings...' : 'Save Configuration'}
          </button>
        </div>

        <div className="pt-4 border-t border-stone-100">
          <button
            onClick={handleTestEmail}
            disabled={testing || !apiKey}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-stone-100 text-stone-900 rounded-xl text-sm font-bold hover:bg-stone-200 transition-all disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {testing ? 'Sending Test...' : 'Send Test Email'}
          </button>
          {testStatus && (
            <div className={cn(
              "mt-3 p-3 rounded-xl flex items-center gap-2 text-xs",
              testStatus.type === 'success' ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            )}>
              {testStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {testStatus.message}
            </div>
          )}
          {!apiKey && (
            <p className="mt-3 p-3 bg-amber-50 text-amber-700 rounded-xl text-[10px] leading-relaxed">
              <strong>Database Notice:</strong> We recently switched to a new database instance to resolve quota errors. If you had saved an API key previously, you will need to enter it once more here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
