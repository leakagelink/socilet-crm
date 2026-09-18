import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ModuleCrud } from "@/pages/ModuleCrud";
import { moduleById } from "@/lib/modules";
import { listRecords, type RecordRow } from "@/lib/db";
import { convertQuoteToInvoice, ensureShareToken, markInvoicePaid } from "@/lib/pipeline";
import { loadFirm } from "@/lib/firm";
import { inr } from "@/lib/utils";

function str(v: unknown) {
  return String(v ?? "").trim();
}

function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function QuotationsPage() {
  const qc = useQueryClient();
  const convert = useMutation({
    mutationFn: convertQuoteToInvoice,
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <ModuleCrud
      module={moduleById("quotations")!}
      rowActions={(row) => (
        <>
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
  const pay = useMutation({
    mutationFn: markInvoicePaid,
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <ModuleCrud
      module={moduleById("invoices")!}
      rowActions={(row) => (
        <>
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
  return (
    <>
      <Button size="sm" variant="outline" asChild>
        <Link to={`/print/${kind}/${row.id}`}>PDF</Link>
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
  const firm = q.data?.firm;
  const client = q.data?.clients.find(
    (c) => c.id === str(row?.data.client_id) || str(c.data.name) === str(row?.data.client),
  );
  const amount = num(row?.data.amount);
  const gst = num(row?.data.gst_amount);
  const upi = str(client?.data.upi) || str(firm?.upi_id);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!upi || !amount) {
      setQr(null);
      return;
    }
    const uri = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(firm?.legal_name || "Socilet")}&am=${amount}&cu=INR`;
    void QRCode.toDataURL(uri, { width: 180, margin: 1 }).then(setQr);
  }, [upi, amount, firm?.legal_name]);

  if (q.isLoading) return <Card>Loading document…</Card>;
  if (!row) return <Card>Not found.</Card>;
  const title = kind === "quote" ? `Quotation ${str(row.data.quote_no)}` : `Invoice ${str(row.data.invoice_no)}`;
  return (
    <div className="mx-auto grid max-w-3xl gap-4 print:max-w-none">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button onClick={() => window.print()}>Print / Save PDF</Button>
        <Button variant="outline" asChild>
          <Link to={kind === "quote" ? "/quotations" : "/invoices"}>Back</Link>
        </Button>
      </div>
      <Card className="bg-white p-8 text-zinc-900">
        <div className="flex justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-zinc-500">Socilet CRM</div>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-sm">{firm?.legal_name}</p>
            {firm?.gstin ? <p className="text-sm">GSTIN {firm.gstin}</p> : null}
            {firm?.address ? <p className="text-sm whitespace-pre-wrap">{firm.address}</p> : null}
          </div>
          <div className="text-right text-sm">
            <div>Date {str(row.created_at).slice(0, 10)}</div>
            {kind === "invoice" ? <div>Due {str(row.data.due_date)}</div> : <div>Valid {str(row.data.valid_until)}</div>}
            <div>Status {str(row.data.status)}</div>
          </div>
        </div>
        <hr className="my-4 border-zinc-200" />
        <div className="text-sm">
          <div className="font-semibold">Bill to</div>
          <div>{str(row.data.client) || str(client?.data.name)}</div>
          <div>{str(row.data.client_email) || str(client?.data.email)}</div>
          <div>{str(row.data.client_phone) || str(client?.data.phone)}</div>
          {str(client?.data.gstin) ? <div>GSTIN {str(client?.data.gstin)}</div> : null}
        </div>
        <table className="mt-6 w-full text-sm">
          <tbody>
            <tr>
              <td>Amount</td>
              <td className="text-right">{inr(amount)}</td>
            </tr>
            <tr>
              <td>GST</td>
              <td className="text-right">{inr(gst)}</td>
            </tr>
            <tr className="font-semibold">
              <td>Total</td>
              <td className="text-right">{inr(amount + gst)}</td>
            </tr>
          </tbody>
        </table>
        {qr ? (
          <div className="mt-6 grid justify-items-start gap-1 text-sm">
            <div>Pay by UPI {upi}</div>
            <img src={qr} alt="UPI QR" className="h-36 w-36" />
          </div>
        ) : null}
        {str(row.data.notes) ? <p className="mt-4 text-sm whitespace-pre-wrap">{str(row.data.notes)}</p> : null}
      </Card>
    </div>
  );
}
