import { useEffect, useState } from "react";
import {
  countdownClass,
  countdownParts,
  DATE_FIELDS,
  dateClass,
  formatDay,
  isProjectStarted,
  parseDay,
  projectTarget,
  statusClass,
} from "@/lib/highlights";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/utils";
import type { FieldDef } from "@/lib/modules";

export function StatusBadge({ value }: { value: unknown }) {
  const label = String(value ?? "").trim() || "—";
  return (
    <span className={cn("inline-flex max-w-full truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", statusClass(value))}>
      {label.replaceAll("_", " ")}
    </span>
  );
}

export function DateChip({ value, label, field }: { value: unknown; label?: string; field?: string }) {
  const text = formatDay(value);
  if (text === "—") return <span className="text-paper/35">—</span>;
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px] font-medium", dateClass(value, field))}>
      {label ? <span className="opacity-70">{label}</span> : null}
      {text}
    </span>
  );
}

const REMAIN_FIELDS = new Set(["deadline", "end_date", "due_date", "due_at", "valid_until", "next_date"]);

export function RemainingChip({ value }: { value: unknown }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const target = parseDay(value);
  if (!target) return null;
  const { text, tone } = countdownParts(target);
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", countdownClass(tone))}>
      {text}
    </span>
  );
}

export function ProjectCountdown({ data }: { data: Record<string, unknown> }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const status = String(data.status ?? "").toLowerCase();
  if (status === "completed" || status === "done") {
    return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", countdownClass("ok"))}>Completed</span>;
  }
  if (status === "paused") {
    return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", countdownClass("warn"))}>Paused</span>;
  }
  if (!isProjectStarted(data)) return <span className="text-xs text-paper/40">Not started</span>;
  const target = projectTarget(data);
  if (!target) return <span className="text-xs text-paper/40">No deadline</span>;
  const { text, tone } = countdownParts(target);
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", countdownClass(tone))}>
      {text}
    </span>
  );
}

export function HighlightCell({
  field,
  value,
  row,
  moduleId,
}: {
  field: FieldDef;
  value: unknown;
  row: Record<string, unknown>;
  moduleId?: string;
}) {
  if (field.name === "status") return <StatusBadge value={value} />;
  if (DATE_FIELDS.has(field.name) || field.kind === "date") {
    const showRemain = REMAIN_FIELDS.has(field.name) && moduleId !== "projects";
    return (
      <div className="flex flex-wrap items-center gap-1">
        <DateChip value={value} field={field.name} />
        {showRemain ? <RemainingChip value={value} /> : null}
      </div>
    );
  }
  if (field.name === "remaining_amount" && moduleId === "projects") {
    const status = String(row.status || "").toLowerCase();
    const n = status === "completed" || status === "done" ? 0 : typeof value === "number" ? value : Number(value);
    return <span>{inr(Number.isFinite(n) ? n : 0)}</span>;
  }
  if (field.kind === "number") {
    return typeof value === "number" ? <span>{inr(value)}</span> : <span>{String(value ?? "")}</span>;
  }
  if (typeof value === "boolean") return <span>{value ? "yes" : "no"}</span>;
  return <span className="truncate">{String(value ?? "")}</span>;
}
