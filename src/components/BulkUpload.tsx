import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { db, auth } from '../firebase';
import { collection, addDoc, updateDoc, doc, writeBatch } from 'firebase/firestore';
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
    if (!dateStr || dateStr === 'N/A' || dateStr === '-' || dateStr === 'null') return null;
    const trimmed = String(dateStr).trim();
    if (!trimmed) return null;

    // Try common formats with date-fns
    const formats = [
      'dd-MM-yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 
      'd/M/yyyy', 'd-M-yyyy', 'dd-MMM-yyyy', 'dd-MMM-yy',
      'd/M/yy', 'M/d/yy', 'dd.MM.yyyy', 'MMM d, yyyy', 'MMMM d, yyyy',
      'dd-MM-yy', 'MM-dd-yyyy', 'yyyy/MM/dd', 'dd.MM.yy', 'd.M.yy', 'd.M.yyyy',
      'dd/MMM/yyyy', 'dd/MMM/yy', 'dd-MMM-yyyy', 'MMM-yy', 'MMM-yyyy',
      'dd.MMM.yyyy', 'dd.MMM.yy', 'd.MMM.yy', 'd.MMM.yyyy'
    ];
    
    for (const f of formats) {
      try {
        const parsed = parse(trimmed, f, new Date());
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
          return parsed.toISOString();
        }
      } catch (e) {
        continue;
      }
    }

    // Try parsing as number (Excel serial date)
    const num = Number(trimmed);
    if (!isNaN(num) && num > 30000 && num < 60000) {
      // Excel dates start from Dec 30, 1899
      const excelDate = new Date((num - 25569) * 86400 * 1000);
      if (!isNaN(excelDate.getTime())) {
        return excelDate.toISOString();
      }
    }

    // Fallback to native Date for ISO or other standard strings
    const nativeDate = new Date(trimmed);
    if (!isNaN(nativeDate.getTime())) {
      return nativeDate.toISOString();
    }

    return null;
  };

  const getCellValue = (row: any, aliases: string[]) => {
    const keys = Object.keys(row);
    // First try exact match (normalized)
    for (const alias of aliases) {
      const normalizedAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
      const key = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedAlias);
      if (key && row[key] !== undefined && row[key] !== null && row[key] !== '') {
        return row[key];
      }
    }
    // Then try partial match (if the header contains the alias)
    for (const alias of aliases) {
      const normalizedAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalizedAlias.length < 3) continue; // Skip very short aliases for partial matching
      const key = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(normalizedAlias));
      if (key && row[key] !== undefined && row[key] !== null && row[key] !== '') {
        return row[key];
      }
    }
    return null;
  };

  const handleFirestoreError = (error: any, operationType: string, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setResults(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().replace(/\s+/g, ' '), // Normalize spaces in headers
      complete: async (results) => {
        let successCount = 0;
        let updatedCount = 0;
        let failedCount = 0;
        const errors: string[] = [];

        // Create lookup maps for O(1) performance
        const hospitalByAppNo = new Map(existingHospitals.filter(h => h.applicationNo).map(h => [h.applicationNo, h]));
        const hospitalByName = new Map(existingHospitals.map(h => [h.name.toLowerCase().trim(), h]));
        const userByName = new Map(users.map(u => [u.name.toLowerCase().trim(), u]));

        // Process in batches of 100 for better performance and to stay within limits
        const BATCH_SIZE = 100;
        const rows = results.data as any[];
        
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const chunk = rows.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(db);
          const hospitalsRef = collection(db, 'hospitals');
          const interactionsRef = collection(db, 'interactions');

          for (const row of chunk) {
            try {
              const hospitalName = getCellValue(row, ['Hospital Name', 'name', 'Hospital', 'Facility Name', 'Org Name', 'Name of Hospital', 'HospitalName']);
              const appNo = getCellValue(row, ['Application No', 'applicationNo', 'App No', 'Application Number', 'ID', 'App. No.', 'Application No.', 'Ref No']);

              if (!hospitalName && !appNo) {
                throw new Error('Missing Hospital Name or Application Number');
              }

              // Find existing hospital primarily by Application Number
              let existing = null;
              if (appNo) {
                existing = hospitalByAppNo.get(String(appNo).trim());
              }
              
              // Only fallback to name if application number is NOT provided in the row
              if (!existing && !appNo && hospitalName) {
                existing = hospitalByName.get(String(hospitalName).toLowerCase().trim());
              }

              // Map Team Member Name to UID
              const teamMemberName = getCellValue(row, ['Team Member', 'Assigned To', 'assignedTo', 'Team Member Name', 'Owner', 'User', 'Assigned Member']);
              let assignedToUid = existing?.assignedTo || '';
              if (teamMemberName) {
                const matchedUser = userByName.get(String(teamMemberName).toLowerCase().trim());
                if (matchedUser) {
                  assignedToUid = matchedUser.uid;
                }
              }

              // Robust Date Extraction
              const rawExpiryDate = getCellValue(row, [
                'Cert Expiry Date', 
                'Expiry Date', 
                'expiryDate', 
                'Expiry', 
                'Valid Until', 
                'End Date', 
                'Certificate Expiry', 
                'Validity', 
                'Valid Upto', 
                'Valid To', 
                'Expiry Date (DD-MM-YYYY)',
                'Expiry Date (DD/MM/YYYY)',
                'Date of Expiry',
                'ExpiryDate',
                'Cert. Expiry Date',
                'Cert. Expiry',
                'Valid From',
                'Valid Thru',
                'Validity Date',
                'Cert Expiry Date (Supports formats like DD-MM-YYYY, YYYY-MM-DD, etc.)'
              ]);
              let parsedExpiry = parseDate(rawExpiryDate);
              
              if (rawExpiryDate && !parsedExpiry && !['N/A', '-', 'null'].includes(String(rawExpiryDate).toLowerCase())) {
                throw new Error(`Could not parse Expiry Date: "${rawExpiryDate}"`);
              }

              if (!parsedExpiry && !existing?.expiryDate) {
                throw new Error(`Missing Expiry Date for "${hospitalName || appNo}"`);
              }

              const hospitalData: any = {
                name: (hospitalName || existing?.name || appNo).trim(),
                applicationNo: (appNo || existing?.applicationNo || '').toString().trim(),
                state: getCellValue(row, ['State', 'Province', 'Region', 'State Name']) || existing?.state || '',
                district: getCellValue(row, ['District', 'City', 'County', 'District Name']) || existing?.district || '',
                pincode: getCellValue(row, ['Pincode', 'Zip', 'Zipcode', 'Postal Code', 'Pin Code', 'Pin']) || existing?.pincode || '',
                beds: parseInt(getCellValue(row, ['Bed Strength', 'beds', 'Beds', 'Capacity', 'No of Beds', 'Bed Count']) || existing?.beds?.toString() || '0'),
                expiryDate: parsedExpiry || existing?.expiryDate,
                contactPerson: getCellValue(row, ['Contact Person', 'contactPerson', 'Contact', 'SPOC', 'Admin Name', 'Contact Name', 'Person Name']) || existing?.contactPerson || '',
                contactNumber: getCellValue(row, ['Contact Number', 'contactNumber', 'Phone', 'Mobile', 'SPOC Phone', 'SPOC Number', 'Contact No', 'Phone Number', 'Mobile Number']) || existing?.contactNumber || '',
                alternateNumber: getCellValue(row, ['Alternate Number', 'alternateNumber', 'Alt Number', 'Secondary Phone', 'Alt Phone', 'Alternate Phone']) || existing?.alternateNumber || '',
                designation: getCellValue(row, ['Designation', 'designation', 'Role', 'Position', 'SPOC Designation']) || existing?.designation || '',
                reapplied: String(getCellValue(row, ['Reapplied Y/N', 'reapplied', 'Reapplied', 'Is Reapplied']) || '').toLowerCase().startsWith('y') || getCellValue(row, ['reapplied']) === true || (existing?.reapplied ?? false),
                reappliedProgram: getCellValue(row, ['If reapplied yes, Program under which reapplied', 'reappliedProgram', 'Program', 'New Program', 'Reapplied Program']) || existing?.reappliedProgram || '',
                renewalApplicationNo: getCellValue(row, ['Renewal Application No', 'renewalApplicationNo', 'Renewal App No', 'Renewal ID']) || existing?.renewalApplicationNo || '',
                renewalApplicationDate: parseDate(getCellValue(row, ['Renewal App Date', 'renewalApplicationDate', 'Renewal Date', 'Renewal Application Date'])) || existing?.renewalApplicationDate || '',
                status: getCellValue(row, ['Status', 'Active', 'Current Status']) || existing?.status || 'Active',
                currentProgram: getCellValue(row, ['Program', 'currentProgram', 'Accreditation', 'Current Program']) || existing?.currentProgram || '',
                assignedTo: assignedToUid
              };

              let hospitalId = '';
              if (existing) {
                const hRef = doc(db, 'hospitals', existing.id);
                batch.update(hRef, hospitalData);
                hospitalId = existing.id;
                updatedCount++;
              } else {
                const hRef = doc(hospitalsRef);
                batch.set(hRef, hospitalData);
                hospitalId = hRef.id;
                successCount++;
              }

              // Handle Interaction Logging from CSV
              const callStatus = getCellValue(row, ['Call Status', 'Call Connected', 'Disposition', 'Call Result']);
              if (callStatus) {
                const isConnected = String(callStatus).toLowerCase().includes('connected') && !String(callStatus).toLowerCase().includes('not');
                const result = isConnected ? 'Connected' : 'Not Connected';
                
                const interactionData: any = {
                  hospitalId,
                  userId: auth.currentUser?.uid || assignedToUid || 'system',
                  timestamp: new Date().toISOString(),
                  type: 'Call',
                  result
                };

                const reason = getCellValue(row, ['Remarks', 'Reason', 'Reason Classification', 'Comments', 'Notes']);
                if (reason) {
                  interactionData.reason = reason;
                }

                const iRef = doc(interactionsRef);
                batch.set(iRef, interactionData);
              }
            } catch (err: any) {
              failedCount++;
              errors.push(`Row ${i + chunk.indexOf(row) + 1}: ${err.message}`);
            }
          }

          // Commit the batch
          try {
            await batch.commit();
          } catch (batchErr: any) {
            console.error('Batch commit failed:', batchErr);
            try {
              handleFirestoreError(batchErr, 'write', 'hospitals/batch');
            } catch (jsonErr: any) {
              errors.push(`Batch starting at row ${i + 1} failed: ${jsonErr.message}`);
            }
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
