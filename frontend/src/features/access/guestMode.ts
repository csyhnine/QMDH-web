import type { AuthUser } from "../../api";

export const GUEST_SESSION_KEY = "qmdh_guest_mode";

/** Placeholder user for guest-mode Studio shell rendering. */
export const GUEST_USER: AuthUser = {
  id: 0,
  name: "guest",
  display_name: "访客",
  group_name: "",
  role: "designer",
  project_codes: [],
  is_active: true,
  monthly_quota: null,
  billing_plan: "",
  billing_status: "",
  quota_policy: "",
  quota_reset_cycle: "",
};

export function readGuestModeSession(): boolean {
  try {
    return sessionStorage.getItem(GUEST_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeGuestModeSession(active: boolean): void {
  try {
    if (active) {
      sessionStorage.setItem(GUEST_SESSION_KEY, "1");
    } else {
      sessionStorage.removeItem(GUEST_SESSION_KEY);
    }
  } catch {
    // Ignore storage errors in private browsing.
  }
}

export function isStudioGuestPath(pathname: string): boolean {
  return pathname === "/studio" || pathname.startsWith("/studio/");
}
