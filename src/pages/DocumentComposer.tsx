import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { insertRecord, listRecords, updateRecord, type RecordRow } from "@/lib/db";
import { loadFirm } from "@/lib/firm";
import { defaultPay, payLabel, paySnapshot } from "@/lib/payments";
import { DOC_TEMPLATES, asTemplate, type DocView } from "@/lib/docTemplates";
import { DocSheet } from "@/components/DocSheet";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { uid } from "@/lib/utils";
import { clientMatch } from "@/lib/pipeline";

function str(v: unknown) {
  return String(v ?? "").trim();
}
function num(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

type Kind = "invoice" | "quote";

function listKey(kind: Kind) {
  return kind === "quote" ? "/quotations" : "/invoices";
}

function moduleId(kind: Kind) {
  return kind === "quote" ? "quotations" : "invoices";
}

export function DocumentComposer({ kind }: { kind: Kind }) {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const pack = useQuery({
    queryKey: ["doc-composer", kind, id],
    queryFn: async () => {
      const [docs, clients, projects, pays, firm] = await Promise.all([
        listRecords(moduleId(kind)),
        listRecords("clients"),
        listRecords("projects"),
        listRecords("payment_methods"),
        loadFirm(),
      ]);
      return { docs, clients, projects, pays, firm, row: id ? docs.find((r) => r.id === id) : undefined };
    },
  });

  const [clientQ, setClientQ] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [client, setClient] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientGstin, setClientGstin] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState("");
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState(0);
  const [gst, setGst] = useState(0);
  const [gstTouched, setGstTouched] = useState(false);
  const [due, setDue] = useState("");
  const [valid, setValid] = useState("");
  const [payId, setPayId] = useState("");
  const [template, setTemplate] = useState("classic");
  const [notes, setNotes] = useState("");
  const [number, setNumber] = useState("");
  const [status, setStatus] = useState(kind === "quote" ? "draft" : "due");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(false);
  }, [id]);

  useEffect(() => {
    const data = pack.data;
    if (!data || hydrated) return;
    const row = data.row;
    const pay = defaultPay(data.pays.filter((p) => p.data.active !== false));
    if (row) {
      setNumber(str(row.data.invoice_no || row.data.quote_no));
      setClientId(str(row.data.client_id));
      setClient(str(row.data.client));
      setClientEmail(str(row.data.client_email));
      setClientPhone(str(row.data.client_phone));
      setClientGstin(str(row.data.client_gstin));
      setClientAddress(str(row.data.client_address));
      setProjectId(str(row.data.project_id));
      setProject(str(row.data.project_name));
      setItem(str(row.data.item));
      setAmount(num(row.data.amount));
      setGst(num(row.data.gst_amount));
      setGstTouched(true);
      setDue(str(row.data.due_date));
      setValid(str(row.data.valid_until));
      setNotes(str(row.data.notes));
      setStatus(str(row.data.status) || status);
      setTemplate(str(row.data.template) || "classic");
      const named = data.pays.find((p) => p.id === str(row.data.payment_method_id) || payLabel(p) === str(row.data.payment_method));
      setPayId(named?.id || pay?.id || "");
    } else {
      setNumber(`${kind === "quote" ? "QT" : "INV"}-${Date.now().toString(36).toUpperCase()}`);
      setPayId(pay?.id || "");
      const d = new Date();
      d.setDate(d.getDate() + 14);
      if (kind === "invoice") setDue(d.toISOString().slice(0, 10));
      else setValid(d.toISOString().slice(0, 10));
    }
    setHydrated(true);
  }, [pack.data, hydrated, kind, status]);

  useEffect(() => {
    if (!gstTouched) setGst(Math.round(amount * 0.18));
  }, [amount, gstTouched]);

  const clients = pack.data?.clients ?? [];
  const filteredClients = useMemo(() => {
    const q = clientQ.trim().toLowerCase();
    return clients.filter((c) => {
      if (!q) return true;
      return `${c.data.name} ${c.data.email} ${c.data.phone} ${c.data.company}`.toLowerCase().includes(q);
    });
  }, [clients, clientQ]);

  const clientProjects = useMemo(() => {
    const c = clients.find((x) => x.id === clientId);
    if (!c) return [];
    return (pack.data?.projects ?? []).filter((p) => clientMatch(p, c) || str(p.data.client).toLowerCase() === str(c.data.name).toLowerCase());
  }, [clients, clientId, pack.data?.projects]);

  const pays = (pack.data?.pays ?? []).filter((p) => p.data.active !== false);
  const pay = pays.find((p) => p.id === payId);

  function pickClient(row: RecordRow) {
    setClientId(row.id);
    setClient(str(row.data.name));
    setClientEmail(str(row.data.email));
    setClientPhone(str(row.data.phone));
    setClientGstin(str(row.data.gstin));
    setClientAddress(str(row.data.address));
    setClientQ(str(row.data.name));
    setClientOpen(false);
    setProjectId("");
    setProject("");
  }

  function pickProject(row: RecordRow) {
    setProjectId(row.id);
    setProject(str(row.data.name));
    setItem(str(row.data.name));
    if (!amount) {
      const adv = num(row.data.remaining_amount) || num(row.data.total_amount);
      if (adv) setAmount(adv);
    }
  }

  const view: DocView = {
    kind,
    title: kind === "quote" ? "Quotation" : "Invoice",
    number,
    date: pack.data?.row ? str(pack.data.row.created_at).slice(0, 10) : today(),
    due: kind === "invoice" ? due : undefined,
    validUntil: kind === "quote" ? valid : undefined,
    client,
    clientEmail,
    clientPhone,
    clientGstin,
    clientAddress,
    project,
    item: item || project,
    amount,
    gst,
    notes,
    paymentMethod: pay ? payLabel(pay) : "",
    paymentDetails: pay ? paySnapshot(pay) : "",
    status,
    template: asTemplate(template),
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("Client select karo");
      const payload: Record<string, unknown> = {
        client,
        client_id: clientId,
        client_email: clientEmail,
        client_phone: clientPhone,
        client_gstin: clientGstin,
        client_address: clientAddress,
        project_id: projectId,
        project_name: project,
        item,
        amount,
        gst_amount: gst,
        notes,
        status,
        template,
        payment_method: pay ? payLabel(pay) : "",
        payment_method_id: pay?.id || "",
        payment_details: pay ? paySnapshot(pay) : "",
        share_token: str(pack.data?.row?.data.share_token) || uid(),
      };
      if (kind === "invoice") {
        payload.invoice_no = number;
        payload.due_date = due;
      } else {
        payload.quote_no = number;
        payload.valid_until = valid;
      }
      if (id) return updateRecord(id, { ...(pack.data?.row?.data || {}), ...payload });
      return insertRecord(moduleId(kind), payload);
    },
    onSuccess: async (row) => {
      await qc.invalidateQueries();
      nav(`${listKey(kind)}/${row.id}/edit`, { replace: true });
    },
  });

  function emailDoc(rowId: string) {
    const print = `${window.location.origin}/print/${kind}/${rowId}`;
    const subject = `${view.title} ${number} — ${pack.data?.firm.legal_name || "Socilet"}`;
    const body = `Hi ${client || "there"},\n\nPlease find your ${view.title.toLowerCase()} ${number}.\nTotal ${view.amount + view.gst} (incl. GST).\n\nOpen / print: ${print}\n\n${pack.data?.firm.legal_name || "Socilet"}`;
    nav(`/emails?compose=1&to=${encodeURIComponent(clientEmail)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  }

  if (pack.isLoading) return <Card>Loading composer…</Card>;
  const savedId = id || save.data?.id;

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="grid min-w-0 content-start gap-3">
        <PageHeader
          kicker={kind === "quote" ? "Quotations" : "Invoices"}
          title={id ? `Edit ${kind}` : `New ${kind}`}
          description="Socilet details templates par default hain. Client choose karo — baaki fill ho jayega."
        />
        <Button variant="outline" asChild>
          <Link to={listKey(kind)}>Back to list</Link>
        </Button>

        <Card className="grid gap-3">
          <Label>Client</Label>
          <Input
            value={clientOpen ? clientQ : client || clientQ}
            placeholder="Search clients…"
            onFocus={() => {
              setClientOpen(true);
              setClientQ(client);
            }}
            onChange={(e) => {
              setClientQ(e.target.value);
              setClientOpen(true);
            }}
          />
          {clientOpen ? (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
              {filteredClients.length === 0 ? (
                <p className="p-3 text-sm text-paper/50">
                  Koi client nahi. <Link to="/clients" className="text-gold">Add client</Link>
                </p>
              ) : (
                filteredClients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="block w-full border-b border-white/5 px-3 py-2 text-left text-sm hover:bg-white/5"
                    onClick={() => pickClient(c)}
                  >
                    <div className="font-medium">{str(c.data.name)}</div>
                    <div className="text-[11px] text-paper/45">{str(c.data.email) || str(c.data.phone)}</div>
                  </button>
                ))
              )}
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="Email" />
            <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Phone" />
            <Input value={clientGstin} onChange={(e) => setClientGstin(e.target.value)} placeholder="Client GSTIN" />
            <Input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Address" />
          </div>
        </Card>

        {clientId ? (
          <Card className="grid gap-2">
            <Label>Project</Label>
            <select
              className="h-11 rounded-xl border border-line bg-ink/70 px-3"
              value={projectId}
              onChange={(e) => {
                const row = clientProjects.find((p) => p.id === e.target.value);
                if (row) pickProject(row);
                else {
                  setProjectId("");
                  setProject("");
                }
              }}
            >
              <option value="">No project / general</option>
              {clientProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {str(p.data.name)}
                </option>
              ))}
            </select>
          </Card>
        ) : null}

        <Card className="grid gap-3">
          <Field label={kind === "quote" ? "Quote no" : "Invoice no"}>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} />
          </Field>
          <Field label="Line item">
            <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Design, website, retainer…" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Amount">
              <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </Field>
            <Field label="GST (18% auto)">
              <Input
                type="number"
                value={gst}
                onChange={(e) => {
                  setGstTouched(true);
                  setGst(Number(e.target.value));
                }}
              />
            </Field>
          </div>
          {kind === "invoice" ? (
            <Field label="Due date">
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
          ) : (
            <Field label="Valid until">
              <Input type="date" value={valid} onChange={(e) => setValid(e.target.value)} />
            </Field>
          )}
          <Field label="Payment method">
            <select
              className="h-11 rounded-xl border border-line bg-ink/70 px-3"
              value={payId}
              onChange={(e) => setPayId(e.target.value)}
            >
              <option value="">Select method</option>
              {pays.map((p) => (
                <option key={p.id} value={p.id}>
                  {payLabel(p)}
                  {defaultPay(pays)?.id === p.id ? " (default)" : ""}
                </option>
              ))}
            </select>
            {pays.length === 0 ? (
              <Link to="/payment-methods" className="text-xs text-gold">
                Add a payment method
              </Link>
            ) : null}
            {pay ? <pre className="whitespace-pre-wrap font-sans text-xs text-paper/55">{paySnapshot(pay)}</pre> : null}
          </Field>
          <Field label="Template">
            <div className="grid grid-cols-2 gap-1.5">
              {DOC_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t.id)}
                  className={`rounded-xl border px-2 py-2 text-left text-xs ${template === t.id ? "border-gold/50 bg-gold/10 text-gold" : "border-line"}`}
                >
                  <div className="font-medium">{t.label}</div>
                  <div className="text-paper/45">{t.vibe}</div>
                </button>
              ))}
            </div>
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </Card>

        {save.isError ? <p className="text-sm text-red-400">{save.error.message}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : kind === "quote" ? "Save quotation" : "Save invoice"}
          </Button>
          {savedId ? (
            <>
              <Button variant="outline" asChild>
                <Link to={`/print/${kind}/${savedId}`}>Download PDF</Link>
              </Button>
              <Button variant="outline" disabled={!clientEmail} onClick={() => emailDoc(savedId)}>
                Email
              </Button>
            </>
          ) : (
            <p className="self-center text-xs text-paper/45">Save ke baad PDF aur email khulte hain.</p>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <h2 className="mb-2 font-display text-lg">Preview</h2>
        {pack.data?.firm ? <DocSheet doc={view} firm={pack.data.firm} /> : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function InvoiceComposer() {
  return <DocumentComposer kind="invoice" />;
}
export function QuoteComposer() {
  return <DocumentComposer kind="quote" />;
}
