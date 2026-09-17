import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken } from '../api/client.js';
import type { PublicUser } from '../api/types.js';

interface AuthState {
  user: PublicUser | null;
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
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const status = await api.get<{ setupRequired: boolean }>('/auth/status');
      setSetupRequired(status.setupRequired);
      if (!status.setupRequired && getToken()) {
        try {
          const { user } = await api.get<{ user: PublicUser }>('/auth/me');
          setUser(user);
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
    <AuthContext.Provider value={{ user, loading, setupRequired, login, setup, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
