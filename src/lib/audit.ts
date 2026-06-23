import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { User } from '../types';

export interface AuditParams {
  itemId: string;
  itemName: string;
  collectionName: string;
  action: 'create' | 'update' | 'delete' | 'bulk_assign' | 'bulk_upload' | 'verify';
  currentUser: User | null;
  oldData?: any;
  newData?: any;
}

export async function createAuditLog({
  itemId,
  itemName,
  collectionName,
  action,
  currentUser,
  oldData,
  newData
}: AuditParams) {
  if (!currentUser) {
    console.warn('Skipping audit logging: No logged in user.');
    return;
  }

  const changes: { field: string; oldValue: any; newValue: any }[] = [];

  if (action === 'update' && oldData && newData) {
    // Compare and find actual field changes
    const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    for (const key of keys) {
      // Skip fields like id, etc. or private internals
      if (key === 'id' || key === 'hospitalId') continue;

      const oldVal = oldData[key];
      const newVal = newData[key];

      // Skip function/object references if any accidentally passed
      if (typeof oldVal === 'function' || typeof newVal === 'function') continue;

      // Deep/basic compare
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({
          field: key,
          oldValue: oldVal === undefined ? null : oldVal,
          newValue: newVal === undefined ? null : newVal
        });
      }
    }
  } else if (action === 'create' && newData) {
    // For creation, record all initial values of interest
    for (const key of Object.keys(newData)) {
      if (key === 'id') continue;
      changes.push({
        field: key,
        oldValue: null,
        newValue: newData[key]
      });
    }
  } else if (action === 'delete' && oldData) {
    // For delete, record the old values
    for (const key of Object.keys(oldData)) {
      changes.push({
        field: key,
        oldValue: oldData[key],
        newValue: null
      });
    }
  } else if (action === 'bulk_assign') {
    changes.push({
      field: 'assignedTo',
      oldValue: oldData?.assignedTo || 'Unassigned',
      newValue: newData?.assignedTo || 'Unassigned'
    });
  } else if (action === 'bulk_upload') {
    changes.push({
      field: 'status',
      oldValue: oldData?.status || 'Unknown',
      newValue: newData?.status || 'Active/Updated'
    });
  } else if (action === 'verify') {
    changes.push({
      field: 'verificationStatus',
      oldValue: oldData?.verificationStatus || 'Pending',
      newValue: newData?.verificationStatus
    });
    if (newData?.verificationRemarks) {
      changes.push({
        field: 'verificationRemarks',
        oldValue: null,
        newValue: newData?.verificationRemarks
      });
    }
  }

  // If action is update and nothing changed, skip saving
  if (action === 'update' && changes.length === 0) {
    return;
  }

  try {
    const auditData = {
      itemId,
      itemName,
      collection: collectionName,
      userId: currentUser.uid,
      userName: currentUser.name || 'System User',
      userEmail: currentUser.email || 'unknown@system.local',
      action,
      timestamp: new Date().toISOString(),
      changes
    };

    await addDoc(collection(db, 'audit_logs'), auditData);
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
