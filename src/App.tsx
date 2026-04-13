import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { Hospital, User, Interaction, Application } from './types';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { HospitalList } from './components/HospitalList';
import { TeamManagement } from './components/TeamManagement';
import { LogInteraction } from './components/LogInteraction';
import { LogApplication } from './components/LogApplication';
import { LogIn, LogOut, Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'hospitals' | 'team' | 'logs'>('dashboard');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userPath = `users/${firebaseUser.uid}`;
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setUser({ uid: firebaseUser.uid, ...userDoc.data() } as User);
          } else {
            const newUser: User = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || 'New User',
              email: firebaseUser.email || '',
              role: firebaseUser.email === 'mamoni.maity90@gmail.com' ? 'admin' : 'team',
            };
            try {
              await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
              setUser(newUser);
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, userPath);
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, userPath);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setHospitals([]);
      setInteractions([]);
      setApplications([]);
      setUsers([]);
      return;
    }

    const unsubHospitals = onSnapshot(collection(db, 'hospitals'), (snapshot) => {
      setHospitals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Hospital)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'hospitals'));

    const unsubInteractions = onSnapshot(query(collection(db, 'interactions'), orderBy('timestamp', 'desc')), (snapshot) => {
      setInteractions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Interaction)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'interactions'));

    const unsubApplications = onSnapshot(collection(db, 'applications'), (snapshot) => {
      setApplications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Application)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'applications'));

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'users'));

    return () => {
      unsubHospitals();
      unsubInteractions();
      unsubApplications();
      unsubUsers();
    };
  }, [user]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login failed:', error);
      if (error.code === 'auth/popup-blocked') {
        alert('The login popup was blocked by your browser. Please allow popups for this site and try again.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignore
      } else if (error.message.includes('Pending promise')) {
        alert('A login request is already pending. Please wait or refresh the page.');
      } else {
        alert(`Login failed: ${error.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-sm border border-stone-200 text-center">
          <h1 className="text-3xl font-serif font-bold text-stone-900 mb-2">NABH Entry Level</h1>
          <p className="text-stone-500 mb-8 italic">Drop out and Retention Tracking System</p>
          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-xl hover:bg-stone-800 transition-colors font-medium disabled:opacity-50"
          >
            {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
            {isLoggingIn ? 'Connecting...' : 'Sign in with Google'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Layout 
      user={user} 
      onLogout={handleLogout} 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
    >
      {activeTab === 'dashboard' && (
        <Dashboard 
          hospitals={hospitals} 
          interactions={interactions} 
          applications={applications} 
          users={users}
        />
      )}
      {activeTab === 'hospitals' && (
        <HospitalList 
          hospitals={hospitals} 
          users={users} 
          interactions={interactions}
          isAdmin={user.role === 'admin'} 
        />
      )}
      {activeTab === 'team' && user.role === 'admin' && (
        <TeamManagement users={users} />
      )}
      {activeTab === 'logs' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <LogInteraction hospitals={hospitals} user={user} />
          <LogApplication hospitals={hospitals} />
        </div>
      )}
    </Layout>
  );
}
