import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getAccessToken, onTokenChange, setAccessToken } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous

  // Restore an existing session on first load: a stored access token is
  // verified, and if it has expired the refresh cookie is tried once.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (getAccessToken()) {
          const { user: current } = await api.auth.me();
          if (!cancelled) {
            setUser(current);
            setStatus('authenticated');
          }
          return;
        }
        const refreshed = await api.auth.refresh();
        if (!cancelled && refreshed?.accessToken) {
          setAccessToken(refreshed.accessToken);
          setUser(refreshed.user);
          setStatus('authenticated');
          return;
        }
      } catch {
        /* No usable session; continue as a guest. */
      }
      if (!cancelled) {
        setAccessToken(null);
        setUser(null);
        setStatus('anonymous');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // If the token is cleared anywhere (e.g. a failed refresh), drop the user too.
  useEffect(
    () =>
      onTokenChange((token) => {
        if (!token) {
          setUser(null);
          setStatus('anonymous');
        }
      }),
    [],
  );

  const adopt = useCallback((session) => {
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus('authenticated');
    return session.user;
  }, []);

  const login = useCallback(
    async (credentials) => adopt(await api.auth.login(credentials)),
    [adopt],
  );

  const register = useCallback(
    async (details) => adopt(await api.auth.register(details)),
    [adopt],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* Clearing the local session matters more than the server round-trip. */
    }
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const updateProfile = useCallback(async (payload) => {
    const { user: updated } = await api.auth.updateProfile(payload);
    setUser(updated);
    return updated;
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      login,
      register,
      logout,
      updateProfile,
    }),
    [user, status, login, register, logout, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
