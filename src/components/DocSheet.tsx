import type { FirmProfile } from "@/lib/firm";
import { brandLogoUrl } from "@/lib/brand";
import { asTemplate, type DocView } from "@/lib/docTemplates";
import { inr } from "@/lib/utils";
import { cn } from "@/lib/utils";

function logoSrc(firm: FirmProfile) {
  return brandLogoUrl(firm.logo_url);
}

function FirmBlock({ firm, light }: { firm: FirmProfile; light?: boolean }) {
  const tone = light ? "text-white/80" : "text-zinc-600";
  return (
    <div className={cn("grid gap-1 text-xs", tone)}>
      {firm.gstin ? <div>GSTIN {firm.gstin}</div> : null}
      {firm.phone ? <div>{firm.phone}</div> : null}
      {firm.email ? <div>{firm.email}</div> : null}
      {firm.address ? <div className="whitespace-pre-wrap">{firm.address}</div> : null}
    </div>
  );
}

function Totals({ doc, accent }: { doc: DocView; accent?: string }) {
  return (
    <table className="mt-6 w-full text-sm">
      <tbody>
        <tr>
          <td className="py-1">{doc.item || (doc.kind === "quote" ? "Quotation" : "Services")}</td>
          <td className="py-1 text-right">{inr(doc.amount)}</td>
        </tr>
        <tr>
          <td className="py-1">GST</td>
          <td className="py-1 text-right">{inr(doc.gst)}</td>
        </tr>
        <tr className="text-base font-semibold" style={accent ? { color: accent } : undefined}>
          <td className="border-t border-current/20 py-2">Total</td>
          <td className="border-t border-current/20 py-2 text-right">{inr(doc.amount + doc.gst)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function PayBlock({ doc }: { doc: DocView }) {
  if (!doc.paymentMethod && !doc.paymentDetails) return null;
  return (
    <div className="mt-6 text-sm">
      <div className="text-[10px] uppercase tracking-[0.16em] opacity-60">Payment</div>
      <div className="font-medium">{doc.paymentMethod}</div>
      {doc.paymentDetails ? <pre className="mt-1 whitespace-pre-wrap font-sans text-xs opacity-80">{doc.paymentDetails}</pre> : null}
    </div>
  );
}

function BillTo({ doc }: { doc: DocView }) {
  return (
    <div className="text-sm">
      <div className="text-[10px] uppercase tracking-[0.16em] opacity-60">Bill to</div>
      <div className="mt-1 font-semibold">{doc.client || "Client"}</div>
      {doc.clientGstin ? <div>GSTIN {doc.clientGstin}</div> : null}
      {doc.clientEmail ? <div>{doc.clientEmail}</div> : null}
      {doc.clientPhone ? <div>{doc.clientPhone}</div> : null}
      {doc.clientAddress ? <div className="whitespace-pre-wrap">{doc.clientAddress}</div> : null}
      {doc.project ? <div className="mt-2">Project · {doc.project}</div> : null}
    </div>
  );
}

export function DocSheet({ doc, firm }: { doc: DocView; firm: FirmProfile }) {
  const t = asTemplate(doc.template);
  const kind = doc.kind === "quote" ? "Quotation" : "Invoice";
  const logo = logoSrc(firm);

  if (t === "modern") {
    return (
      <article className="overflow-hidden rounded-2xl bg-white text-zinc-900 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-[#0b1624] px-8 py-6 text-white">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Socilet" className="h-14 w-auto max-w-[11rem] rounded-xl bg-black object-contain" />
            <div>
              <div className="font-display text-2xl">{firm.legal_name || "Socilet"}</div>
              <FirmBlock firm={firm} light />
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.2em] text-[#e8c36a]">{kind}</div>
            <div className="text-xl font-semibold">{doc.number}</div>
            <div className="text-xs text-white/60">{doc.date}</div>
          </div>
        </div>
        <div className="grid gap-6 px-8 py-8 sm:grid-cols-2">
          <BillTo doc={doc} />
          <div className="text-sm sm:text-right">
            {doc.due ? <div>Due {doc.due}</div> : null}
            {doc.validUntil ? <div>Valid until {doc.validUntil}</div> : null}
            <div className="capitalize opacity-60">{doc.status}</div>
          </div>
        </div>
        <div className="px-8 pb-8">
          <Totals doc={doc} accent="#0b1624" />
          <PayBlock doc={doc} />
          {doc.notes ? <p className="mt-4 text-sm whitespace-pre-wrap text-zinc-600">{doc.notes}</p> : null}
        </div>
      </article>
    );
  }

  if (t === "minimal") {
    return (
      <article className="rounded-2xl bg-white p-10 text-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <img src={logo} alt="Socilet" className="h-12 w-auto max-w-[10rem] bg-black object-contain" />
          <div className="text-right text-[11px] uppercase tracking-[0.28em] text-zinc-400">{kind}</div>
        </div>
        <h1 className="mt-8 font-display text-4xl font-light tracking-tight">{firm.legal_name || "Socilet"}</h1>
        <div className="mt-2 h-px w-16 bg-zinc-900" />
        <div className="mt-4 grid gap-8 sm:grid-cols-2">
          <FirmBlock firm={firm} />
          <div className="text-sm sm:text-right">
            <div className="text-lg">{doc.number}</div>
            <div>{doc.date}</div>
            {doc.due ? <div>Due {doc.due}</div> : null}
            {doc.validUntil ? <div>Valid {doc.validUntil}</div> : null}
          </div>
        </div>
        <div className="mt-10">
          <BillTo doc={doc} />
        </div>
        <Totals doc={doc} />
        <PayBlock doc={doc} />
        {doc.notes ? <p className="mt-6 text-sm whitespace-pre-wrap text-zinc-500">{doc.notes}</p> : null}
      </article>
    );
  }

  if (t === "midnight") {
    return (
      <article className="rounded-2xl bg-[#0a0d14] p-8 text-[#f3eee4] shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e8c36a]/30 pb-6">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Socilet" className="h-14 w-auto max-w-[11rem] rounded-xl bg-black object-contain ring-1 ring-[#e8c36a]/40" />
            <div>
              <div className="font-display text-2xl text-[#e8c36a]">{firm.legal_name || "Socilet"}</div>
              <FirmBlock firm={firm} light />
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[#e8c36a]">{kind}</div>
            <div className="text-xl">{doc.number}</div>
            <div className="text-xs text-white/50">{doc.date}</div>
          </div>
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <BillTo doc={doc} />
          <div className="text-sm sm:text-right text-white/70">
            {doc.due ? <div>Due {doc.due}</div> : null}
            {doc.validUntil ? <div>Valid until {doc.validUntil}</div> : null}
          </div>
        </div>
        <Totals doc={doc} accent="#e8c36a" />
        <PayBlock doc={doc} />
        {doc.notes ? <p className="mt-4 text-sm whitespace-pre-wrap text-white/60">{doc.notes}</p> : null}
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-[#e8c36a]/40 bg-[#fbf7ee] p-8 text-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <img src={logo} alt="Socilet" className="h-16 w-auto max-w-[12rem] rounded-2xl bg-black object-contain" />
          <div>
            <h1 className="font-display text-3xl">{firm.legal_name || "Socilet"}</h1>
            <FirmBlock firm={firm} />
          </div>
        </div>
        <div className="rounded-xl border border-[#e8c36a]/50 bg-white/70 px-4 py-3 text-right">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[#8a6a2a]">{kind}</div>
          <div className="text-lg font-semibold">{doc.number}</div>
          <div className="text-xs">{doc.date}</div>
          {doc.due ? <div className="text-xs">Due {doc.due}</div> : null}
          {doc.validUntil ? <div className="text-xs">Valid {doc.validUntil}</div> : null}
        </div>
      </div>
      <hr className="my-6 border-[#e8c36a]/40" />
      <BillTo doc={doc} />
      <Totals doc={doc} accent="#8a6a2a" />
      <PayBlock doc={doc} />
      {doc.notes ? <p className="mt-4 text-sm whitespace-pre-wrap text-zinc-600">{doc.notes}</p> : null}
    </article>
  );
}
