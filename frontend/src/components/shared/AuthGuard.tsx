import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { isStudioGuestPath } from "../../features/access/guestMode";
import LoadingFallback from "./LoadingFallback";

export default function AuthGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { authReady, currentUser, isGuest } = useAuth();

  if (!authReady) {
    return <LoadingFallback />;
  }

  const guestStudioAccess = isGuest && isStudioGuestPath(location.pathname);
  if (!currentUser && !guestStudioAccess) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
