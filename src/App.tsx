import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy, limit } from 'firebase/firestore';
import { Hospital, User, Interaction, Application, Zone } from './types';
import { normalizeDate } from './lib/utils';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { HospitalList } from './components/HospitalList';
import { TeamManagement } from './components/TeamManagement';
import { PerformanceDashboard } from './components/PerformanceDashboard';
import { ActivityLog } from './components/ActivityLog';
import { VerificationQueue } from './components/VerificationQueue';
import { AuditLogList } from './components/AuditLogList';
import { ReportScheduler } from './components/ReportScheduler';
import { SettingsManager } from './components/SettingsManager';
import { LogIn, LogOut, Loader2, Mail, Lock, User as UserIcon, AlertCircle, Clock, Ban, AlertTriangle, RotateCw } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'performance' | 'hospitals' | 'team' | 'verification' | 'logs' | 'settings'>('dashboard');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'google'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState('');
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;
    
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (firebaseUser) {
        const userPath = `users/${firebaseUser.uid}`;
        unsubUserDoc = onSnapshot(doc(db, 'users', firebaseUser.uid), async (userDoc) => {
          if (userDoc.exists()) {
            const data = userDoc.data();
            // Data migration: Ensure status and role exist for legacy users
            if (!data.status || !data.role) {
              const updatedUser = {
                ...data,
                role: data.role || (firebaseUser.email === 'mamoni.maity90@gmail.com' ? 'admin' : 'team'),
                status: data.status || (firebaseUser.email === 'mamoni.maity90@gmail.com' ? 'approved' : 'pending'),
              };
              try {
                // This might trigger another snapshot, but it's a merge write
                await setDoc(doc(db, 'users', firebaseUser.uid), updatedUser, { merge: true });
                setUser({ uid: firebaseUser.uid, ...updatedUser } as User);
              } catch (migrationError) {
                console.error('Migration failed:', migrationError);
                setUser({ uid: firebaseUser.uid, ...data } as User);
              }
            } else {
              setUser({ uid: firebaseUser.uid, ...data } as User);
            }
          } else {
            const newUser: User = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || 'New User',
              email: firebaseUser.email || '',
              role: firebaseUser.email === 'mamoni.maity90@gmail.com' ? 'admin' : 'team',
              status: firebaseUser.email === 'mamoni.maity90@gmail.com' ? 'approved' : 'pending',
            };
            try {
              await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
              setUser(newUser);
            } catch (err) {
              handleFirestoreError(err, OperationType.WRITE, userPath);
            }
          }
          setLoading(false);
        }, (error: any) => {
          if (error.message?.includes('Quota limit exceeded') || error.code === 'resource-exhausted') {
            setQuotaExceeded(true);
          } else if (error.code !== 'permission-denied') {
            setAuthError(`Welcome back, but we couldn't load your profile: ${error.message}`);
          }
          console.error('Error fetching user data snapshot:', error);
          setLoading(false);
        });
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
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
      setHospitals(snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data,
          expiryDate: normalizeDate(data.expiryDate),
          renewalApplicationDate: normalizeDate(data.renewalApplicationDate)
        } as Hospital;
      }));
    }, (error) => {
      if (error.message?.includes('Quota limit exceeded') || error.code === 'resource-exhausted') {
        setQuotaExceeded(true);
      }
      handleFirestoreError(error, OperationType.GET, 'hospitals');
    });

    // Remove limit and orderBy to ensure all interaction history is available for filtering and verification
    // even if some legacy records are missing the timestamp field (Firestore excludes docs missing order field)
    const unsubInteractions = onSnapshot(collection(db, 'interactions'), (snapshot) => {
      const allInteractions = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data,
          timestamp: normalizeDate(data.timestamp),
          verifiedAt: normalizeDate(data.verifiedAt),
          followUpDate: normalizeDate(data.followUpDate)
        } as Interaction;
      });
      
      // Sort in memory by timestamp descending
      setInteractions(allInteractions.sort((a, b) => {
        const timeA = a.timestamp || '';
        const timeB = b.timestamp || '';
        if (timeA < timeB) return 1;
        if (timeA > timeB) return -1;
        return 0;
      }));
    }, (error) => {
      if (error.message?.includes('Quota limit exceeded') || error.code === 'resource-exhausted') {
        setQuotaExceeded(true);
      }
      handleFirestoreError(error, OperationType.GET, 'interactions');
    });

    const unsubApplications = onSnapshot(collection(db, 'applications'), (snapshot) => {
      setApplications(snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          ...data,
          applicationDate: normalizeDate(data.applicationDate)
        } as Application;
      }));
    }, (error) => {
      if (error.message?.includes('Quota limit exceeded') || error.code === 'resource-exhausted') {
        setQuotaExceeded(true);
      }
      handleFirestoreError(error, OperationType.GET, 'applications');
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));
    }, (error) => {
      if (error.message?.includes('Quota limit exceeded') || error.code === 'resource-exhausted') {
        setQuotaExceeded(true);
      }
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    const unsubZones = onSnapshot(collection(db, 'zones'), (snapshot) => {
      setZones(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Zone)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'zones');
    });

    return () => {
      unsubHospitals();
      unsubInteractions();
      unsubApplications();
      unsubUsers();
      unsubZones();
    };
  }, [user]);

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAuthError('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login failed:', error);
      setAuthError(error.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setAuthError('');
    try {
      if (authMode === 'signup') {
        const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);
        const newUser: User = {
          uid: firebaseUser.uid,
          name: name || email.split('@')[0],
          email: email,
          role: email === 'mamoni.maity90@gmail.com' ? 'admin' : 'team',
          status: email === 'mamoni.maity90@gmail.com' ? 'approved' : 'pending',
        };
        await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
        setUser(newUser);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error('Email auth failed:', error);
      setAuthError(error.message);
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

  if (quotaExceeded) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-100 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-stone-900 mb-4">Daily Limit Reached</h1>
          <p className="text-stone-600 mb-6 leading-relaxed">
            The application has reached its daily limit for data reads. This is a restriction of the free tier and will automatically reset at midnight Pacific Time.
          </p>
          <div className="bg-stone-50 p-4 rounded-xl text-left mb-6">
            <p className="text-xs font-bold text-stone-400 uppercase mb-2">What you can do:</p>
            <ul className="text-sm text-stone-600 space-y-2 list-disc pl-4">
              <li>Wait for the daily reset</li>
              <li>Ask the admin to enable billing for higher limits</li>
              <li>Avoid frequent refreshes once it resets</li>
            </ul>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-stone-900 text-white py-3 px-6 rounded-xl hover:bg-stone-800 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <RotateCw className="w-4 h-4" /> Try Refreshing
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-sm border border-stone-200">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-serif font-bold text-stone-900 mb-2">NABH Entry Level</h1>
            <p className="text-stone-500 italic">Drop out and Retention Tracking System</p>
          </div>

          {authError && (
            <div className="mb-6 p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {authError}
            </div>
          )}

          {authMode === 'google' ? (
            <div className="space-y-4">
              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-xl hover:bg-stone-800 transition-colors font-medium disabled:opacity-50"
              >
                {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                {isLoggingIn ? 'Connecting...' : 'Sign in with Google'}
              </button>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-stone-100"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-stone-400">Or continue with</span></div>
              </div>
              <button
                onClick={() => setAuthMode('login')}
                className="w-full flex items-center justify-center gap-2 bg-white text-stone-900 border border-stone-200 py-3 px-6 rounded-xl hover:bg-stone-50 transition-colors font-medium"
              >
                <Mail className="w-5 h-5" />
                Sign in with Email
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1 ml-1">Full Name</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                    <input
                      type="text"
                      required
                      placeholder="John Doe"
                      className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-stone-200"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1 ml-1">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="email"
                    required
                    placeholder="work@company.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-stone-200"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase mb-1 ml-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-stone-200"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center gap-2 bg-stone-900 text-white py-3 px-6 rounded-xl hover:bg-stone-800 transition-colors font-medium disabled:opacity-50"
              >
                {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                {authMode === 'signup' ? 'Create Account' : 'Sign In'}
              </button>
              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  className="text-xs text-stone-500 hover:text-stone-900 font-medium"
                >
                  {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('google')}
                  className="text-xs text-stone-400 hover:text-stone-600"
                >
                  Back to Google Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (user.status === 'pending') {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-stone-900 mb-4">Approval Pending</h1>
          <p className="text-stone-600 mb-6 leading-relaxed">
            Your registration request has been submitted. An administrator will review your account and grant access shortly.
          </p>
          <div className="bg-stone-50 p-4 rounded-xl text-sm text-stone-500 mb-6">
            We've notified the team. You'll be able to access the dashboard once approved.
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-stone-500 hover:text-stone-900 transition-colors font-medium"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (user.status === 'rejected') {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-stone-200 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Ban className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-serif font-bold text-stone-900 mb-4">Access Denied</h1>
          <p className="text-stone-600 mb-6 leading-relaxed">
            Unfortunately, your access request has been rejected. If you believe this is a mistake, please contact the administrator.
          </p>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-stone-500 hover:text-stone-900 transition-colors font-medium"
          >
            <LogOut className="w-5 h-5" />
            Back to Sign In
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
          setActiveTab={setActiveTab}
          currentUser={user}
        />
      )}
      {activeTab === 'performance' && (
        <PerformanceDashboard 
          hospitals={hospitals} 
          interactions={interactions} 
          zones={zones}
          users={users}
        />
      )}
      {activeTab === 'hospitals' && (
        <HospitalList 
          hospitals={hospitals} 
          users={users} 
          interactions={interactions}
          isAdmin={user.role === 'admin'} 
          zones={zones}
          currentUser={user}
        />
      )}
      {activeTab === 'team' && user.role === 'admin' && (
        <TeamManagement users={users} zones={zones} />
      )}
      {activeTab === 'verification' && user.role === 'admin' && (
        <VerificationQueue 
          interactions={interactions} 
          hospitals={hospitals} 
          users={users} 
          currentUser={user}
          zones={zones}
        />
      )}
      {activeTab === 'logs' && (
        <ActivityLog hospitals={hospitals} interactions={interactions} users={users} currentUser={user} zones={zones} />
      )}
      {activeTab === 'audit' && user.role === 'admin' && (
        <AuditLogList users={users} currentUser={user} />
      )}
      {activeTab === 'settings' && user.role === 'admin' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <ReportScheduler />
          <SettingsManager />
        </div>
      )}
    </Layout>
  );
}
