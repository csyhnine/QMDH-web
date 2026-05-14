import { type FormEvent, useState } from "react";
import { useAuth } from "../../context/AuthContext";

/**
 * Login page - handles user authentication.
 * Self-contained with its own local state for form fields.
 */
export default function LoginPage() {
  const { login } = useAuth();
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoginError("");
    try {
      await login(loginName, loginPassword);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "登录失败");
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleLogin}>
        <p className="canvas-kicker">QMDH / LOGIN</p>
        <h1>登录 QMDH</h1>
        <label className="composer-menu-field">
          <span>用户名</span>
          <input
            value={loginName}
            onChange={(event) => setLoginName(event.target.value)}
            autoComplete="username"
          />
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
