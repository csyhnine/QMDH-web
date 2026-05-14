import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  type AuthUser,
  api,
  getStoredAuthToken,
  setStoredAuthToken,
  clearStoredAuthToken,
} from "../api";

// Re-export for convenience
export type { AuthUser };

interface AuthContextValue {
  /** Current authenticated user, null if not logged in */
  currentUser: AuthUser | null;
  /** Whether auth state has been resolved (token checked) */
  authReady: boolean;
  /** Login with username/password. Throws on failure. */
  login: (username: string, password: string) => Promise<void>;
  /** Logout and clear session */
  logout: () => Promise<void>;
  /** Whether user has admin/owner role */
  canManageUsers: boolean;
  /** Whether user has ops/admin/owner role */
  canUseOpsViews: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  // Check existing token on mount
  useEffect(() => {
    const token = getStoredAuthToken();
    if (!token) {
      setAuthReady(true);
      return;
    }

    api.me()
      .then((user) => setCurrentUser(user))
      .catch(() => {
        clearStoredAuthToken();
        setCurrentUser(null);
      })
      .finally(() => setAuthReady(true));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await api.login(username, password);
    setStoredAuthToken(response.token);
    setCurrentUser(response.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Ignore logout errors
    }
    clearStoredAuthToken();
    setCurrentUser(null);
  }, []);

  const canManageUsers = currentUser ? ["owner", "admin"].includes(currentUser.role) : false;
  const canUseOpsViews = currentUser ? ["owner", "admin", "ops"].includes(currentUser.role) : false;

  return (
    <AuthContext.Provider value={{ currentUser, authReady, login, logout, canManageUsers, canUseOpsViews }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
