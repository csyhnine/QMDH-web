import { type FormEvent, useEffect, useState } from "react";

import {
  api,
  clearStoredAuthToken,
  type AuthUser,
  getStoredAuthToken,
  setStoredAuthToken,
} from "../../api";
import {
  clearRememberedLoginCredentials,
  loadRememberedLoginCredentials,
  saveRememberedLoginCredentials,
} from "../auth/loginCredentialsStorage";

type UseStudioAuthOptions = {
  onLogout: () => void;
};

export function useStudioAuth({ onLogout }: UseStudioAuthOptions) {
  const remembered = loadRememberedLoginCredentials();
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loginName, setLoginName] = useState(remembered.name);
  const [loginPassword, setLoginPassword] = useState(remembered.password);
  const [rememberLogin, setRememberLogin] = useState(remembered.remember);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    async function restoreSession() {
      if (!getStoredAuthToken()) {
        setAuthReady(true);
        return;
      }

      try {
        const user = await api.me();
        setCurrentUser(user);
      } catch {
        clearStoredAuthToken();
        setCurrentUser(null);
      } finally {
        setAuthReady(true);
      }
    }

    void restoreSession();
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    try {
      const trimmedName = loginName.trim();
      const response = await api.login(trimmedName, loginPassword);
      setStoredAuthToken(response.token);
      setCurrentUser(response.user);
      if (rememberLogin) {
        saveRememberedLoginCredentials(trimmedName, loginPassword);
      } else {
        clearRememberedLoginCredentials();
      }
      setLoginPassword(rememberLogin ? loginPassword : "");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败");
    }
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // Local logout should still clear the browser session.
    }
    clearStoredAuthToken();
    setCurrentUser(null);
    onLogout();
    window.location.href = "/login";
  }

  return {
    authReady,
    currentUser,
    login,
    loginError,
    loginName,
    loginPassword,
    logout,
    rememberLogin,
    setLoginName,
    setLoginPassword,
    setRememberLogin,
  };
}
