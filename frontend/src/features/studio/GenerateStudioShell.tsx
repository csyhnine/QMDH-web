import StudioAuthenticatedShell from "./StudioAuthenticatedShell";
import StudioLoginView from "./StudioLoginView";
import { useGenerateStudioController } from "./useGenerateStudioController";

export default function GenerateStudioShell() {
  const studio = useGenerateStudioController();
  const { studioAuth } = studio;
  const { authReady, currentUser } = studioAuth;

  if (!authReady) {
    return <div className="auth-shell">正在确认登录状态...</div>;
  }

  if (!currentUser) {
    return (
      <StudioLoginView
        loginName={studioAuth.loginName}
        loginPassword={studioAuth.loginPassword}
        loginError={studioAuth.loginError}
        onLoginNameChange={studioAuth.setLoginName}
        onLoginPasswordChange={studioAuth.setLoginPassword}
        onSubmit={studioAuth.login}
      />
    );
  }

  return <StudioAuthenticatedShell currentUser={currentUser} studio={studio} />;
}
