import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendAgentChat } from "@/lib/aiClient";
import { cn } from "@/lib/utils";

export function AgentDock() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const chat = useMutation({
    mutationFn: sendAgentChat,
    onSuccess: (res) => setReply(res.data.reply),
  });

  return (
    <div className="pointer-events-none fixed bottom-[calc(4.75rem+var(--sab))] right-[max(0.75rem,var(--sar))] z-40 print:hidden lg:bottom-6 lg:right-6">
      {open ? (
        <div className="pointer-events-auto mb-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-gold/30 bg-panel p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium text-gold">Socilet OS</div>
            <button type="button" className="text-paper/50 hover:text-paper" onClick={() => setOpen(false)} aria-label="Close agent">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-2 text-[11px] text-paper/45">CRM pe soch ke jawab. Full desk: Agent page.</p>
          {reply ? <div className="mb-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-paper/80">{reply}</div> : null}
          {chat.isError ? <p className="mb-2 text-xs text-red-400">{(chat.error as Error).message}</p> : null}
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const msg = draft.trim();
              if (!msg) return;
              chat.mutate(msg);
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-9 rounded-xl border border-gold/25 bg-ink/40 px-3 text-sm"
              placeholder="Kal kya karna hai?"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={chat.isPending}>
                {chat.isPending ? "…" : "Ask"}
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <Link to="/agent">Open desk</Link>
              </Button>
            </div>
          </form>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/40 bg-gold text-[#0b1624] shadow-lg",
        )}
        aria-label="Open Socilet OS"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    </div>
  );
}
