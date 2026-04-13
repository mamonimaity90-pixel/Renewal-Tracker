import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { db, auth } from '../firebase';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Upload, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { format, parse } from 'date-fns';
import { Hospital, User } from '../types';

interface BulkUploadProps {
  onClose: () => void;
  users: User[];
  existingHospitals: Hospital[];
}

export function BulkUpload({ onClose, users, existingHospitals }: BulkUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{ success: number; updated: number; failed: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const parseDate = (dateStr: any) => {
    if (!dateStr || dateStr === 'N/A' || dateStr === '-' || typeof dateStr !== 'string') return null;
    const trimmed = dateStr.trim();
    if (!trimmed) return null;

    // Try common formats with date-fns
    const formats = [
      'dd-MM-yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 
      'd/M/yyyy', 'd-M-yyyy', 'dd-MMM-yyyy', 'dd-MMM-yy',
      'd/M/yy', 'M/d/yy', 'dd.MM.yyyy', 'MMM d, yyyy', 'MMMM d, yyyy'
    ];
    
    for (const f of formats) {
      try {
        const parsed = parse(trimmed, f, new Date());
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      } catch (e) {
        continue;
      }
    }

    // Fallback to native Date for ISO or other standard strings
    const nativeDate = new Date(trimmed);
    if (!isNaN(nativeDate.getTime())) {
      return nativeDate.toISOString();
    }

    return null;
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setResults(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(), // Trim headers to handle extra spaces
      complete: async (results) => {
        let successCount = 0;
        let updatedCount = 0;
        let failedCount = 0;
        const errors: string[] = [];

        for (const row of results.data as any[]) {
          try {
            const hospitalName = row['Hospital Name'] || row['name'] || row['Hospital'];
            const appNo = row['Application No'] || row['applicationNo'] || row['App No'];

            if (!hospitalName && !appNo) {
              throw new Error('Missing Hospital Name or Application Number');
            }

            // Find existing hospital primarily by Application Number, fallback to Name
            let existing = null;
            if (appNo) {
              existing = existingHospitals.find(h => h.applicationNo === appNo.trim());
            }
            
            if (!existing && hospitalName) {
              existing = existingHospitals.find(h => h.name.toLowerCase() === hospitalName.trim().toLowerCase());
            }

            // Map Team Member Name to UID
            const teamMemberName = row['Team Member'] || row['Assigned To'] || row['assignedTo'] || row['Team Member Name'];
            let assignedToUid = existing?.assignedTo || '';
            if (teamMemberName) {
              const matchedUser = users.find(u => u.name.toLowerCase() === teamMemberName.trim().toLowerCase());
              if (matchedUser) {
                assignedToUid = matchedUser.uid;
              }
            }

            // Robust Date Extraction
            const rawExpiryDate = row['Cert Expiry Date'] || row['Expiry Date'] || row['expiryDate'] || row['Expiry'];
            let parsedExpiry = parseDate(rawExpiryDate);
            
            // If a date was provided in the CSV but we couldn't parse it, that's an error
            if (rawExpiryDate && !parsedExpiry && rawExpiryDate !== 'N/A' && rawExpiryDate !== '-') {
              throw new Error(`Could not parse Expiry Date: "${rawExpiryDate}". Please use DD-MM-YYYY or YYYY-MM-DD.`);
            }

            // If no date in CSV and no existing date, then error
            if (!parsedExpiry && !existing?.expiryDate) {
              throw new Error(`Missing Expiry Date for "${hospitalName}"`);
            }

            const hospitalData: any = {
              name: hospitalName.trim(),
              applicationNo: row['Application No'] || row['applicationNo'] || row['App No'] || existing?.applicationNo || '',
              state: row['State'] || row['state'] || existing?.state || '',
              district: row['District'] || row['district'] || existing?.district || '',
              pincode: row['Pincode'] || row['pincode'] || existing?.pincode || '',
              beds: parseInt(row['Bed Strength'] || row['beds'] || row['Beds'] || existing?.beds?.toString() || '0'),
              expiryDate: parsedExpiry || existing?.expiryDate,
              contactPerson: row['Contact Person'] || row['contactPerson'] || row['Contact'] || existing?.contactPerson || '',
              contactNumber: row['Contact Number'] || row['contactNumber'] || row['Phone'] || row['Mobile'] || existing?.contactNumber || '',
              reapplied: (row['Reapplied Y/N'] || row['reapplied'] || row['Reapplied'] || '').toString().toLowerCase().startsWith('y') || row['reapplied'] === true || (existing?.reapplied ?? false),
              reappliedProgram: row['If reapplied yes, Program under which reapplied'] || row['reappliedProgram'] || row['Program'] || existing?.reappliedProgram || '',
              renewalApplicationNo: row['Renewal Application No'] || row['renewalApplicationNo'] || row['Renewal App No'] || existing?.renewalApplicationNo || '',
              renewalApplicationDate: parseDate(row['Renewal App Date'] || row['renewalApplicationDate'] || row['Renewal Date']) || existing?.renewalApplicationDate || '',
              status: row['Status'] || existing?.status || 'Active',
              currentProgram: row['Program'] || row['currentProgram'] || existing?.currentProgram || '',
              assignedTo: assignedToUid
            };

            let hospitalId = '';
            if (existing) {
              await updateDoc(doc(db, 'hospitals', existing.id), hospitalData);
              hospitalId = existing.id;
              updatedCount++;
            } else {
              const docRef = await addDoc(collection(db, 'hospitals'), hospitalData);
              hospitalId = docRef.id;
              successCount++;
            }

            // Handle Interaction Logging from CSV
            const callStatus = row['Call Status'] || row['Call Connected'] || row['Disposition'];
            if (callStatus) {
              const isConnected = callStatus.toLowerCase().includes('connected') && !callStatus.toLowerCase().includes('not');
              const result = isConnected ? 'Connected' : 'Not Connected';
              
              const interactionData: any = {
                hospitalId,
                userId: auth.currentUser?.uid || assignedToUid || 'system',
                timestamp: new Date().toISOString(),
                type: 'Call',
                result
              };

              if (isConnected) {
                const reason = row['Remarks'] || row['Reason'] || row['Reason Classification'];
                if (reason) {
                  interactionData.reason = reason;
                }
              }

              await addDoc(collection(db, 'interactions'), interactionData);
            }
          } catch (err: any) {
            failedCount++;
            errors.push(`Row ${successCount + updatedCount + failedCount}: ${err.message}`);
          }
        }

        setResults({ success: successCount, updated: updatedCount, failed: failedCount, errors });
        setUploading(false);
      },
      error: (error) => {
        setResults({ success: 0, updated: 0, failed: 1, errors: [error.message] });
        setUploading(false);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/20 backdrop-blur-sm">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-serif font-bold text-stone-900">Bulk Upload Hospitals</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-stone-400" />
          </button>
        </div>

        {!results ? (
          <div className="space-y-6">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-stone-200 rounded-3xl p-12 text-center hover:border-stone-400 transition-colors cursor-pointer bg-stone-50"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".csv" 
                className="hidden" 
              />
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-white rounded-2xl shadow-sm">
                  <Upload className="w-8 h-8 text-stone-400" />
                </div>
                <div>
                  <p className="text-stone-900 font-medium">
                    {file ? file.name : 'Click to select CSV file'}
                  </p>
                  <p className="text-stone-400 text-sm mt-1">
                    Format: Hospital Name, Team Member, Expiry Date, Call Status, Remarks...
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={onClose}
                className="flex-1 py-3 px-6 rounded-xl text-stone-500 font-medium hover:bg-stone-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleUpload}
                disabled={!file || uploading}
                className="flex-1 py-3 px-6 rounded-xl bg-stone-900 text-white font-medium hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    Start Upload
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4 p-6 bg-stone-50 rounded-3xl">
              <div className="text-center">
                <p className="text-2xl font-serif font-bold text-emerald-600">{results.success}</p>
                <p className="text-[10px] text-stone-400 uppercase font-bold tracking-wider">New</p>
              </div>
              <div className="text-center border-x border-stone-200">
                <p className="text-2xl font-serif font-bold text-blue-600">{results.updated}</p>
                <p className="text-[10px] text-stone-400 uppercase font-bold tracking-wider">Updated</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-serif font-bold text-red-500">{results.failed}</p>
                <p className="text-[10px] text-stone-400 uppercase font-bold tracking-wider">Failed</p>
              </div>
            </div>

            {results.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-2 p-4 bg-red-50 rounded-2xl border border-red-100">
                {results.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-600">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}

            <button 
              onClick={onClose}
              className="w-full py-3 px-6 rounded-xl bg-stone-900 text-white font-medium hover:bg-stone-800 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
