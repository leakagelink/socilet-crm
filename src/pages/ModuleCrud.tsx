import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { deleteRecord, insertRecord, listRecords, mergeRecords, updateRecord, type RecordRow } from "@/lib/db";
import type { ModuleDef } from "@/lib/modules";
import { RecordForm } from "@/components/RecordForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/PageHeader";
import { HighlightCell, ProjectCountdown, StatusBadge } from "@/components/HighlightCell";
import { DATE_FIELDS } from "@/lib/highlights";
import {
  dateField,
  downloadText,
  matchRow,
  parseImportFile,
  recordsToCsv,
} from "@/lib/tableTools";

function visibleFields(module: ModuleDef) {
  const pinned = module.fields.filter((f) => f.name === "status" || DATE_FIELDS.has(f.name) || f.kind === "date");
  const prefer = ["quote_no", "invoice_no", "client", "project_name", "amount", "gst_amount", "payment_method", "template"];
  const rest = module.fields.filter((f) => !pinned.includes(f));
  const picked = [
    ...rest.filter((f) => prefer.includes(f.name)),
    ...rest.filter((f) => !prefer.includes(f.name)),
  ].slice(0, 7);
  const seen = new Set<string>();
  return [...pinned, ...picked].filter((f) => {
    if (seen.has(f.name)) return false;
    seen.add(f.name);
    return true;
  });
}

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

  const rows = useMemo(
    () => (q.data ?? []).filter((row) => matchRow(row, module, search, selects, from, to)),
    [q.data, module, search, selects, from, to],
  );

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

  function exportCsv() {
    downloadText(`${module.id}-${stamp}.csv`, recordsToCsv(module, rows), "text/csv;charset=utf-8");
  }

  function exportJson() {
    downloadText(
      `${module.id}-${stamp}.json`,
      JSON.stringify({ module: module.id, records: rows }, null, 2),
      "application/json",
    );
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

  const cols = visibleFields(module);
  const toolbar = (
    <div className="grid gap-3 rounded-2xl border border-white/10 bg-panel/50 p-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={`Search ${module.title.toLowerCase()}…`}
        aria-label="Search"
      />
      <div className="flex flex-wrap gap-2">
        {selectFields.map((f) => (
          <select
            key={f.name}
            className="h-11 min-w-36 flex-1 rounded-xl border border-line bg-ink/70 px-3 text-base text-paper sm:h-10 sm:flex-none sm:text-sm"
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
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
          Export CSV
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={exportJson} disabled={!rows.length}>
          Export JSON
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
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
        {(search || from || to || Object.values(selects).some(Boolean)) && q.data?.length ? (
          <span className="self-center text-xs text-paper/45">
            Showing {rows.length} of {q.data.length}
          </span>
        ) : null}
      </div>
      {notice ? <p className="text-sm text-mint">{notice}</p> : null}
    </div>
  );

  return (
    <div className="grid gap-4">
      {!hideHeader ? (
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <PageHeader kicker="Module" title={module.title} description={module.description} />
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              if (onNew) {
                onNew();
                return;
              }
              setEditing(null);
              setOpen(true);
            }}
          >
            New
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => {
              if (onNew) {
                onNew();
                return;
              }
              setEditing(null);
              setOpen(true);
            }}
          >
            New row
          </Button>
        </div>
      )}
      {extra}
      {toolbar}
      {q.isLoading ? <Card>Loading…</Card> : null}
      {q.isError ? <Card className="text-red-300">Could not load records.</Card> : null}
      {q.data && q.data.length === 0 ? (
        <Card className="grid place-items-center py-16 text-center">
          <div className="font-display text-xl">Empty ledger</div>
          <p className="mt-1 max-w-sm text-sm text-paper/50">
            No {module.title.toLowerCase()} yet. Create a row or import a CSV/JSON backup.
          </p>
        </Card>
      ) : null}
      {q.data && q.data.length > 0 && rows.length === 0 ? (
        <Card className="text-sm text-paper/60">No rows match this search or filter.</Card>
      ) : null}
      {rows.length > 0 ? (
        <>
          <div className="grid gap-3 md:hidden">
            {rows.map((row) => (
              <Card key={row.id} className="p-4">
                {module.id === "projects" ? (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <StatusBadge value={row.data.status} />
                    <ProjectCountdown data={row.data} />
                  </div>
                ) : row.data.status != null && String(row.data.status) !== "" ? (
                  <div className="mb-3">
                    <StatusBadge value={row.data.status} />
                  </div>
                ) : null}
                <div className="grid gap-2">
                  {visibleFields(module).map((f) => (
                    <div key={f.name} className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-paper/40">{f.label}</div>
                      <div className="text-sm">
                        <HighlightCell field={f} value={row.data[f.name]} row={row.data} moduleId={module.id} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      if (onEdit) {
                        onEdit(row);
                        return;
                      }
                      setEditing(row);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="flex-1" onClick={() => remove.mutate(row.id)}>
                    Delete
                  </Button>
                  {rowActions?.(row)}
                </div>
              </Card>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-panel/50 shadow-[0_20px_50px_-32px_rgba(0,0,0,0.8)] md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-white/[0.04]">
                <tr>
                  {cols.map((f) => (
                    <th key={f.name} className="px-3 py-3 text-[11px] uppercase tracking-wide font-medium text-paper/50">
                      {f.label}
                    </th>
                  ))}
                  {module.id === "projects" ? (
                    <th className="px-3 py-3 text-[11px] uppercase tracking-wide font-medium text-paper/50">Time left</th>
                  ) : null}
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-white/6 transition hover:bg-gold/5">
                    {cols.map((f) => (
                      <td key={f.name} className="max-w-48 px-3 py-3">
                        <HighlightCell field={f} value={row.data[f.name]} row={row.data} moduleId={module.id} />
                      </td>
                    ))}
                    {module.id === "projects" ? (
                      <td className="px-3 py-3">
                        <ProjectCountdown data={row.data} />
                      </td>
                    ) : null}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (onEdit) {
                            onEdit(row);
                            return;
                          }
                          setEditing(row);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(row.id)}>
                        Delete
                      </Button>
                      {rowActions?.(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? `Edit ${module.title}` : `New ${module.title}`}
      >
        <RecordForm
          key={editing?.id ?? "new"}
          module={module}
          defaults={editing?.data}
          submitting={save.isPending}
          onSubmit={(v) => save.mutateAsync(v)}
        />
        {save.isError ? <p className="mt-2 text-sm text-red-400">Save failed. Check the fields.</p> : null}
      </Modal>
    </div>
  );
}
