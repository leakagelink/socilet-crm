import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { moduleById } from "@/lib/modules";
import { listRecords, type RecordRow } from "@/lib/db";
import { convertQuoteToInvoice, ensureShareToken, markInvoicePaid } from "@/lib/pipeline";
import { loadFirm } from "@/lib/firm";
import { asTemplate, type DocView } from "@/lib/docTemplates";
import { DocSheet } from "@/components/DocSheet";

function str(v: unknown) {
  return String(v ?? "").trim();
}

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function rowToDocView(kind: "invoice" | "quote", row: RecordRow, client?: RecordRow): DocView {
  return {
    kind,
    title: kind === "quote" ? "Quotation" : "Invoice",
    number: str(row.data.quote_no || row.data.invoice_no),
    date: str(row.created_at).slice(0, 10),
    due: str(row.data.due_date) || undefined,
    validUntil: str(row.data.valid_until) || undefined,
    client: str(row.data.client) || str(client?.data.name),
    clientEmail: str(row.data.client_email) || str(client?.data.email),
    clientPhone: str(row.data.client_phone) || str(client?.data.phone),
    clientGstin: str(row.data.client_gstin) || str(client?.data.gstin),
    clientAddress: str(row.data.client_address) || str(client?.data.address),
    project: str(row.data.project_name),
    item: str(row.data.item) || str(row.data.project_name),
    amount: num(row.data.amount),
    gst: num(row.data.gst_amount),
    notes: str(row.data.notes),
    paymentMethod: str(row.data.payment_method),
    paymentDetails: str(row.data.payment_details),
    status: str(row.data.status),
    template: asTemplate(row.data.template),
  };
}

export function QuotationsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const convert = useMutation({
    mutationFn: convertQuoteToInvoice,
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <ModuleCrud
      module={moduleById("quotations")!}
      onNew={() => nav("/quotations/new")}
      onEdit={(row) => nav(`/quotations/${row.id}/edit`)}
      rowActions={(row) => (
        <>
          <Button size="sm" variant="outline" onClick={() => nav(`/quotations/${row.id}/edit`)}>
            Edit / preview
          </Button>
          <Button size="sm" variant="outline" disabled={convert.isPending} onClick={() => convert.mutate(row)}>
            To invoice
          </Button>
          <DocLinks kind="quote" row={row} />
        </>
      )}
    />
  );
}

export function InvoicesPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const pay = useMutation({
    mutationFn: markInvoicePaid,
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <ModuleCrud
      module={moduleById("invoices")!}
      onNew={() => nav("/invoices/new")}
      onEdit={(row) => nav(`/invoices/${row.id}/edit`)}
      rowActions={(row) => (
        <>
          <Button size="sm" variant="outline" onClick={() => nav(`/invoices/${row.id}/edit`)}>
            Edit / preview
          </Button>
          {str(row.data.status) !== "paid" ? (
            <Button size="sm" variant="outline" disabled={pay.isPending} onClick={() => pay.mutate(row)}>
              Mark paid
            </Button>
          ) : null}
          <DocLinks kind="invoice" row={row} />
        </>
      )}
    />
  );
}

function DocLinks({ kind, row }: { kind: "invoice" | "quote"; row: RecordRow }) {
  const nav = useNavigate();
  return (
    <>
      <Button size="sm" variant="outline" asChild>
        <Link to={`/print/${kind}/${row.id}`}>PDF</Link>
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          const print = `${window.location.origin}/print/${kind}/${row.id}`;
          const title = kind === "quote" ? "Quotation" : "Invoice";
          const no = str(row.data.quote_no || row.data.invoice_no);
          const subject = `${title} ${no}`;
          const body = `Hi ${str(row.data.client) || "there"},\n\nPlease find your ${title.toLowerCase()} ${no}.\nOpen / print: ${print}\n`;
          nav(
            `/emails?compose=1&to=${encodeURIComponent(str(row.data.client_email))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
          );
        }}
      >
        Email
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          const token = await ensureShareToken(row);
          const url = `${window.location.origin}/api/crm/doc/${token}`;
          await navigator.clipboard.writeText(url);
        }}
      >
        Copy link
      </Button>
    </>
  );
}

export function DocumentPrintPage() {
  const { kind, id } = useParams();
  const q = useQuery({
    queryKey: ["print-doc", kind, id],
    queryFn: async () => {
      const module = kind === "quote" ? "quotations" : "invoices";
      const [rows, firm, clients] = await Promise.all([listRecords(module), loadFirm(), listRecords("clients")]);
      const row = rows.find((r) => r.id === id);
      return { row, firm, clients };
    },
  });
  const row = q.data?.row;
  const client = useMemo(
    () =>
      q.data?.clients.find((c) => c.id === str(row?.data.client_id) || str(c.data.name) === str(row?.data.client)),
    [q.data, row],
  );

  if (q.isLoading) return <Card>Loading document…</Card>;
  if (!row || (kind !== "invoice" && kind !== "quote")) return <Card>Not found.</Card>;
  const doc = rowToDocView(kind, row, client);
  return (
    <div className="mx-auto grid max-w-3xl gap-4 print:max-w-none">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button onClick={() => window.print()}>Download PDF</Button>
        <Button variant="outline" asChild>
          <Link to={kind === "quote" ? `/quotations/${row.id}/edit` : `/invoices/${row.id}/edit`}>Edit</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to={kind === "quote" ? "/quotations" : "/invoices"}>Back</Link>
        </Button>
      </div>
      {q.data?.firm ? <DocSheet doc={doc} firm={q.data.firm} /> : null}
    </div>
  );
}
