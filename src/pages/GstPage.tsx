import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { loadGstReport } from "@/lib/gst";
import { inr } from "@/lib/utils";
import { downloadText } from "@/lib/tableTools";

export function GstPage() {
  const q = useQuery({ queryKey: ["gst-report"], queryFn: loadGstReport });
  const rows = q.data ?? [];
  return (
    <div className="grid min-w-0 gap-4">
      <PageHeader
        kicker="Tax"
        title="GST view"
        description="Month-wise taxable inflows: invoices, digital, projects, Cosmofeed, other vs spends."
      />
      <div>
        <Button
          variant="outline"
          disabled={!rows.length}
          onClick={() => {
            const header = "month,invoices,invoice_gst,digital,projects,cosmofeed,cosmofeed_gst,other,spends,taxable_in,gst_in";
            const body = rows
              .map(
                (m) =>
                  `${m.month},${m.invoices},${m.invoiceGst},${m.digital},${m.projects},${m.cosmofeed},${m.cosmofeedGst},${m.other},${m.spends},${m.taxableIn},${m.gstIn}`,
              )
              .join("\n");
            downloadText(`gst-${new Date().toISOString().slice(0, 10)}.csv`, `${header}\n${body}`, "text/csv;charset=utf-8");
          }}
        >
          Export CSV
        </Button>
      </div>
      {q.isLoading ? <Card>Loading…</Card> : null}
      {!q.isLoading && !rows.length ? <Card className="text-sm text-paper/50">No dated sales yet.</Card> : null}
      {rows.length ? (
        <div className="overflow-x-auto rounded-2xl border border-gold/20 bg-panel">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-gold/10 text-[11px] uppercase tracking-wide text-paper/60">
              <tr>
                {["Month", "Invoices", "Inv GST", "Digital", "Projects", "Cosmofeed", "CF GST", "Other", "Spends", "Taxable in", "GST in"].map((h) => (
                  <th key={h} className="px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.month} className="border-t border-gold/15">
                  <td className="px-3 py-2">{m.month}</td>
                  <td className="px-3 py-2">{inr(m.invoices)}</td>
                  <td className="px-3 py-2">{inr(m.invoiceGst)}</td>
                  <td className="px-3 py-2">{inr(m.digital)}</td>
                  <td className="px-3 py-2">{inr(m.projects)}</td>
                  <td className="px-3 py-2">{inr(m.cosmofeed)}</td>
                  <td className="px-3 py-2">{inr(m.cosmofeedGst)}</td>
                  <td className="px-3 py-2">{inr(m.other)}</td>
                  <td className="px-3 py-2 text-red-300">{inr(m.spends)}</td>
                  <td className="px-3 py-2 text-mint">{inr(m.taxableIn)}</td>
                  <td className="px-3 py-2">{inr(m.gstIn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
