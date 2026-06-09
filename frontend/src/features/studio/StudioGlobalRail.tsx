import { BrandIcon } from "../../components/shared";
import StudioGlobalRailFooter from "./StudioGlobalRailFooter";
import StudioGlobalRailNav from "./StudioGlobalRailNav";
import type { StudioGlobalRailProps } from "./studioGlobalRailTypes";

export default function StudioGlobalRail(props: StudioGlobalRailProps) {
  return (
    <aside className="global-rail">
      <div className="rail-logo">
        <BrandIcon className="rail-logo-image" />
      </div>
      <StudioGlobalRailNav activeView={props.activeView} isAdminView={props.isAdminView} />
      <StudioGlobalRailFooter
        canManageUsers={props.canManageUsers}
        canUseOpsViews={props.canUseOpsViews}
        currentUser={props.currentUser}
        health={props.health}
        isAdminView={props.isAdminView}
        lastSyncedAt={props.lastSyncedAt}
        onLogout={props.onLogout}
      />
    </aside>
  );
}
