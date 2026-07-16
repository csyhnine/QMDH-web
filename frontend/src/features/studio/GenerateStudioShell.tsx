import StudioAuthenticatedShell from "./StudioAuthenticatedShell";
import StudioLoginView from "./StudioLoginView";
import GuestLoginBanner from "./GuestLoginBanner";
import { useAuth } from "../../context/AuthContext";
import { GUEST_USER } from "../access/guestMode";
import { useGenerateStudioController } from "./useGenerateStudioController";

export default function GenerateStudioShell() {
  const { isGuest, authReady: contextAuthReady } = useAuth();
  const studio = useGenerateStudioController();
  const { studioAuth } = studio;
  const { authReady, currentUser } = studioAuth;

  if (!authReady || !contextAuthReady) {
    return <div className="auth-shell">正在确认登录状态...</div>;
  }

  if (!currentUser && !isGuest) {
    return (
      <StudioLoginView
        loginName={studioAuth.loginName}
        loginPassword={studioAuth.loginPassword}
        loginError={studioAuth.loginError}
        rememberLogin={studioAuth.rememberLogin}
        onLoginNameChange={studioAuth.setLoginName}
        onLoginPasswordChange={studioAuth.setLoginPassword}
        onRememberLoginChange={studioAuth.setRememberLogin}
        onSubmit={studioAuth.login}
      />
    );
  }

  const shellUser = currentUser ?? GUEST_USER;

  return (
    <div className={isGuest ? "studio-guest-layout" : undefined}>
      {isGuest ? <GuestLoginBanner /> : null}
      <StudioAuthenticatedShell currentUser={shellUser} studio={studio} />
    </div>
  );
}
