import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearTokens, hasToken, setTokens } from "./api";
import type { Me } from "./types";

interface AuthState {
  me: Me | null;
  loading: boolean;
  reload: () => Promise<Me | null>;
  setMe: (me: Me) => void;
  login: (tokens: { access: string; refresh: string }) => Promise<Me | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children, initialMe, onMeChange }: {
  children: ReactNode;
  initialMe?: Me | null;
  onMeChange?: (me: Me | null) => void;
}) {
  const [me, setUser] = useState<Me | null>(initialMe ?? null);
  const [loading, setLoading] = useState(() => initialMe === undefined && hasToken());
  const setMe = useCallback((user: Me | null) => {
    setUser(user);
    onMeChange?.(user);
  }, [onMeChange]);

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
  }, [setMe]);

  useEffect(() => {
    if (initialMe === undefined) void reload();
  }, [initialMe, reload]);

  const login = useCallback(
    async (tokens: { access: string; refresh: string }) => {
      setTokens(tokens.access, tokens.refresh);
      return reload();
    },
    [reload],
  );

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout/", {}); } finally {
      clearTokens();
      setMe(null);
      window.dispatchEvent(new Event("koko-logout"));
    }
  }, [setMe]);

  return (
    <AuthContext.Provider value={{ me, loading, reload, setMe, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
