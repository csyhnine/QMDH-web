import { type FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { BrandIcon, BrandWordmark } from "../../components/shared";
import { useAuth } from "../../context/AuthContext";

export default function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoginError("");

    try {
      await login(loginName, loginPassword);
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
          <BrandIcon className="auth-brand-icon" />
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
        {loginError ? <div className="floating-error">{loginError}</div> : null}
        <button type="submit" className="submit-button">
          登录
        </button>
      </form>
    </main>
  );
}
