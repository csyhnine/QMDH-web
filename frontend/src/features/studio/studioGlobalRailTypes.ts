import type { AuthUser } from "../../api";

export type RailView = "studio" | "models" | "users" | "dashboard" | "settings";

export type StudioGlobalRailProps = {
  activeView: RailView;
  currentUser: AuthUser;
  health: string;
  lastSyncedAt: string | null;
  canManageUsers: boolean;
  canUseOpsViews: boolean;
  isAdminView: boolean;
  onLogout: () => void;
};

export type StudioGlobalRailNavProps = Pick<StudioGlobalRailProps, "activeView" | "isAdminView">;

export type StudioGlobalRailFooterProps = Pick<
  StudioGlobalRailProps,
  | "canManageUsers"
  | "canUseOpsViews"
  | "currentUser"
  | "health"
  | "isAdminView"
  | "lastSyncedAt"
  | "onLogout"
>;
