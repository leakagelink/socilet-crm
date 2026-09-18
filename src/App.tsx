import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { LoginPage, DeniedPage } from "@/pages/LoginPage";
import { DashboardPage, BalanceTrackerPage, AnalyticsPage, AiAnalyzerPage } from "@/pages/SpecialPages";
import { EmailsPage } from "@/pages/EmailsPage";
import { AccountPage } from "@/pages/AccountPage";
import { TasksPage } from "@/pages/TasksPage";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { MODULES } from "@/lib/modules";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_HOME, isStaffRole } from "@/lib/roles";
import { ClientsPage, ClientDetailPage } from "@/pages/ClientsPage";
import { FollowUpsPage } from "@/pages/FollowUpsPage";
import { GstPage } from "@/pages/GstPage";
import { DocumentPrintPage, InvoicesPage, QuotationsPage } from "@/pages/DocumentsPages";

function Crud({ id }: { id: string }) {
  const m = MODULES.find((x) => x.id === id)!;
  return <ModuleCrud module={m} />;
}

function LoginGate() {
  const { session, ready } = useAuth();
  if (!ready) return <div className="grid min-h-full place-items-center text-sm text-paper/50">Loading…</div>;
  if (session && isStaffRole(session.role)) return <Navigate to={ROLE_HOME[session.role]} replace />;
  if (session) return <Navigate to="/denied" replace />;
  return <LoginPage />;
}

const SPECIAL = new Set(["tasks", "ai_analyzer", "balance_tracker", "analytics", "emails", "clients", "quotations", "invoices"]);

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginGate />} />
      <Route path="/denied" element={<DeniedPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/follow-ups" element={<FollowUpsPage />} />
          <Route path="/gst" element={<GstPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />
          <Route path="/quotations" element={<QuotationsPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/print/:kind/:id" element={<DocumentPrintPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/ai-analyzer" element={<AiAnalyzerPage />} />
          <Route path="/balance-tracker" element={<BalanceTrackerPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/emails" element={<EmailsPage />} />
          <Route path="/account" element={<AccountPage />} />
          {MODULES.filter((m) => !SPECIAL.has(m.id)).map((m) => (
            <Route key={m.id} path={m.path} element={<Crud id={m.id} />} />
          ))}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
