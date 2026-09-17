import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function RequireAuth({ adminOnly }: { adminOnly?: boolean }) {
  const { session, ready } = useAuth();
  if (!ready) return <div className="p-8 text-sm text-paper/60">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (adminOnly && session.role !== "admin") return <Navigate to="/denied" replace />;
  return <Outlet />;
}
