import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

function readStoredAuth() {
  try {
    const raw = localStorage.getItem('quizapp_auth');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(readStoredAuth);
  // Ref всегда содержит актуальный токен — не зависит от closure в useCallback
  const authRef = useRef(auth);

  const persist = useCallback((value) => {
    authRef.current = value;
    setAuth(value);
    if (value) {
      localStorage.setItem('quizapp_auth', JSON.stringify(value));
    } else {
      localStorage.removeItem('quizapp_auth');
    }
  }, []);

  const login = useCallback(
    async (email, password) => {
      const data = await api.login({ email, password });
      persist(data);
      return data;
    },
    [persist]
  );

  const register = useCallback(
    async (email, password, name) => {
      const data = await api.register({ email, password, name });
      persist(data);
      return data;
    },
    [persist]
  );

  const selectRole = useCallback(
    async (role) => {
      // Берём токен из ref — он всегда актуален, даже если auth state ещё не ре-рендерился
      const token = authRef.current?.token;
      const data = await api.selectRole(token, { role });
      persist(data);
      return data;
    },
    [persist]
  );

  const logout = useCallback(() => persist(null), [persist]);

  return (
    <AuthContext.Provider
      value={{
        token: auth?.token ?? null,
        user: auth?.user ?? null,
        login,
        register,
        selectRole,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth должен использоваться внутри AuthProvider');
  return ctx;
}
