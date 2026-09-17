import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { LoginPage, DeniedPage } from "@/pages/LoginPage";
import { DashboardPage, BalanceTrackerPage, AnalyticsPage, AiAnalyzerPage } from "@/pages/SpecialPages";
import { EmailsPage } from "@/pages/EmailsPage";
import { TasksPage } from "@/pages/TasksPage";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { MODULES } from "@/lib/modules";
import { useAuth } from "@/hooks/useAuth";

function Crud({ id }: { id: string }) {
  const m = MODULES.find((x) => x.id === id)!;
  return <ModuleCrud module={m} />;
}

function LoginGate() {
  const { session } = useAuth();
  if (session?.role === "admin") return <Navigate to="/" replace />;
  if (session) return <Navigate to="/denied" replace />;
  return <LoginPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginGate />} />
      <Route path="/denied" element={<DeniedPage />} />
      <Route element={<RequireAuth adminOnly />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/ai-analyzer" element={<AiAnalyzerPage />} />
          <Route path="/balance-tracker" element={<BalanceTrackerPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/emails" element={<EmailsPage />} />
          {MODULES.filter((m) => !["tasks", "ai_analyzer", "balance_tracker", "analytics", "emails"].includes(m.id)).map((m) => (
            <Route key={m.id} path={m.path} element={<Crud id={m.id} />} />
          ))}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
