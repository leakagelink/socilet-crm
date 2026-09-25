import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { LoginPage, DeniedPage } from "@/pages/LoginPage";
import { DashboardPage, AnalyticsPage, AiAnalyzerPage } from "@/pages/SpecialPages";
import { AgentPage } from "@/pages/AgentPage";
import { AiKeysPage } from "@/pages/AiKeysPage";
import { BalanceTrackerPage } from "@/pages/BalanceTrackerPage";
import { CosmofeedAnalyticsPage, CosmofeedComparePage, CosmofeedPage } from "@/pages/CosmofeedPages";
import { EmailsPage } from "@/pages/EmailsPage";
import { EmailSetupPage } from "@/pages/EmailSetupPage";
import { AccountPage } from "@/pages/AccountPage";
import { TasksPage } from "@/pages/TasksPage";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { MODULES } from "@/lib/modules";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_HOME, isStaffRole } from "@/lib/roles";
import { ClientsPage, ClientDetailPage } from "@/pages/ClientsPage";
import { ActivityPage } from "@/pages/ActivityPage";
import { FollowUpsPage } from "@/pages/FollowUpsPage";
import { GstPage } from "@/pages/GstPage";
import { CalculatorPage } from "@/pages/CalculatorPage";
import { DocumentPrintPage, InvoicesPage, QuotationsPage } from "@/pages/DocumentsPages";
import { InvoiceComposer, QuoteComposer } from "@/pages/DocumentComposer";
import { PaymentMethodsPage } from "@/pages/PaymentMethodsPage";
import { ServiceCredentialsPage } from "@/pages/ServiceCredentialsPage";
import { MeetingsPage } from "@/pages/MeetingsPage";
import { MeetingJoinPage, MeetingRoomPage } from "@/pages/MeetingRoomPage";
import { AdsPage } from "@/pages/AdsPage";

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

const SPECIAL = new Set(["tasks", "ai_analyzer", "balance_tracker", "analytics", "emails", "clients", "quotations", "invoices", "service_credentials", "cosmofeed", "payment_methods", "activity", "meetings", "meeting_providers", "ad_accounts", "ad_campaigns", "ad_leads"]);

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginGate />} />
      <Route path="/join/:token" element={<MeetingJoinPage />} />
      <Route path="/denied" element={<DeniedPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/ai-keys" element={<AiKeysPage />} />
          <Route path="/follow-ups" element={<FollowUpsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/gst" element={<GstPage />} />
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />
          <Route path="/quotations" element={<QuotationsPage />} />
          <Route path="/quotations/new" element={<QuoteComposer />} />
          <Route path="/quotations/:id/edit" element={<QuoteComposer />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/invoices/new" element={<InvoiceComposer />} />
          <Route path="/invoices/:id/edit" element={<InvoiceComposer />} />
          <Route path="/print/:kind/:id" element={<DocumentPrintPage />} />
          <Route path="/payment-methods" element={<PaymentMethodsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/ai-analyzer" element={<AiAnalyzerPage />} />
          <Route path="/balance-tracker" element={<BalanceTrackerPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/cosmofeed" element={<CosmofeedPage />} />
          <Route path="/cosmofeed-analytics" element={<CosmofeedAnalyticsPage />} />
          <Route path="/cosmofeed-compare" element={<CosmofeedComparePage />} />
          <Route path="/emails" element={<EmailsPage />} />
          <Route path="/email-setup" element={<EmailSetupPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/ads" element={<AdsPage />} />
          <Route path="/meetings" element={<MeetingsPage />} />
          <Route path="/meetings/:id/room" element={<MeetingRoomPage />} />
          <Route path="/service-credentials" element={<ServiceCredentialsPage />} />
          {MODULES.filter((m) => !SPECIAL.has(m.id)).map((m) => (
            <Route key={m.id} path={m.path} element={<Crud id={m.id} />} />
          ))}
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
