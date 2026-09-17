import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, LogOut } from "lucide-react";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MODULES } from "@/lib/modules";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { cn } from "@/lib/utils";

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
    <nav className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.name}>
          <div className="mb-1 px-3 text-[10px] uppercase tracking-[0.18em] text-paper/35">{g.name}</div>
          <div className="flex flex-col gap-0.5">
            {g.paths.map((path) => (
              <NavLink
                key={path}
                to={path}
                end={path === "/"}
                onClick={onGo}
                className={({ isActive }) =>
                  cn(
                    "rounded-lg px-3 py-1.5 text-[13px] transition duration-200",
                    isActive
                      ? "bg-gold/15 text-gold shadow-[inset_2px_0_0_#e8c36a]"
                      : "text-paper/70 hover:bg-white/5 hover:text-paper",
                  )
                }
              >
                {titles[path] ?? path}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AppLayout() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="glass hidden border-r border-white/5 p-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">
        <div className="mb-6 flex items-center gap-3 px-1">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gold font-display text-lg text-ink">S</div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-gold/80">Socilet</div>
            <div className="font-display text-lg leading-none">CRM</div>
          </div>
        </div>
        <NavList />
      </aside>
      <div className="flex min-h-screen flex-col">
        <header className="glass sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <Dialog.Root open={open} onOpenChange={setOpen}>
              <Dialog.Trigger asChild>
                <Button className="lg:hidden" variant="outline" size="icon" aria-label="Open menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 lg:hidden" />
                <Dialog.Content className="glass fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-line p-4 lg:hidden">
                  <Dialog.Title className="mb-4 text-sm text-gold">Modules</Dialog.Title>
                  <NavList onGo={() => setOpen(false)} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <span className="lg:hidden font-display text-base">Socilet</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <NotificationBell />
            <span className="hidden max-w-40 truncate sm:inline text-paper/60">{session?.email}</span>
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
        <main key={loc.pathname} className="page-enter flex-1 p-4 md:p-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
