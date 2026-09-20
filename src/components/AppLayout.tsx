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
  GitCompare,
  PieChart,
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
  Settings2,
  Shield,
  Users,
  Landmark,
  PhoneCall,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { MODULES } from "@/lib/modules";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { restoreMailboxesToServer } from "@/lib/mailboxStore";
import { countUnseenMail } from "@/lib/unreadMail";
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
  "/cosmofeed-analytics": PieChart,
  "/cosmofeed-compare": GitCompare,
  "/spends": TrendingDown,
  "/investments": LineChart,
  "/balance-tracker": Scale,
  "/payment-methods": CreditCard,
  "/analytics": BarChart3,
  "/emails": Mail,
  "/email-setup": Settings2,
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
      "/cosmofeed-analytics",
      "/cosmofeed-compare",
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
    paths: ["/emails", "/email-setup", "/notifications", "/reminders", "/service-credentials", "/contact-messages", "/blocked-messages", "/account"],
  },
];

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/account": "Account",
  "/email-setup": "Email setup",
  "/follow-ups": "Follow-ups",
  "/gst": "GST",
  "/cosmofeed-analytics": "Cosmofeed analytics",
  "/cosmofeed-compare": "Cosmofeed compare",
  "/invoices/new": "New invoice",
  "/quotations/new": "New quotation",
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
                        ? "bg-gradient-to-r from-gold/25 to-gold/5 text-gold shadow-[inset_2px_0_0_#e8c36a]"
                        : "text-paper/65 hover:translate-x-0.5 hover:bg-gold/8 hover:text-gold",
                    )
                  }
                >
                  <Icon className="h-4 w-4 opacity-80" />
                  {titles[path] ?? path}
                  {path === "/emails" ? <NavMailBadge /> : null}
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
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-gold/20 bg-panel/95 pb-[var(--sab)] pl-[var(--sal)] pr-[var(--sar)] shadow-[0_-12px_40px_-24px_rgba(232,195,106,0.25)] backdrop-blur-md print:hidden lg:hidden"
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
              "relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition duration-200",
              on ? "text-gold" : "text-paper/50 hover:text-gold/80",
            )}
          >
            {on ? <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-gold shadow-[0_0_12px_#e8c36a]" /> : null}
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

function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto min-w-5 rounded-full bg-gold px-1.5 py-0.5 text-center text-[10px] font-bold text-ink">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function useUnseenMail() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["unseen-mail"],
    queryFn: countUnseenMail,
    refetchInterval: 30_000,
    enabled: Boolean(session) && canAccess(session?.role as RoleName | undefined, "/emails"),
  });
}

const QUICK_DOCK_KEY = "socilet.quickDock";

function useQuickDockOpen() {
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(QUICK_DOCK_KEY) !== "0";
    } catch {
      return true;
    }
  });
  function setOpen(next: boolean) {
    setOpenState(next);
    try {
      localStorage.setItem(QUICK_DOCK_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }
  return [open, setOpen] as const;
}

function QuickDock({ compact = false, onGo }: { compact?: boolean; onGo?: () => void }) {
  const { session } = useAuth();
  const loc = useLocation();
  const role = session?.role as RoleName | undefined;
  const unseen = useUnseenMail();
  const items = [
    { path: "/spends", label: "Spends" },
    { path: "/emails", label: "Emails" },
  ].filter((item) => canAccess(role, item.path));
  if (!items.length) return null;
  return (
    <div className={cn("grid gap-1", compact ? "" : "px-0")}>
      {items.map((item) => {
        const Icon = ICONS[item.path] ?? LayoutDashboard;
        const on = tabActive(item.path, loc.pathname);
        const mailCount = item.path === "/emails" ? unseen.data ?? 0 : 0;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onGo}
            className={cn(
              "relative flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-[13px] font-medium transition",
              compact ? "h-12 w-12 justify-center px-0" : "",
              on ? "bg-gradient-to-r from-gold/25 to-gold/5 text-gold" : "bg-gold/8 text-paper/80 hover:bg-gold/15 hover:text-gold",
            )}
            aria-label={mailCount ? `${item.label}, ${mailCount} unread` : item.label}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {compact ? null : <span className="min-w-0 truncate">{item.label}</span>}
            {item.path === "/emails" ? (
              compact ? (
                mailCount > 0 ? (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-gold px-1 text-[9px] font-bold text-ink">
                    {mailCount > 9 ? "9+" : mailCount}
                  </span>
                ) : null
              ) : (
                <UnreadBadge count={mailCount} />
              )
            ) : null}
          </NavLink>
        );
      })}
    </div>
  );
}

function NavMailBadge() {
  const unseen = useUnseenMail();
  return <UnreadBadge count={unseen.data ?? 0} />;
}

export function AppLayout() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  const [dockOpen, setDockOpen] = useQuickDockOpen();
  useEffect(() => {
    void restoreMailboxesToServer();
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);
  return (
    <div className="min-h-full min-w-0 lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="glass hidden border-r border-gold/15 p-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="mb-7 flex items-center gap-3 px-1">
          <img src="/socilet-logo.svg" alt="" className="brand-mark h-11 w-11 rounded-2xl ring-1 ring-gold/40" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-gold/80">Socilet</div>
            <div className="font-display text-xl leading-none">CRM</div>
          </div>
        </div>
        {dockOpen ? (
          <div className="mb-4 rounded-2xl border border-gold/20 bg-gold/5 p-2">
            <div className="mb-1 flex items-center justify-between px-1">
              <div className="text-[10px] uppercase tracking-[0.2em] text-paper/30">Quick</div>
              <button
                type="button"
                onClick={() => setDockOpen(false)}
                className="rounded-lg p-1 text-paper/45 hover:bg-gold/15 hover:text-gold"
                aria-label="Hide Spends and Emails"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <QuickDock />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setDockOpen(true)}
            className="mb-4 flex items-center justify-between rounded-xl border border-gold/20 bg-gold/5 px-3 py-2 text-[12px] text-paper/70 hover:border-gold/40 hover:text-gold"
          >
            Show Spends & Emails
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavList />
        </div>
      </aside>
      <div className="flex min-h-full min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex min-h-12 min-w-0 items-center justify-between gap-2 border-b border-gold/15 bg-panel/90 pb-2.5 pl-[max(0.75rem,var(--sal))] pr-[max(0.75rem,var(--sar))] pt-[calc(var(--sat)+0.65rem)] backdrop-blur-md sm:gap-3 sm:pb-3 sm:pl-4 sm:pr-4 sm:pt-[calc(var(--sat)+0.75rem)]">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <OverlayPortal open={open} onClose={() => setOpen(false)}>
              <div className="fixed inset-0 z-50 lg:hidden">
                <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/55" onClick={() => setOpen(false)} />
                <div className="sheet-scroll absolute inset-y-0 left-0 z-10 w-[min(18rem,88vw)] overflow-y-auto border-r border-line bg-panel p-4 pb-[max(1rem,var(--sab))] pt-[calc(var(--sat)+1rem)] pl-[max(1rem,var(--sal))]">
                  <div className="mb-4 text-sm text-gold">Modules</div>
                  <NavList onGo={() => setOpen(false)} />
                </div>
              </div>
            </OverlayPortal>
            <span className="lg:hidden flex items-center gap-2 font-display text-base">
              <img src="/socilet-logo.svg" alt="" className="h-8 w-8 rounded-xl ring-1 ring-gold/35" />
              Socilet
            </span>
            <ClockLabel />
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm sm:gap-3">
            <NotificationBell />
            <div className="hidden h-9 items-center rounded-full border border-gold/25 bg-gold/10 px-3 sm:flex">
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
        {dockOpen ? (
          <nav
            className="fixed left-[max(0.4rem,var(--sal))] top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 print:hidden lg:hidden"
            aria-label="Spends and email"
          >
            <QuickDock compact />
            <button
              type="button"
              onClick={() => setDockOpen(false)}
              className="flex h-8 w-12 items-center justify-center rounded-xl border border-gold/25 bg-panel/95 text-paper/50 shadow-sm hover:text-gold"
              aria-label="Hide Spends and Emails"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </nav>
        ) : (
          <button
            type="button"
            onClick={() => setDockOpen(true)}
            className="fixed left-[max(0.15rem,var(--sal))] top-1/2 z-30 flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-gold/30 bg-panel/95 text-gold shadow-sm print:hidden lg:hidden"
            aria-label="Show Spends and Emails"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        <main
          key={loc.pathname}
          className={cn(
            "page-enter min-w-0 max-w-full flex-1 overflow-x-hidden p-3 pb-[calc(4.5rem+var(--sab))] sm:p-4 md:p-8 lg:pb-[max(1.25rem,var(--sab))] lg:pl-8",
            dockOpen
              ? "pl-[max(4rem,calc(3.5rem+var(--sal)))] sm:pl-16 md:pl-16 lg:pl-8"
              : "pl-[max(0.85rem,calc(0.5rem+var(--sal)))] sm:pl-4 md:pl-8 lg:pl-8",
          )}
        >
          <Outlet />
        </main>
        <BottomBar onMore={() => setOpen(true)} />
      </div>
    </div>
  );
}
