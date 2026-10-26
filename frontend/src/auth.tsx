import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearTokens, hasToken, setTokens } from "./api";
import type { Me } from "./types";

interface AuthState {
  me: Me | null;
  loading: boolean;
  reload: () => Promise<Me | null>;
  setMe: (me: Me) => void;
  login: (tokens: { access: string; refresh: string }) => Promise<Me | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(hasToken());

  const reload = useCallback(async () => {
    if (!hasToken()) {
      setMe(null);
      return null;
    }
    try {
      const data = await api.get<Me>("/me/");
      setMe(data);
      return data;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const login = useCallback(
    async (tokens: { access: string; refresh: string }) => {
      setTokens(tokens.access, tokens.refresh);
      return reload();
    },
    [reload],
  );

  const logout = useCallback(() => {
    clearTokens();
    setMe(null);
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, reload, setMe, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
