export type RangePreset = "all" | "today" | "yesterday" | "week" | "month" | "year" | "custom";

export const RANGE_PRESETS: { id: RangePreset; label: string }[] = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom" },
];

export function ymd(d: Date) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function rangeBounds(preset: RangePreset, customFrom = "", customTo = "") {
  if (preset === "custom") return { from: customFrom, to: customTo };
  if (preset === "all") return { from: "", to: "" };
  const now = new Date();
  const today = ymd(now);
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const s = ymd(y);
    return { from: s, to: s };
  }
  if (preset === "week") {
    const d = new Date(now);
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return { from: ymd(d), to: today };
  }
  if (preset === "month") {
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: today };
  }
  return { from: `${now.getFullYear()}-01-01`, to: today };
}

export function dayOf(raw: unknown) {
  return String(raw || "").slice(0, 10);
}

export function inDayRange(raw: unknown, from: string, to: string) {
  const day = dayOf(raw);
  if (!from && !to) return true;
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}
