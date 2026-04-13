import React, { useState } from 'react';
import { User } from '../types';
import { Shield, User as UserIcon, Mail } from 'lucide-react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface TeamManagementProps {
  users: User[];
}

export function TeamManagement({ users }: TeamManagementProps) {
  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'team' : 'admin';
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
    } catch (error) {
      console.error('Role update failed:', error);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-serif font-bold text-stone-900">Team Management</h2>
        <p className="text-stone-500">Manage access and roles for your team members.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((user) => (
          <div key={user.uid} className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-600 font-bold text-lg">
                {user.name[0]}
              </div>
              <div>
                <h4 className="font-bold text-stone-900">{user.name}</h4>
                <div className="flex items-center gap-1 text-xs text-stone-400">
                  <Mail className="w-3 h-3" />
                  {user.email}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-stone-50">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-stone-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  {user.role}
                </span>
              </div>
              <button
                onClick={() => toggleRole(user.uid, user.role)}
                className="text-xs font-medium text-stone-900 hover:underline"
              >
                Change Role
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
