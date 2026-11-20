import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getStoredToken, setStoredToken } from '../api/client';
import type { AppConfig, AuthUser, UserRole } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  config: AppConfig;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  demoLogin: (role: UserRole) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshConfig: () => Promise<void>;
}

const DEFAULT_CONFIG: AppConfig = {
  restaurantName: 'Linden & Rye',
  demoMode: true,
  taxRate: 0.08,
  demoTables: [],
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);
    } catch {
      // keep default config
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function hydrate() {
      await refreshConfig();
      try {
        const me = await api.getSession();
        if (active) {
          setUser(me);
          if (!me) {
            setStoredToken(null);
            setToken(null);
          }
        }
      } catch {
        if (active) {
          setUser(null);
          setStoredToken(null);
          setToken(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    hydrate();
    return () => {
      active = false;
    };
  }, [refreshConfig]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setStoredToken(res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const demoLogin = useCallback(async (role: UserRole) => {
    const res = await api.demoLogin(role);
    setStoredToken(res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // ignore logout network errors
    }
    setStoredToken(null);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, config, loading, login, demoLogin, logout, refreshConfig }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
