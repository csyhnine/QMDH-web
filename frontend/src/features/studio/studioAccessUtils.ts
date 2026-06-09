import type { AuthUser } from "../../api";

export function canManageUsers(user: AuthUser | null): boolean {
  return user?.role === "admin";
}

export function canUseOpsViews(user: AuthUser | null): boolean {
  return user?.role === "admin";
}
