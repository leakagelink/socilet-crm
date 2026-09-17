import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Menu, LogOut } from "lucide-react";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MODULES } from "@/lib/modules";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [{ path: "/", title: "Dashboard" }, ...MODULES.map((m) => ({ path: m.path, title: m.title }))];

function NavList({ onGo }: { onGo?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {links.map((l) => (
        <NavLink
          key={l.path}
          to={l.path}
          end={l.path === "/"}
          onClick={onGo}
          className={({ isActive }) =>
            cn(
              "rounded-lg px-3 py-2 text-sm",
              isActive ? "bg-gold/15 text-gold" : "text-paper/75 hover:bg-line/50 hover:text-paper",
            )
          }
        >
          {l.title}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppLayout() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-line bg-panel/50 p-4 lg:block">
        <div className="mb-6 px-2">
          <div className="text-xs uppercase tracking-[0.2em] text-gold/80">Socilet</div>
          <div className="text-lg font-semibold">CRM</div>
        </div>
        <NavList />
      </aside>
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <Dialog.Root open={open} onOpenChange={setOpen}>
              <Dialog.Trigger asChild>
                <Button className="lg:hidden" variant="outline" size="icon" aria-label="Open menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 lg:hidden" />
                <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 overflow-y-auto border-r border-line bg-panel p-4 lg:hidden">
                  <Dialog.Title className="mb-4 text-sm text-gold">Modules</Dialog.Title>
                  <NavList onGo={() => setOpen(false)} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <span className="lg:hidden text-sm font-medium">Socilet CRM</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-paper/70">{session?.email}</span>
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
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
