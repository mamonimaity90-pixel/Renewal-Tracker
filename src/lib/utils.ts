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

/**
 * Normalizes a state name to handle regional variations, spelling differences, 
 * punctuation, and casing.
 */
export function normalizeStateName(state: string): string {
  if (!state) return '';
  let s = state.toLowerCase().trim();
  // Replace & with and
  s = s.replace(/&/g, 'and');
  // Replace punctuation with spaces
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  // Replace multiple spaces with a single space
  s = s.replace(/\s+/g, ' ');
  s = s.trim();

  // Handle Andaman & Nicobar / Andaman and Nicobar Islands
  if (s.includes('andaman') || s.includes('nicobar')) {
    return 'andaman and nicobar';
  }

  // Handle Dadra and Nagar Haveli and Daman and Diu / Daman & Diu
  if (s.includes('daman') || s.includes('diu') || s.includes('dadra') || s.includes('nagar haveli')) {
    return 'dadra and nagar haveli and daman and diu';
  }

  // Common suffix removals
  if (s.endsWith(' islands')) s = s.slice(0, -8);
  if (s.endsWith(' island')) s = s.slice(0, -7);
  if (s.endsWith(' state')) s = s.slice(0, -6);
  if (s.endsWith(' ut')) s = s.slice(0, -3);

  return s.trim();
}

/**
 * Checks if two state names are compatible/equivalent after normalization.
 */
export function areStatesCompatible(stateA: string, stateB: string): boolean {
  return normalizeStateName(stateA) === normalizeStateName(stateB);
}

