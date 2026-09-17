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
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MODULES } from "@/lib/modules";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { restoreMailboxesToServer } from "@/lib/mailboxStore";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/projects": FolderKanban,
  "/tasks": CheckSquare,
  "/quotations": FileText,
  "/ai-analyzer": Sparkles,
  "/invoices": Receipt,
  "/digital-products": Package,
  "/recurring-earnings": Repeat,
  "/other-income": Wallet,
  "/cosmofeed": Radio,
  "/spends": TrendingDown,
  "/investments": LineChart,
  "/balance-tracker": Scale,
  "/payment-methods": CreditCard,
  "/analytics": BarChart3,
  "/emails": Mail,
  "/notifications": Bell,
  "/reminders": Clock,
  "/service-credentials": KeyRound,
  "/blocked-messages": Ban,
};

const groups = [
  { name: "Work", paths: ["/", "/projects", "/tasks", "/quotations", "/ai-analyzer"] },
  {
    name: "Finance",
    paths: [
      "/invoices",
      "/digital-products",
      "/recurring-earnings",
      "/other-income",
      "/cosmofeed",
      "/spends",
      "/investments",
      "/balance-tracker",
      "/payment-methods",
      "/analytics",
    ],
  },
  {
    name: "Ops",
    paths: ["/emails", "/notifications", "/reminders", "/service-credentials", "/blocked-messages"],
  },
];

const titles: Record<string, string> = {
  "/": "Dashboard",
  ...Object.fromEntries(MODULES.map((m) => [m.path, m.title])),
};

function NavList({ onGo }: { onGo?: () => void }) {
  return (
    <nav className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.name}>
          <div className="mb-1.5 px-3 text-[10px] uppercase tracking-[0.2em] text-paper/30">{g.name}</div>
          <div className="flex flex-col gap-0.5">
            {g.paths.map((path) => {
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
      ))}
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
  }, []);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
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
      <div className="flex min-h-screen flex-col">
        <header className="glass sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          <div className="flex items-center gap-3">
            <Dialog.Root open={open} onOpenChange={setOpen}>
              <Dialog.Trigger asChild>
                <Button className="lg:hidden" variant="outline" size="icon" aria-label="Open menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/55 backdrop-blur-sm lg:hidden" />
                <Dialog.Content className="glass fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-line p-4 lg:hidden">
                  <Dialog.Title className="mb-4 text-sm text-gold">Modules</Dialog.Title>
                  <NavList onGo={() => setOpen(false)} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <span className="lg:hidden font-display text-base">Socilet</span>
            <ClockLabel />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <NotificationBell />
            <div className="hidden h-9 items-center rounded-full border border-white/10 bg-white/5 px-3 sm:flex">
              <span className="max-w-40 truncate text-paper/70">{session?.email}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </header>
        <main key={loc.pathname} className="page-enter flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
