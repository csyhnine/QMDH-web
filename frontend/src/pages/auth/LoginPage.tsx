import { type FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { BrandWordmark } from "../../components/shared";
import { useAuth } from "../../context/AuthContext";
import {
  clearRememberedLoginCredentials,
  loadRememberedLoginCredentials,
  saveRememberedLoginCredentials,
} from "../../features/auth/loginCredentialsStorage";

export default function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login, enterGuestMode } = useAuth();
  const remembered = loadRememberedLoginCredentials();
  const [loginName, setLoginName] = useState(remembered.name);
  const [loginPassword, setLoginPassword] = useState(remembered.password);
  const [rememberLogin, setRememberLogin] = useState(remembered.remember);
  const [loginError, setLoginError] = useState("");

  function handleGuestMode() {
    enterGuestMode();
    navigate("/studio/generate", { replace: true });
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoginError("");

    try {
      const trimmedName = loginName.trim();
      await login(trimmedName, loginPassword);
      if (rememberLogin) {
        saveRememberedLoginCredentials(trimmedName, loginPassword);
      } else {
        clearRememberedLoginCredentials();
      }
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from || "/studio/generate", { replace: true });
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败");
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleLogin}>
        <div className="auth-brand">
          <BrandWordmark className="auth-brand-wordmark" />
        </div>
        <p className="canvas-kicker">设计师工作台登录</p>
        <h1>欢迎回来</h1>
        <label className="composer-menu-field">
          <span>用户名</span>
          <input value={loginName} onChange={(event) => setLoginName(event.target.value)} autoComplete="username" />
        </label>
        <label className="composer-menu-field">
          <span>密码</span>
          <input
            type="password"
            value={loginPassword}
            onChange={(event) => setLoginPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="auth-remember">
          <input
            type="checkbox"
            checked={rememberLogin}
            onChange={(event) => setRememberLogin(event.target.checked)}
          />
          <span>记住账号和密码</span>
        </label>
        {loginError ? <div className="floating-error">{loginError}</div> : null}
        <button type="submit" className="submit-button">
          登录
        </button>
        <div className="auth-guest-divider">或</div>
        <button type="button" className="ghost-button auth-guest-button" onClick={handleGuestMode}>
          访客模式
        </button>
        <p className="auth-guest-hint">无需登录，可浏览 Studio 界面（无法提交生成）</p>
      </form>
    </main>
  );
}
