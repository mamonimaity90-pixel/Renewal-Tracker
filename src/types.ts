export type UserRole = 'admin' | 'team';

export interface User {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface Hospital {
  id: string;
  name: string;
  state: string;
  district: string;
  pincode: string;
  beds: number;
  applicationNo: string;
  expiryDate: string; // ISO string
  reapplied: boolean;
  reappliedProgram?: string;
  renewalApplicationNo?: string;
  renewalApplicationDate?: string; // ISO string
  assignedTo?: string; // User UID
  currentProgram?: string;
  status: 'Active' | 'Expired' | 'Pending Renewal';
  contactPerson?: string;
  contactNumber?: string;
  alternateNumber?: string;
  designation?: string;
}

export interface Interaction {
  id: string;
  hospitalId: string;
  userId: string;
  timestamp: string;
  type: 'Call' | 'Email' | 'Meeting';
  result: 'Connected' | 'Not Connected';
  reason?: 
    | 'Applied elsewhere'
    | 'Concerned person not available'
    | 'Does not see benefit'
    | 'Hospital shut down'
    | 'Need assistance'
    | 'Not interested'
    | 'Not Prepared'
    | 'SPOC change'
    | 'Will apply soon'
    | 'Yet to decide'
    | 'Certification to Accreditation'
    | 'Already applied for renewal'
    | 'Others';
  notes?: string;
  remarks?: string;
  followUpDate?: string;
  // Reapplication verification fields
  reapplied?: boolean;
  reapplicationProgram?: string;
  reapplicationNumber?: string;
  verificationStatus?: 'Pending' | 'Verified' | 'Rejected';
  verifiedBy?: string;
  verifiedAt?: string;
  assignedToName?: string; // Captured at time of logging
}

export interface Application {
  id: string;
  hospitalId: string;
  applicationNumber: string;
  applicationDate: string;
  programType: string;
  status: 'Applied' | 'Under Review' | 'Approved' | 'Rejected';
}
