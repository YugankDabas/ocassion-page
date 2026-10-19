import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { can, type Permission, type SessionUser } from '../contracts';
import { ApiError, api } from './api';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  can(permission: Permission): boolean;
  /** Reloads the signed-in user's details (e.g. after changing your own name or email). */
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface SessionResponse {
  user: SessionUser;
  csrfToken: string | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const clear = useCallback(() => {
    api.setCsrfToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    api.setUnauthorizedHandler(clear);
    api
      .get<SessionResponse>('/auth/me')
      .then((s) => {
        api.setCsrfToken(s.csrfToken);
        setUser(s.user);
      })
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) console.error(err);
      })
      .finally(() => setLoading(false));
  }, [clear]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const s = await api.post<SessionResponse>('/auth/login', { email, password });
        api.setCsrfToken(s.csrfToken);
        setUser(s.user);
      },
      async logout() {
        await api.post('/auth/logout').catch(() => undefined);
        clear();
      },
      async refresh() {
        const s = await api.get<SessionResponse>('/auth/me');
        api.setCsrfToken(s.csrfToken);
        setUser(s.user);
      },
      can: (permission) => (user ? can(user.role, permission) : false),
    }),
    [user, loading, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
