export type UserRole = "admin" | "ops" | "designer";

export type AdminModuleKey =
  | "dashboard"
  | "usage-logs"
  | "inspiration"
  | "feedback"
  | "models"
  | "templates"
  | "canvas-templates"
  | "agents"
  | "users"
  | "settings";

const OPS_ALLOWED_MODULES = new Set<AdminModuleKey>(["inspiration", "feedback", "templates", "canvas-templates"]);

export function normalizeUserRole(role: string | undefined | null): UserRole {
  const normalized = (role || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "owner") return "admin";
  if (normalized === "ops") return "ops";
  return "designer";
}

export function canManageUsers(role: string | undefined | null): boolean {
  return normalizeUserRole(role) === "admin";
}

export function canUseBackoffice(role: string | undefined | null): boolean {
  const normalized = normalizeUserRole(role);
  return normalized === "admin" || normalized === "ops";
}

export function canAccessAdminModule(role: string | undefined | null, module: AdminModuleKey): boolean {
  const normalized = normalizeUserRole(role);
  if (normalized === "admin") return true;
  if (normalized === "ops") return OPS_ALLOWED_MODULES.has(module);
  return false;
}

export function defaultAdminHomePath(role: string | undefined | null): string {
  if (normalizeUserRole(role) === "ops") return "/admin/inspiration";
  if (normalizeUserRole(role) === "admin") return "/admin/dashboard";
  return "/studio/generate";
}

export function roleLabel(role: string | undefined | null): string {
  const normalized = normalizeUserRole(role);
  if (normalized === "admin") return "管理员";
  if (normalized === "ops") return "运维";
  return "设计师";
}
