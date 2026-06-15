import type { AuthUser } from "../../api";
import {
  canAccessAdminModule,
  canManageUsers as canManageUsersByRole,
  canUseBackoffice,
  defaultAdminHomePath,
} from "../access/roleAccess";

export function canManageUsers(user: AuthUser | null): boolean {
  return canManageUsersByRole(user?.role);
}

export function canUseOpsViews(user: AuthUser | null): boolean {
  return canUseBackoffice(user?.role);
}

export function canManageContentOps(user: AuthUser | null): boolean {
  return canAccessAdminModule(user?.role, "templates");
}

export function adminHomePath(user: AuthUser | null): string {
  return defaultAdminHomePath(user?.role);
}
