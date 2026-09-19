import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  LogOut,
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  FileText,
  Sparkles,
  Receipt,
  Package,
  Repeat,
  Wallet,
  Radio,
  TrendingDown,
  LineChart,
  Scale,
  CreditCard,
  BarChart3,
  Mail,
  Bell,
  Clock,
  KeyRound,
  Ban,
  PlusSquare,
  Store,
  MessageSquare,
  Video,
  Folder,
  Shield,
  Users,
  Landmark,
  PhoneCall,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { MODULES } from "@/lib/modules";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { restoreMailboxesToServer } from "@/lib/mailboxStore";
import { cn } from "@/lib/utils";
import { canAccess, type RoleName } from "@/lib/roles";

const ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/projects": FolderKanban,
  "/tasks": CheckSquare,
  "/quotations": FileText,
  "/project-addons": PlusSquare,
  "/ai-analyzer": Sparkles,
  "/invoices": Receipt,
  "/digital-products": Package,
  "/recurring-earnings": Repeat,
  "/other-income": Wallet,
  "/cosmofeed": Radio,
  "/cosmofeed-products": Store,
  "/spends": TrendingDown,
  "/investments": LineChart,
  "/balance-tracker": Scale,
  "/payment-methods": CreditCard,
  "/analytics": BarChart3,
  "/emails": Mail,
  "/notifications": Bell,
  "/reminders": Clock,
  "/service-credentials": KeyRound,
  "/contact-messages": MessageSquare,
  "/workspaces": Folder,
  "/meetings": Video,
  "/blocked-messages": Ban,
  "/account": Shield,
  "/clients": Users,
  "/follow-ups": PhoneCall,
  "/gst": Landmark,
};

const groups = [
  { name: "Work", paths: ["/", "/follow-ups", "/clients", "/projects", "/project-addons", "/tasks", "/quotations", "/workspaces", "/meetings", "/ai-analyzer"] },
  {
    name: "Finance",
    paths: [
      "/invoices",
      "/digital-products",
      "/recurring-earnings",
      "/other-income",
      "/cosmofeed",
      "/cosmofeed-products",
      "/spends",
      "/investments",
      "/balance-tracker",
      "/payment-methods",
      "/analytics",
      "/gst",
    ],
  },
  {
    name: "Ops",
    paths: ["/emails", "/notifications", "/reminders", "/service-credentials", "/contact-messages", "/blocked-messages", "/account"],
  },
];

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/account": "Account",
  "/follow-ups": "Follow-ups",
  "/gst": "GST",
  ...Object.fromEntries(MODULES.map((m) => [m.path, m.title])),
};

function NavList({ onGo }: { onGo?: () => void }) {
  const { session } = useAuth();
  const role = session?.role as RoleName | undefined;
  return (
    <nav className="flex flex-col gap-5">
      {groups.map((g) => {
        const paths = g.paths.filter((path) => canAccess(role, path));
        if (!paths.length) return null;
        return (
        <div key={g.name}>
          <div className="mb-1.5 px-3 text-[10px] uppercase tracking-[0.2em] text-paper/30">{g.name}</div>
          <div className="flex flex-col gap-0.5">
            {paths.map((path) => {
              const Icon = ICONS[path] ?? LayoutDashboard;
              return (
                <NavLink
                  key={path}
                  to={path}
                  end={path === "/"}
                  onClick={onGo}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition duration-200",
                      isActive
                        ? "bg-gradient-to-r from-gold/20 to-gold/5 text-gold shadow-[inset_2px_0_0_#e8c36a]"
                        : "text-paper/65 hover:bg-white/5 hover:text-paper",
                    )
                  }
                >
                  <Icon className="h-4 w-4 opacity-80" />
                  {titles[path] ?? path}
                </NavLink>
              );
            })}
          </div>
        </div>
        );
      })}
    </nav>
  );
}

const BOTTOM_TABS: Record<RoleName, string[]> = {
  admin: ["/", "/clients", "/projects", "/tasks"],
  designer: ["/", "/clients", "/projects", "/tasks"],
  accountant: ["/", "/clients", "/invoices", "/follow-ups"],
};

const BOTTOM_LABELS: Record<string, string> = {
  "/": "Home",
  "/clients": "Clients",
  "/projects": "Projects",
  "/tasks": "Tasks",
  "/invoices": "Invoices",
  "/follow-ups": "Follow",
};

function tabActive(path: string, pathname: string) {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function BottomBar({ onMore }: { onMore: () => void }) {
  const { session } = useAuth();
  const loc = useLocation();
  const role = (session?.role as RoleName | undefined) || "admin";
  const tabs = (BOTTOM_TABS[role] ?? BOTTOM_TABS.admin).filter((path) => canAccess(role, path));
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-white/10 bg-panel/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md print:hidden lg:hidden"
      aria-label="Main"
    >
      {tabs.map((path) => {
        const Icon = ICONS[path] ?? LayoutDashboard;
        const on = tabActive(path, loc.pathname);
        return (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={cn(
              "flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium",
              on ? "text-gold" : "text-paper/50",
            )}
          >
            <Icon className={cn("h-5 w-5", on ? "opacity-100" : "opacity-70")} />
            <span className="max-w-full truncate">{BOTTOM_LABELS[path] ?? titles[path]}</span>
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        className="flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium text-paper/50"
      >
        <Menu className="h-5 w-5 opacity-70" />
        <span>More</span>
      </button>
    </nav>
  );
}

function ClockLabel() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const h = now.getHours();
  const greet = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="hidden md:block">
      <div className="text-[11px] uppercase tracking-[0.16em] text-gold/70">{greet}</div>
      <div className="text-sm text-paper/70">
        {now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
      </div>
    </div>
  );
}

export function AppLayout() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void restoreMailboxesToServer();
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);
  return (
    <div className="min-h-full min-w-0 lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="glass hidden border-r border-white/8 p-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">
        <div className="mb-7 flex items-center gap-3 px-1">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-gold to-[#c9a24a] font-display text-lg text-ink shadow-[0_8px_24px_rgba(232,195,106,0.35)]">
            S
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-gold/80">Socilet</div>
            <div className="font-display text-xl leading-none">CRM</div>
          </div>
        </div>
        <NavList />
      </aside>
      <div className="flex min-h-full min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex min-w-0 items-center justify-between gap-2 border-b border-white/8 bg-panel px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <OverlayPortal open={open} onClose={() => setOpen(false)}>
              <div className="fixed inset-0 z-50 lg:hidden">
                <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/55" onClick={() => setOpen(false)} />
                <div className="sheet-scroll absolute inset-y-0 left-0 z-10 w-[min(18rem,88vw)] overflow-y-auto border-r border-line bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <div className="mb-4 text-sm text-gold">Modules</div>
                  <NavList onGo={() => setOpen(false)} />
                </div>
              </div>
            </OverlayPortal>
            <span className="lg:hidden font-display text-base">Socilet</span>
            <ClockLabel />
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-3">
            <NotificationBell />
            <div className="hidden h-9 items-center rounded-full border border-white/10 bg-white/5 px-3 sm:flex">
              <span className="max-w-40 truncate text-paper/70">{session?.email}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>
        <main key={loc.pathname} className="page-enter min-w-0 max-w-full flex-1 overflow-x-hidden p-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:p-4 md:p-8 lg:pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
        <BottomBar onMore={() => setOpen(true)} />
      </div>
    </div>
  );
}
