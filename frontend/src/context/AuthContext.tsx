import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  type AuthUser,
  api,
  getStoredAuthToken,
  setStoredAuthToken,
  clearStoredAuthToken,
} from "../api";
import { canManageUsers as canManageUsersByRole, canUseBackoffice } from "../features/access/roleAccess";
import { readGuestModeSession, writeGuestModeSession } from "../features/access/guestMode";

// Re-export for convenience
export type { AuthUser };

export type AuthMode = "guest" | "authenticated";

interface AuthContextValue {
  /** Current authenticated user, null if not logged in */
  currentUser: AuthUser | null;
  /** Whether auth state has been resolved (token checked) */
  authReady: boolean;
  /** Guest vs normal session; guest is not authenticated */
  authMode: AuthMode;
  /** Shorthand for authMode === "guest" */
  isGuest: boolean;
  /** Enter guest mode without credentials */
  enterGuestMode: () => void;
  /** Leave guest mode without logging in */
  exitGuestMode: () => void;
  /** Login with username/password. Throws on failure. */
  login: (username: string, password: string) => Promise<void>;
  /** Logout and clear session */
  logout: () => Promise<void>;
  /** Whether user can manage accounts (admin only) */
  canManageUsers: boolean;
  /** Whether user can enter backoffice shell (admin or ops) */
  canUseOpsViews: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isGuest, setIsGuest] = useState(() => readGuestModeSession());

  const exitGuestMode = useCallback(() => {
    writeGuestModeSession(false);
    setIsGuest(false);
  }, []);

  const enterGuestMode = useCallback(() => {
    clearStoredAuthToken();
    setCurrentUser(null);
    writeGuestModeSession(true);
    setIsGuest(true);
  }, []);

  // Check existing token on mount
  useEffect(() => {
    const token = getStoredAuthToken();
    if (!token) {
      setAuthReady(true);
      return;
    }

    writeGuestModeSession(false);
    setIsGuest(false);

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
    writeGuestModeSession(false);
    setIsGuest(false);
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
    writeGuestModeSession(false);
    setIsGuest(false);
  }, []);

  const canManageUsers = canManageUsersByRole(currentUser?.role);
  const canUseOpsViews = canUseBackoffice(currentUser?.role);
  const authMode: AuthMode = isGuest ? "guest" : "authenticated";

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        authReady,
        authMode,
        isGuest,
        enterGuestMode,
        exitGuestMode,
        login,
        logout,
        canManageUsers,
        canUseOpsViews,
      }}
    >
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
