import { type ReactNode } from "react";

interface AuthGuardProps {
  isAuthenticated: boolean;
  children: ReactNode;
  onRedirectToLogin?: () => void;
}

/**
 * Wraps protected routes. If not authenticated, triggers redirect to login.
 * Will be connected to react-router-dom in task 3.4.
 */
export default function AuthGuard({ isAuthenticated, children, onRedirectToLogin }: AuthGuardProps) {
  if (!isAuthenticated) {
    onRedirectToLogin?.();
    return null;
  }
  return <>{children}</>;
}
