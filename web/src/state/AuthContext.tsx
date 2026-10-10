import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from '../api/client.js';
import type { EffectiveCreation, PublicUser } from '../api/types.js';

interface AuthState {
  user: PublicUser | null;
  /** What this account may create (and how many it already owns). */
  creation: EffectiveCreation | null;
  /** Re-reads the creation policy/owned count without the full-screen loading state. */
  refreshCreation: () => Promise<void>;
  loading: boolean;
  setupRequired: boolean;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [creation, setCreation] = useState<EffectiveCreation | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const status = await api.get<{ setupRequired: boolean }>('/auth/status');
      setSetupRequired(status.setupRequired);
      if (!status.setupRequired && getToken()) {
        try {
          const res = await api.get<{ user: PublicUser; creation: EffectiveCreation }>('/auth/me');
          setUser(res.user);
          setCreation(res.creation ?? null);
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const refreshCreation = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await api.get<{ creation: EffectiveCreation }>('/auth/me');
      setCreation(res.creation ?? null);
    } catch {
      // keep the last known policy
    }
  }, []);

  // Fetch the policy after login/setup too (those responses don't include it).
  useEffect(() => {
    if (user) refreshCreation();
    else setCreation(null);
  }, [user, refreshCreation]);

  const login = useCallback(async (username: string, password: string) => {
    const { token, user } = await api.post<{ token: string; user: PublicUser }>('/auth/login', {
      username,
      password,
    });
    setToken(token);
    setUser(user);
  }, []);

  const setup = useCallback(async (username: string, password: string) => {
    const { token, user } = await api.post<{ token: string; user: PublicUser }>('/auth/setup', {
      username,
      password,
    });
    setToken(token);
    setUser(user);
    setSetupRequired(false);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, creation, refreshCreation, loading, setupRequired, login, setup, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
