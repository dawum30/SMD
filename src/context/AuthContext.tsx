import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getStoredToken, setStoredSchoolId } from '../services/api';
import { isSupabaseConfigured } from '../lib/supabase';
import { AuthSession, School, UserRole } from '../types/database';

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  activeSchool: School | null;
  role: UserRole;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  switchSchool: (schoolId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      if (!isSupabaseConfigured() && !getStoredToken()) {
        setSession(null);
        setLoading(false);
        return;
      }
      const s = await api.getSession();
      setSession(s);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = async (email: string, password: string) => {
    const s = await api.login(email, password);
    setSession(s);
  };

  const logout = async () => {
    await api.logout();
    setSession(null);
  };

  const switchSchool = async (schoolId: string) => {
    setStoredSchoolId(schoolId);
    await refreshSession();
  };

  const activeSchool = session?.schools.find((s) => s.id === session.activeSchoolId) || session?.schools[0] || null;
  const role: UserRole = session?.activeRole || 'teacher';
  const isSuperAdmin = Boolean(session?.user.is_super_admin);
  const isAdmin = role === 'super_admin' || role === 'school_admin' || isSuperAdmin;

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        activeSchool,
        role,
        isAdmin,
        isSuperAdmin,
        login,
        logout,
        refreshSession,
        switchSchool,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
