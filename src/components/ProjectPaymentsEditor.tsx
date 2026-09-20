import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { applyProjectPayments, money, type ProjectPay } from "@/lib/projectPayments";
import { formatDay } from "@/lib/highlights";
import { inr, uid } from "@/lib/utils";

const METHODS = ["UPI", "Card", "Bank", "Cash", "Other"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function emptyPay(method = "", amount = 0): ProjectPay {
  return { id: uid(), date: today(), amount, method, note: "", invoice_id: "" };
}

export function ProjectPaymentsEditor({
  client,
  total,
  method,
  pays,
  onChange,
  invoices = [],
  openEnded = false,
}: {
  client: string;
  total: number;
  method: string;
  pays: ProjectPay[];
  onChange: (next: ProjectPay[]) => void;
  invoices?: { id: string; label: string }[];
  openEnded?: boolean;
}) {
  const received = money(applyProjectPayments({ total_amount: total }, pays).advance_amount);
  const remaining = Math.max(0, money(total) - received);
  const who = client.trim() || "this client";

  function patch(id: string, part: Partial<ProjectPay>) {
    onChange(pays.map((p) => (p.id === id ? { ...p, ...part } : p)));
  }

  return (
    <div className="grid gap-2 rounded-xl border border-gold/25 bg-gold/5 p-3">
      <div>
        <Label>{openEnded ? `Collections from ${who}` : `Payments from ${who}`}</Label>
        <p className="mt-0.5 text-xs text-paper/50">
          {openEnded
            ? "Har month jab retainer aaye, date + amount yahan likho. Available balance inhi collections se update hota hai."
            : "Zero advance theek hai. Beech ki partial aur project date ke baad ki full payment — date ke sath yahin add karo."}
        </p>
      </div>
      {!openEnded ? (
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-gold/25 bg-panel px-2 py-0.5">Received {inr(received)}</span>
          <span className="rounded-full border border-gold/25 bg-panel px-2 py-0.5">Remaining {inr(remaining)}</span>
        </div>
      ) : (
        <div className="text-[11px] text-paper/60">Collected {inr(received)}</div>
      )}
      {pays.length ? (
        <div className="grid gap-2">
          {pays.map((p, i) => (
            <div key={p.id} className="grid gap-2 rounded-xl border border-gold/20 bg-panel p-2 sm:grid-cols-[7rem_1fr_7rem_auto] sm:items-end">
              <div className="grid gap-1">
                <span className="text-[10px] uppercase tracking-wide text-paper/40">Date</span>
                <Input type="date" value={p.date} onChange={(e) => patch(p.id, { date: e.target.value })} />
              </div>
              <div className="grid gap-1 sm:col-span-1">
                <span className="text-[10px] uppercase tracking-wide text-paper/40">Amount · {who}</span>
                <Input
                  type="number"
                  step="1"
                  value={Number.isFinite(p.amount) ? p.amount : 0}
                  onChange={(e) => patch(p.id, { amount: money(e.target.value) })}
                />
              </div>
              <div className="grid gap-1">
                <span className="text-[10px] uppercase tracking-wide text-paper/40">Method</span>
                <select
                  className="h-11 w-full rounded-xl border border-gold/20 bg-ink/70 px-3 text-base sm:h-10 sm:text-sm"
                  value={METHODS.includes(p.method) ? p.method : p.method ? "Other" : method || "UPI"}
                  onChange={(e) => patch(p.id, { method: e.target.value })}
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove payment ${i + 1}`} onClick={() => onChange(pays.filter((x) => x.id !== p.id))}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="grid gap-1 sm:col-span-4">
                <span className="text-[10px] uppercase tracking-wide text-paper/40">Note</span>
                <Input
                  placeholder="e.g. first partial, or full after delivery"
                  value={p.note}
                  onChange={(e) => patch(p.id, { note: e.target.value })}
                />
              </div>
              {invoices.length ? (
                <div className="grid gap-1 sm:col-span-4">
                  <span className="text-[10px] uppercase tracking-wide text-paper/40">Linked invoice (avoid double count)</span>
                  <select
                    className="h-11 w-full rounded-xl border border-gold/20 bg-ink/70 px-3 text-base sm:h-10 sm:text-sm"
                    value={p.invoice_id || ""}
                    onChange={(e) => patch(p.id, { invoice_id: e.target.value })}
                  >
                    <option value="">Not an invoice — count as project cash only</option>
                    {invoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-paper/50">Abhi koi payment nahi — advance 0. Jab client pay kare, date ke sath amount add karo.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...pays, emptyPay(method || "UPI")])}>
          <Plus className="h-3.5 w-3.5" />
          Add payment
        </Button>
        {remaining > 0 && !openEnded ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange([
                ...pays,
                { ...emptyPay(method || "UPI", remaining), note: pays.length ? "Balance after project date" : "Full payment" },
              ])
            }
          >
            Add remaining {inr(remaining)}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ProjectPaymentTrail({
  client,
  pays,
}: {
  client?: string;
  pays: ProjectPay[];
}) {
  if (!pays.length) {
    return <p className="text-xs text-paper/45">No dated payments yet (advance 0).</p>;
  }
  const who = (client || "").trim();
  return (
    <ol className="grid gap-1">
      {pays.map((p) => (
        <li key={p.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 text-xs">
          <span className="min-w-0 truncate text-paper/70">
            {formatDay(p.date)}
            {who ? ` · ${who}` : ""}
            {p.method ? ` · ${p.method}` : ""}
            {p.note ? ` · ${p.note}` : ""}
            {p.invoice_id ? " · invoice-linked" : ""}
          </span>
          <span className="shrink-0 font-medium text-mint">{inr(p.amount)}</span>
        </li>
      ))}
    </ol>
  );
}
