import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { deleteRecord, insertRecord, listRecords, mergeRecords, updateRecord, type RecordRow } from "@/lib/db";
import type { ModuleDef } from "@/lib/modules";
import { RecordForm } from "@/components/RecordForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/PageHeader";
import { HighlightCell, ProjectCountdown, StatusBadge } from "@/components/HighlightCell";
import { ProjectPaymentTrail } from "@/components/ProjectPaymentsEditor";
import { parseProjectPayments } from "@/lib/projectPayments";
import { AnimatedInr } from "@/components/AnimatedInr";
import { chipFields, insightTiles, moduleKicker, money as viewMoney, rowMoney, rowSubtitle, rowTitle } from "@/lib/moduleView";
import { inr } from "@/lib/utils";
import {
  dateField,
  downloadText,
  matchRow,
  parseImportFile,
  recordsToCsv,
} from "@/lib/tableTools";

export function ModuleCrud({
  module,
  extra,
  hideHeader,
  rowActions,
  onNew,
  onEdit,
}: {
  module: ModuleDef;
  extra?: ReactNode;
  hideHeader?: boolean;
  rowActions?: (row: RecordRow) => ReactNode;
  onNew?: () => void;
  onEdit?: (row: RecordRow) => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["module", module.id],
    queryFn: () => listRecords(module.id),
  });
  const spendsQ = useQuery({
    queryKey: ["module", "spends"],
    queryFn: () => listRecords("spends"),
    enabled: module.id === "projects",
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [search, setSearch] = useState("");
  const [selects, setSelects] = useState<Record<string, string>>({});
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const whenField = dateField(module);
  const selectFields = module.fields.filter((f) => f.kind === "select");
  const chips = chipFields(module);

  const rows = useMemo(
    () => (q.data ?? []).filter((row) => matchRow(row, module, search, selects, from, to)),
    [q.data, module, search, selects, from, to],
  );
  const insights = useMemo(() => insightTiles(module, rows), [module, rows]);

  const save = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (editing) await updateRecord(editing.id, values);
      else await insertRecord(module.id, values);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["module", module.id] });
      await qc.invalidateQueries({ queryKey: ["finance"] });
      await qc.invalidateQueries({ queryKey: ["balance-ledger"] });
      setOpen(false);
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: deleteRecord,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["module", module.id] });
      await qc.invalidateQueries({ queryKey: ["finance"] });
      await qc.invalidateQueries({ queryKey: ["balance-ledger"] });
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);

  function startNew() {
    if (onNew) {
      onNew();
      return;
    }
    setEditing(null);
    setOpen(true);
  }

  function startEdit(row: RecordRow) {
    if (onEdit) {
      onEdit(row);
      return;
    }
    setEditing(row);
    setOpen(true);
  }

  async function onImport(file: File) {
    setNotice(null);
    try {
      const text = await file.text();
      const incoming = parseImportFile(module, file.name, text);
      if (!incoming.length) throw new Error("No matching rows in that file");
      await mergeRecords(incoming);
      await qc.invalidateQueries({ queryKey: ["module", module.id] });
      await qc.invalidateQueries({ queryKey: ["finance"] });
      await qc.invalidateQueries({ queryKey: ["balance-ledger"] });
      setNotice(`Imported ${incoming.length} ${module.title.toLowerCase()} row(s).`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Import failed");
    }
  }

  return (
    <div className="grid min-w-0 max-w-full gap-4 sm:gap-6">
      {!hideHeader ? (
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <PageHeader kicker={moduleKicker(module.id)} title={module.title} description={module.description} />
          <Button className="w-full sm:w-auto" onClick={startNew}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button variant="outline" onClick={startNew}>
            <Plus className="h-4 w-4" />
            New row
          </Button>
        </div>
      )}

      {!hideHeader && insights.length ? (
        <div className="stagger grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {insights.map((tile) => (
            <div
              key={tile.label}
              className={`shine relative min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br p-4 text-white shadow-lg ${tile.tone}`}
            >
              <div className="text-[10px] uppercase tracking-[0.16em] text-white/80">{tile.label}</div>
              <div className="mt-2 font-display text-2xl leading-tight sm:text-3xl">
                {tile.label === "Records" || tile.label === "Entries" || tile.label === "Active" || tile.label === "Running" || tile.label === "Plans" || tile.label === "Products" ? (
                  <span className="font-semibold">{tile.value}</span>
                ) : (
                  <AnimatedInr value={tile.value} />
                )}
              </div>
              <div className="mt-1 truncate text-xs text-white/70">{tile.hint}</div>
            </div>
          ))}
        </div>
      ) : null}

      {extra}

      <div className="grid gap-3 rounded-2xl border border-gold/20 bg-panel/80 p-3 shadow-[0_18px_40px_-28px_rgba(11,22,36,0.2)] backdrop-blur-md sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${module.title.toLowerCase()}…`}
            aria-label="Search"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {selectFields.map((f) => (
            <select
              key={f.name}
              className="h-11 min-w-36 flex-1 rounded-full border border-gold/25 bg-gold/8 px-3 text-base text-paper sm:h-10 sm:flex-none sm:text-sm"
              value={selects[f.name] ?? ""}
              onChange={(e) => setSelects((prev) => ({ ...prev, [f.name]: e.target.value }))}
              aria-label={f.label}
            >
              <option value="">All {f.label.toLowerCase()}</option>
              {f.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ))}
          {whenField ? (
            <>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="max-w-44 rounded-full" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="max-w-44 rounded-full" />
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadText(`${module.id}-${stamp}.csv`, recordsToCsv(module, rows), "text/csv;charset=utf-8")}
            disabled={!rows.length}
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              downloadText(`${module.id}-${stamp}.json`, JSON.stringify({ module: module.id, records: rows }, null, 2), "application/json")
            }
            disabled={!rows.length}
          >
            <Download className="h-3.5 w-3.5" />
            JSON
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onImport(file);
            }}
          />
          {q.data?.length ? (
            <span className="self-center text-xs text-paper/45">
              {rows.length} of {q.data.length}
            </span>
          ) : null}
        </div>
        {notice ? <p className="text-sm text-mint">{notice}</p> : null}
      </div>

      {q.isLoading ? <Card>Loading…</Card> : null}
      {q.isError ? <Card className="text-red-600">Could not load records.</Card> : null}
      {q.data && q.data.length === 0 ? (
        <Card className="relative grid min-h-52 place-items-center overflow-hidden py-16 text-center">
          <div className="orb pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative">
            <div className="font-display text-2xl">Nothing here yet</div>
            <p className="mt-1 max-w-sm text-sm text-paper/50">Add a {module.title.toLowerCase()} row — cards yahin dashboard jaisa dikhenge.</p>
            <Button className="mt-4" onClick={startNew}>
              <Plus className="h-4 w-4" />
              New {module.title.slice(0, -1).toLowerCase()}
            </Button>
          </div>
        </Card>
      ) : null}
      {q.data && q.data.length > 0 && rows.length === 0 ? (
        <Card className="text-sm text-paper/60">No rows match this search or filter.</Card>
      ) : null}

      {rows.length > 0 ? (
        <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const cash = rowMoney(row, module.id);
            const sub = rowSubtitle(row);
            return (
              <Card key={row.id} className="flex min-w-0 flex-col p-4 transition duration-300 hover:-translate-y-1 hover:border-gold/40">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {row.data.status != null && String(row.data.status) !== "" ? <StatusBadge value={row.data.status} /> : null}
                  {module.id === "projects" ? <ProjectCountdown data={row.data} /> : null}
                </div>
                <div className="font-display text-lg leading-tight">{rowTitle(row, module)}</div>
                {sub ? <div className="mt-1 truncate text-xs text-paper/50">{sub}</div> : null}
                {cash ? (
                  <div className="mt-3">
                    <div className="text-[10px] uppercase tracking-wide text-paper/40">{cash.label}</div>
                    <div className="font-display text-2xl text-mint">
                      <AnimatedInr value={cash.value} />
                    </div>
                  </div>
                ) : null}
                {module.id === "investments" ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl bg-gold/10 px-2 py-1.5">
                      <div className="text-paper/45">Principal</div>
                      <div className="font-medium">{inr(viewMoney(row.data.amount))}</div>
                    </div>
                    <div className="rounded-xl bg-gold/10 px-2 py-1.5">
                      <div className="text-paper/45">P/L</div>
                      <div className={viewMoney(row.data.profit_loss) >= 0 ? "font-medium text-mint" : "font-medium text-rose-600"}>
                        {inr(viewMoney(row.data.profit_loss))}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1">
                  {chips.map((f) => (
                    <div key={f.name} className="max-w-full">
                      <HighlightCell field={f} value={row.data[f.name]} row={row.data} moduleId={module.id} />
                    </div>
                  ))}
                </div>
                {module.id === "projects" ? (
                  <div className="mt-3 rounded-xl border border-gold/15 bg-gold/5 px-3 py-2">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-paper/40">Payments</div>
                    <ProjectPaymentTrail client={String(row.data.client || "")} pays={parseProjectPayments(row.data)} />
                    {(() => {
                      const linked = (spendsQ.data ?? []).filter(
                        (s) =>
                          String(s.data.project_id || "") === row.id ||
                          String(s.data.project_name || "").toLowerCase() === String(row.data.name || "").toLowerCase(),
                      );
                      if (!linked.length) return null;
                      const total = linked.reduce((a, s) => a + viewMoney(s.data.amount), 0);
                      return (
                        <div className="mt-2 text-xs text-paper/55">
                          Spends {linked.length} · {inr(total)}
                          <div className="mt-1 truncate text-[11px] text-paper/40">
                            {linked.map((s) => String(s.data.title || "Spend")).join(", ")}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => startEdit(row)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove.mutate(row.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  {rowActions?.(row)}
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      <Modal open={open} onOpenChange={setOpen} title={editing ? `Edit ${module.title}` : `New ${module.title}`}>
        <RecordForm
          key={editing?.id ?? "new"}
          module={module}
          defaults={editing?.data}
          submitting={save.isPending}
          onSubmit={(v) => save.mutateAsync(v)}
        />
        {save.isError ? <p className="mt-2 text-sm text-red-600">Save failed. Check the fields.</p> : null}
      </Modal>
    </div>
  );
}
