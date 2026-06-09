import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import LoadingFallback from "./LoadingFallback";

export default function AuthGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { authReady, currentUser } = useAuth();

  if (!authReady) {
    return <LoadingFallback />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
