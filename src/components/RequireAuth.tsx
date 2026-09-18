import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { canAccess, ROLE_HOME, type RoleName } from "@/lib/roles";

export function RequireAuth() {
  const { session, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="p-8 text-sm text-paper/60">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!canAccess(session.role as RoleName, loc.pathname)) {
    return <Navigate to={ROLE_HOME[session.role as RoleName] || "/denied"} replace />;
  }
  return <Outlet />;
}
