import { useNavigate } from "react-router-dom";

export default function GuestLoginBanner() {
  const navigate = useNavigate();

  return (
    <div className="guest-login-banner" role="status">
      <span>当前为访客模式，仅可浏览界面。登录后可提交生成、上传参考图并使用全部功能。</span>
      <button type="button" className="ghost-button guest-login-banner-action" onClick={() => navigate("/login")}>
        登录
      </button>
    </div>
  );
}
