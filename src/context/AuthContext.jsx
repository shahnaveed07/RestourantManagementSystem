import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getStoredToken, setStoredToken, setUnauthorizedHandler } from '../api/client';

const DEFAULT_CONFIG = {
  restaurantName: 'PassLine Restaurant',
  demoMode: true,
  demoOtpHint: '123456',
  otpExpiryMinutes: 5,
  captchaEnabled: false,
  captchaProvider: 'turnstile',
  captchaSiteKey: null,
  taxRate: 0.08,
  tables: [],
  demoTables: [],
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => getStoredToken());
  const [config, setConfig] = useState(DEFAULT_CONFIG);
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
    setUnauthorizedHandler(() => {
      setUser(null);
      setToken(null);
      setStoredToken(null);
    });
    return () => setUnauthorizedHandler(null);
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

  const requestOtp = useCallback(async (payload) => {
    return api.requestOtp(payload);
  }, []);

  const verifyOtp = useCallback(async (payload) => {
    const res = await api.verifyOtp(payload);
    setStoredToken(res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const passwordLogin = useCallback(async (email, password) => {
    const res = await api.passwordLogin(email, password);
    setStoredToken(res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const demoLogin = useCallback(async (role) => {
    const res = await api.demoLogin(role);
    setStoredToken(res.accessToken);
    setToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    try {
      await api.logout();
    } catch {
      // ignore logout network errors
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        config,
        loading,
        requestOtp,
        verifyOtp,
        passwordLogin,
        login: passwordLogin,
        demoLogin,
        logout,
        refreshConfig,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
