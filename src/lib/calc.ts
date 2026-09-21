/** Same rules as projects, invoices (18% GST), and lend/borrow. */

export const GST_RATE = 0.18;

export function rupees(v: unknown) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function projectSplit(total: unknown, received: unknown) {
  const t = rupees(total);
  const r = Math.min(t, rupees(received));
  return {
    total: t,
    received: r,
    remaining: Math.max(0, t - r),
    percent: t ? Math.round((r / t) * 1000) / 10 : 0,
  };
}

export function advanceFromPercent(total: unknown, percent: unknown) {
  return Math.round(rupees(total) * (rupees(percent) / 100));
}

export function gstExclusive(amount: unknown, rate = GST_RATE) {
  const base = rupees(amount);
  const gst = Math.round(base * rate);
  return { base, gst, grand: base + gst };
}

export function gstInclusive(grand: unknown, rate = GST_RATE) {
  const total = rupees(grand);
  const base = Math.round(total / (1 + rate));
  const gst = Math.max(0, total - base);
  return { base, gst, grand: total };
}

export function remainingInstallments(remaining: unknown, count: unknown) {
  const r = rupees(remaining);
  const n = Math.max(1, Math.round(rupees(count)) || 1);
  const each = Math.floor(r / n);
  const last = r - each * (n - 1);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? last : each));
}

export function digitalProfit(cost: unknown, sale: unknown) {
  const c = rupees(cost);
  const s = rupees(sale);
  return { cost: c, sale: s, profit: s - c };
}
