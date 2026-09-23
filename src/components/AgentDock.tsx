import { Link, useLocation } from "react-router-dom";
import { Sparkles } from "lucide-react";

export function AgentDock() {
  const loc = useLocation();
  if (loc.pathname === "/agent") return null;
  return (
    <Link
      to="/agent"
      className="fixed bottom-[calc(4.75rem+var(--sab))] right-[max(0.75rem,var(--sar))] z-40 flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/40 bg-gold text-[#0b1624] print:hidden lg:bottom-6 lg:right-6"
      aria-label="Open AI Agent"
    >
      <Sparkles className="h-5 w-5" />
    </Link>
  );
}
