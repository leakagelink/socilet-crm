import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Copy } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { listRecords } from "@/lib/db";
import { projectCashIn } from "@/lib/projectPayments";
import { expectedInterest, expectedTotal, installmentAmount } from "@/lib/lendBorrow";
import {
  GST_RATE,
  advanceFromPercent,
  digitalProfit,
  gstExclusive,
  gstInclusive,
  projectSplit,
  remainingInstallments,
  rupees,
} from "@/lib/calc";
import { inr } from "@/lib/utils";

const TABS = [
  ["project", "Project advance"],
  ["gst", "Invoice GST"],
  ["lend", "Lend / borrow"],
  ["digital", "Digital product"],
] as const;

type Tab = (typeof TABS)[number][0];

const PCTS = [20, 30, 40, 50, 70];

function moneyInput(value: number, onChange: (n: number) => void, id: string) {
  return (
    <Input
      id={id}
      type="number"
      min={0}
      step="1"
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(rupees(e.target.value))}
    />
  );
}

function Result({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gold/20 bg-gold/8 p-3">
      <div className="text-[10px] uppercase tracking-wide text-paper/45">{label}</div>
      <div className="font-display text-2xl text-mint">{inr(value)}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-paper/45">{hint}</div> : null}
    </div>
  );
}

export function CalculatorPage() {
  const [tab, setTab] = useState<Tab>("project");
  const [copied, setCopied] = useState("");

  const projects = useQuery({
    queryKey: ["module", "projects"],
    queryFn: () => listRecords("projects"),
  });

  const [projectId, setProjectId] = useState("");
  const [total, setTotal] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [pct, setPct] = useState(50);
  const [parts, setParts] = useState(1);
  const [withGst, setWithGst] = useState(false);

  const [gstMode, setGstMode] = useState<"ex" | "inc">("ex");
  const [gstAmt, setGstAmt] = useState(0);

  const [principal, setPrincipal] = useState(0);
  const [roi, setRoi] = useState(0);
  const [payout, setPayout] = useState("monthly");
  const [start, setStart] = useState("");
  const [due, setDue] = useState("");

  const [cost, setCost] = useState(0);
  const [sale, setSale] = useState(0);

  const split = projectSplit(total, advance);
  const gstOnProject = withGst ? gstExclusive(total) : null;
  const later = remainingInstallments(split.remaining, parts);
  const gstRow = gstMode === "ex" ? gstExclusive(gstAmt) : gstInclusive(gstAmt);
  const lendTotal = expectedTotal(principal, roi);
  const lendEmi = installmentAmount({
    amount: principal,
    roi_percent: roi,
    payout,
    start_date: start,
    due_date: due,
  });
  const digi = digitalProfit(cost, sale);

  const live = useMemo(() => projects.data ?? [], [projects.data]);

  function pickProject(id: string) {
    setProjectId(id);
    const row = live.find((r) => r.id === id);
    if (!row) return;
    const t = rupees(row.data.total_amount);
    const rec = projectCashIn(row);
    setTotal(t);
    setAdvance(rec);
    setPct(t ? Math.round((rec / t) * 100) : 0);
  }

  function applyPct(p: number) {
    setPct(p);
    setAdvance(advanceFromPercent(total, p));
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text.slice(0, 24));
      setTimeout(() => setCopied(""), 1600);
    } catch {
      /* ignore */
    }
  }

  const projectNote = [
    projectId ? live.find((r) => r.id === projectId)?.data.name : "Project",
    `Total ${inr(total)}`,
    `Advance ${inr(split.received)} (${split.percent}%)`,
    `Remaining ${inr(split.remaining)}`,
    withGst ? `GST 18% ${inr(gstOnProject?.gst ?? 0)} · Grand ${inr(gstOnProject?.grand ?? 0)}` : "",
    later.length > 1 ? `Later: ${later.map((n, i) => `#${i + 1} ${inr(n)}`).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader
        kicker="Finance"
        title="Advance calculator"
        description="Projects jaisa remaining = total − advance. Invoice GST 18%, lend ROI aur digital profit bhi yahi rules."
        actions={
          copied ? (
            <span className="text-xs text-mint">Copied</span>
          ) : (
            <Button variant="outline" size="sm" onClick={() => copyText(projectNote)} disabled={tab !== "project"}>
              <Copy className="h-3.5 w-3.5" />
              Copy split
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-1 rounded-full border border-gold/25 bg-gold/8 p-1 sm:flex sm:w-fit">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-3 py-2 text-[12px] ${tab === id ? "bg-gold/25 text-gold" : "text-paper/55 hover:text-paper"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "project" ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="grid gap-3 p-4">
            <div className="grid gap-1">
              <Label htmlFor="proj">Existing project (optional)</Label>
              <select
                id="proj"
                className="h-11 w-full rounded-xl border border-gold/20 bg-ink/70 px-3 text-sm"
                value={projectId}
                onChange={(e) => pickProject(e.target.value)}
              >
                <option value="">Blank — type amounts</option>
                {live.map((r) => (
                  <option key={r.id} value={r.id}>
                    {String(r.data.name || "Project")} · {inr(rupees(r.data.total_amount))}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="total">Project total (INR)</Label>
                {moneyInput(total, setTotal, "total")}
              </div>
              <div className="grid gap-1">
                <Label htmlFor="adv">Advance / received (INR)</Label>
                {moneyInput(advance, (n) => {
                  setAdvance(n);
                  setPct(n && total ? Math.round((n / total) * 100) : 0);
                }, "adv")}
              </div>
            </div>
            <div>
              <div className="mb-1 text-sm text-paper/80">Advance %</div>
              <div className="flex flex-wrap gap-1.5">
                {PCTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyPct(p)}
                    className={`rounded-full border px-3 py-1 text-xs ${pct === p ? "border-gold bg-gold/20 text-gold" : "border-gold/20 text-paper/60"}`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
              <Input
                className="mt-2"
                type="number"
                min={0}
                max={100}
                value={pct}
                onChange={(e) => applyPct(rupees(e.target.value))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="parts">Remaining in how many payments</Label>
                <Input
                  id="parts"
                  type="number"
                  min={1}
                  max={12}
                  value={parts}
                  onChange={(e) => setParts(Math.max(1, Math.round(rupees(e.target.value)) || 1))}
                />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm text-paper/70">
                <input type="checkbox" checked={withGst} onChange={(e) => setWithGst(e.target.checked)} />
                Add 18% GST on total (invoice rule)
              </label>
            </div>
          </Card>
          <div className="grid gap-3">
            <Result label="Advance to collect now" value={split.received} hint={`${split.percent}% of total`} />
            <Result label="Remaining (CRM)" value={split.remaining} hint="total − received" />
            {withGst && gstOnProject ? (
              <>
                <Result label="GST 18%" value={gstOnProject.gst} />
                <Result label="Grand (total + GST)" value={gstOnProject.grand} />
              </>
            ) : null}
            {later.map((n, i) => (
              <Result key={i} label={later.length === 1 ? "Final payment" : `Later payment ${i + 1}`} value={n} />
            ))}
          </div>
        </div>
      ) : null}

      {tab === "gst" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="grid gap-3 p-4">
            <p className="text-sm text-paper/55">Quotes/invoices default GST is {Math.round(GST_RATE * 100)}% of amount, same as composer.</p>
            <div className="flex gap-2">
              <Button variant={gstMode === "ex" ? "default" : "outline"} type="button" onClick={() => setGstMode("ex")}>
                Amount + GST
              </Button>
              <Button variant={gstMode === "inc" ? "default" : "outline"} type="button" onClick={() => setGstMode("inc")}>
                Inclusive total
              </Button>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="gstamt">{gstMode === "ex" ? "Taxable amount" : "Grand total (incl. GST)"}</Label>
              {moneyInput(gstAmt, setGstAmt, "gstamt")}
            </div>
          </Card>
          <div className="grid gap-3">
            <Result label="Base" value={gstRow.base} />
            <Result label="GST" value={gstRow.gst} />
            <Result label="Invoice total" value={gstRow.grand} />
          </div>
        </div>
      ) : null}

      {tab === "lend" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="grid gap-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="prin">Principal</Label>
                {moneyInput(principal, setPrincipal, "prin")}
              </div>
              <div className="grid gap-1">
                <Label htmlFor="roi">ROI %</Label>
                {moneyInput(roi, setRoi, "roi")}
              </div>
              <div className="grid gap-1">
                <Label htmlFor="pay">Payout</Label>
                <select
                  id="pay"
                  className="h-11 rounded-xl border border-gold/20 bg-ink/70 px-3 text-sm"
                  value={payout}
                  onChange={(e) => setPayout(e.target.value)}
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="one_time">Ek saath</option>
                  <option value="ongoing">Ongoing</option>
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="st">Start</Label>
                <Input id="st" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="grid gap-1 sm:col-span-2">
                <Label htmlFor="due">Wapas date</Label>
                <Input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
              </div>
            </div>
          </Card>
          <div className="grid gap-3">
            <Result label="Interest (ROI)" value={expectedInterest(principal, roi)} />
            <Result label="Principal + ROI" value={lendTotal} hint="Lend/Borrow expected return" />
            <Result label="Installment" value={lendEmi} hint={payout.replaceAll("_", " ")} />
          </div>
        </div>
      ) : null}

      {tab === "digital" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="grid gap-3 p-4">
            <div className="grid gap-1">
              <Label htmlFor="cost">Cost (original)</Label>
              {moneyInput(cost, setCost, "cost")}
            </div>
            <div className="grid gap-1">
              <Label htmlFor="sale">Resell / sale</Label>
              {moneyInput(sale, setSale, "sale")}
            </div>
          </Card>
          <div className="grid gap-3">
            <Result label="Profit" value={digi.profit} hint="sale − cost, same as Digital Products" />
            <Result label="Sale" value={digi.sale} />
          </div>
        </div>
      ) : null}

      <p className="flex items-center gap-2 text-xs text-paper/40">
        <Calculator className="h-3.5 w-3.5" />
        Numbers stay on this page until you save a real project, invoice, or lend row.
      </p>
    </div>
  );
}
