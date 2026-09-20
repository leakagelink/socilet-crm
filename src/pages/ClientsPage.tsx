import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { moduleById } from "@/lib/modules";
import { listRecords, type RecordRow } from "@/lib/db";
import { clientMatch, waLink } from "@/lib/pipeline";
import { DateChip, ProjectCountdown, RemainingChip, StatusBadge } from "@/components/HighlightCell";
import { ProjectPaymentTrail } from "@/components/ProjectPaymentsEditor";
import { collectionCash, linkedInvoiceIds, parseCollections, parseProjectPayments, projectCashIn, projectReceipts } from "@/lib/projectPayments";
import { inr } from "@/lib/utils";

function str(v: unknown) {
  return String(v ?? "").trim();
}

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function ClientsPage() {
  return <ModuleCrud module={moduleById("clients")!} rowActions={(row) => <OpenClient row={row} />} />;
}

function OpenClient({ row }: { row: RecordRow }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link to={`/clients/${row.id}`}>Open</Link>
    </Button>
  );
}

export function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["client-desk", id],
    queryFn: async () => {
      const [clients, projects, quotes, invoices, emails, recurring] = await Promise.all([
        listRecords("clients"),
        listRecords("projects"),
        listRecords("quotations"),
        listRecords("invoices"),
        listRecords("emails"),
        listRecords("recurring_earnings"),
      ]);
      const client = clients.find((c) => c.id === id);
      if (!client) return null;
      const related = {
        projects: projects.filter((r) => clientMatch(r, client)),
        quotes: quotes.filter((r) => clientMatch(r, client)),
        invoices: invoices.filter((r) => clientMatch(r, client)),
        recurring: recurring.filter((r) => clientMatch(r, client)),
        emails: emails.filter(
          (r) =>
            str(r.data.to_addr).toLowerCase() === str(client.data.email).toLowerCase() ||
            str(r.data.to).toLowerCase() === str(client.data.email).toLowerCase(),
        ),
      };
      const linked = linkedInvoiceIds(related.projects);
      const openInvoices = related.invoices.filter((r) => !["paid", "void"].includes(str(r.data.status)) && !linked.has(r.id));
      const pending =
        related.projects.reduce((a, r) => {
          const st = str(r.data.status).toLowerCase();
          if (st === "completed" || st === "done") return a;
          return a + num(r.data.remaining_amount);
        }, 0) + openInvoices.reduce((a, r) => a + num(r.data.amount), 0);
      const received =
        related.projects.reduce((a, r) => a + projectCashIn(r), 0) +
        related.recurring.reduce((a, r) => a + collectionCash(r), 0) +
        related.invoices
          .filter((r) => str(r.data.status).toLowerCase() === "paid" && !linked.has(r.id))
          .reduce((a, r) => a + num(r.data.amount), 0);
      const lines = [
        ...related.projects.flatMap((r) =>
          projectReceipts(r).map((p) => ({
            date: p.date,
            label: p.title,
            method: p.method,
            amount: p.amount,
          })),
        ),
        ...related.recurring.flatMap((r) =>
          parseCollections(r.data).map((c) => ({
            date: c.date,
            label: `${str(r.data.name) || "Recurring"} collection`,
            method: c.method,
            amount: c.amount,
          })),
        ),
        ...related.invoices
          .filter((r) => str(r.data.status).toLowerCase() === "paid" && !linked.has(r.id))
          .map((r) => ({
            date: str(r.data.paid_at || r.data.due_date || r.created_at).slice(0, 10),
            label: str(r.data.invoice_no) || "Invoice",
            method: str(r.data.payment_method),
            amount: num(r.data.amount),
          })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      return { client, related, pending, received, lines, openInvoices };
    },
  });
  const d = q.data;
  if (q.isLoading) return <Card>Loading client…</Card>;
  if (!d) {
    return (
      <Card className="grid gap-3">
        <p>Client not found.</p>
        <Button variant="outline" onClick={() => navigate("/clients")}>
          Back
        </Button>
      </Card>
    );
  }
  const c = d.client;
  const wa = waLink(str(c.data.phone), `Namaste ${str(c.data.name)},`);
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader kicker="Clients" title={str(c.data.name)} description={str(c.data.company) || "Client desk"} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => navigate("/clients")}>
          All clients
        </Button>
        {wa ? (
          <Button variant="outline" asChild>
            <a href={wa} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          </Button>
        ) : null}
        <Button variant="outline" onClick={() => window.print()}>
          Print statement
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <div className="text-xs text-paper/45">Received</div>
          <div className="font-display text-2xl text-mint">{inr(d.received)}</div>
        </Card>
        <Card>
          <div className="text-xs text-paper/45">Pending</div>
          <div className="font-display text-2xl text-amber-300">{inr(d.pending)}</div>
        </Card>
        <Card>
          <div className="text-xs text-paper/45">Email</div>
          <div className="break-all text-sm">{str(c.data.email) || "—"}</div>
        </Card>
        <Card>
          <div className="text-xs text-paper/45">Phone</div>
          <div className="text-sm">{str(c.data.phone) || "—"}</div>
        </Card>
        <Card>
          <div className="text-xs text-paper/45">GSTIN</div>
          <div className="text-sm">{str(c.data.gstin) || "—"}</div>
        </Card>
      </div>
      <Section
        title="Projects"
        rows={d.related.projects}
        href="/projects"
        render={(r) => (
          <div className="grid min-w-0 gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-medium">{str(r.data.name)}</span>
              <StatusBadge value={r.data.status} />
              <DateChip value={r.data.start_date} field="start_date" label="Start" />
              <DateChip value={r.data.end_date} field="end_date" label="End" />
              <DateChip value={r.data.deadline} field="deadline" label="Due" />
              <ProjectCountdown data={r.data} />
              <span className="text-paper/55">{inr(num(r.data.remaining_amount))} pending</span>
            </div>
            <ProjectPaymentTrail client={str(r.data.client) || str(c.data.name)} pays={parseProjectPayments(r.data)} />
          </div>
        )}
      />
      <Section
        title="Recurring"
        rows={d.related.recurring}
        href="/recurring-earnings"
        render={(r) => (
          <div className="grid min-w-0 gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-medium">{str(r.data.name)}</span>
              <span>{inr(collectionCash(r))} collected</span>
            </div>
            <ProjectPaymentTrail client={str(c.data.name)} pays={parseCollections(r.data)} />
          </div>
        )}
      />
      <Section
        title="Quotes"
        rows={d.related.quotes}
        href="/quotations"
        render={(r) => (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span>{str(r.data.quote_no)}</span>
            <StatusBadge value={r.data.status} />
            <DateChip value={r.data.valid_until} field="valid_until" />
            <RemainingChip value={r.data.valid_until} />
            <span>{inr(num(r.data.amount))}</span>
          </div>
        )}
      />
      <Section
        title="Invoices"
        rows={d.related.invoices}
        href="/invoices"
        render={(r) => (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span>{str(r.data.invoice_no)}</span>
            <StatusBadge value={r.data.status} />
            <DateChip value={r.data.due_date} field="due_date" />
            <RemainingChip value={r.data.due_date} />
            <span>{inr(num(r.data.amount))}</span>
          </div>
        )}
      />
      <Section title="Emails" rows={d.related.emails} href="/emails" render={(r) => <span>{str(r.data.subject) || str(r.data.to_addr) || "Mail"}</span>} />
      <Card className="min-w-0 print:border-0 print:shadow-none">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-lg">Statement</h2>
          <span className="text-xs text-paper/45">{d.lines.length} receipts</span>
        </div>
        {d.lines.length === 0 ? <p className="text-sm text-paper/45">No dated receipts yet.</p> : null}
        <div className="grid gap-1">
          {d.lines.map((line, i) => (
            <div key={`${line.date}-${i}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-gold/15 py-1.5 text-sm">
              <span className="text-paper/50">{line.date}</span>
              <span className="min-w-0 truncate">
                {line.label}
                {line.method ? <span className="text-paper/40"> · {line.method}</span> : null}
              </span>
              <span className="font-medium text-mint">{inr(line.amount)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm">
          <span>Received {inr(d.received)}</span>
          <span>Pending {inr(d.pending)}</span>
        </div>
        {d.openInvoices.length ? (
          <p className="mt-2 text-xs text-paper/45">{d.openInvoices.length} open invoice(s) not linked to a project payment.</p>
        ) : null}
      </Card>
    </div>
  );
}

function Section({
  title,
  rows,
  href,
  render,
}: {
  title: string;
  rows: RecordRow[];
  href: string;
  render: (r: RecordRow) => ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-display text-lg">{title}</h2>
        <Link to={href} className="text-xs text-gold">
          Open module
        </Link>
      </div>
      {rows.length === 0 ? <p className="text-sm text-paper/45">None yet.</p> : null}
      <div className="grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-gold/20 px-3 py-2 text-sm">
            {render(r)}
          </div>
        ))}
      </div>
    </Card>
  );
}
