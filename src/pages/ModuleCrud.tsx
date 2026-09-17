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
import { inr } from "@/lib/utils";
import {
  dateField,
  downloadText,
  matchRow,
  parseImportFile,
  recordsToCsv,
} from "@/lib/tableTools";

function cell(v: unknown) {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? inr(v) : String(v);
  return String(v ?? "");
}

export function ModuleCrud({
  module,
  extra,
  hideHeader,
}: {
  module: ModuleDef;
  extra?: ReactNode;
  hideHeader?: boolean;
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
      setOpen(false);
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: deleteRecord,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["module", module.id] });
      await qc.invalidateQueries({ queryKey: ["finance"] });
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
      setNotice(`Imported ${incoming.length} ${module.title.toLowerCase()} row(s).`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Import failed");
    }
  }

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
                <div className="grid gap-2">
                  {module.fields.slice(0, 8).map((f) => (
                    <div key={f.name} className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-paper/40">{f.label}</div>
                      <div className="truncate text-sm">
                        {f.kind === "number"
                          ? typeof row.data[f.name] === "number"
                            ? inr(row.data[f.name] as number)
                            : cell(row.data[f.name])
                          : cell(row.data[f.name])}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="flex-1" onClick={() => remove.mutate(row.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-panel/50 shadow-[0_20px_50px_-32px_rgba(0,0,0,0.8)] md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-white/[0.04]">
                <tr>
                  {module.fields.map((f) => (
                    <th key={f.name} className="px-3 py-3 text-[11px] uppercase tracking-wide font-medium text-paper/50">
                      {f.label}
                    </th>
                  ))}
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-white/6 transition hover:bg-gold/5">
                    {module.fields.map((f) => (
                      <td key={f.name} className="max-w-48 truncate px-3 py-3">
                        {f.kind === "number"
                          ? typeof row.data[f.name] === "number"
                            ? inr(row.data[f.name] as number)
                            : cell(row.data[f.name])
                          : cell(row.data[f.name])}
                      </td>
                    ))}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(row);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(row.id)}>
                        Delete
                      </Button>
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
