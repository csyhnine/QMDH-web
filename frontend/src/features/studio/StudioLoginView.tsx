import type { FormEvent } from "react";

import { BrandWordmark } from "../../components/shared";

type StudioLoginViewProps = {
  loginName: string;
  loginPassword: string;
  loginError: string;
  rememberLogin: boolean;
  onLoginNameChange: (value: string) => void;
  onLoginPasswordChange: (value: string) => void;
  onRememberLoginChange: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function StudioLoginView({
  loginName,
  loginPassword,
  loginError,
  rememberLogin,
  onLoginNameChange,
  onLoginPasswordChange,
  onRememberLoginChange,
  onSubmit,
}: StudioLoginViewProps) {
  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <div className="auth-brand">
          <BrandWordmark className="auth-brand-wordmark" />
        </div>
        <p className="canvas-kicker">设计师工作台登录</p>
        <h1>欢迎回来</h1>
        <label className="composer-menu-field">
          <span>用户名</span>
          <input value={loginName} onChange={(event) => onLoginNameChange(event.target.value)} autoComplete="username" />
        </label>
        <label className="composer-menu-field">
          <span>密码</span>
          <input
            type="password"
            value={loginPassword}
            onChange={(event) => onLoginPasswordChange(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <label className="auth-remember">
          <input
            type="checkbox"
            checked={rememberLogin}
            onChange={(event) => onRememberLoginChange(event.target.checked)}
          />
          <span>记住账号和密码</span>
        </label>
        {loginError ? <div className="floating-error">{loginError}</div> : null}
        <button type="submit" className="submit-button">登录</button>
      </form>
    </main>
  );
}
