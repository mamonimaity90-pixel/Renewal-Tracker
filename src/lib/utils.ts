import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalizes a date value that might be an ISO string or a Firestore Timestamp object.
 * Returns an ISO string for consistent usage in the application.
 */
export function normalizeDate(dateVal: any): string {
  if (!dateVal) return '';
  
  // Handle Firestore Timestamp
  if (typeof dateVal === 'object' && dateVal.toDate && typeof dateVal.toDate === 'function') {
    return dateVal.toDate().toISOString();
  }
  
  // Handle already ISO string or other date strings
  if (typeof dateVal === 'string') return dateVal;
  
  // Handle Date object
  if (dateVal instanceof Date) return dateVal.toISOString();
  
  return String(dateVal);
}
