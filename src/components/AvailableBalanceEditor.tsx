import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setDesiredAvailable } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { inr } from "@/lib/utils";

export function AvailableBalanceEditor({ available }: { available: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setValue(String(Math.round(available)));
  }, [available, open]);

  async function save() {
    const n = Number(value);
    if (!Number.isFinite(n)) {
      setErr("Valid amount daalo");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await setDesiredAvailable(n);
      await qc.invalidateQueries({ queryKey: ["finance"] });
      await qc.invalidateQueries({ queryKey: ["balance-ledger"] });
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="border-white/40 bg-white/15 text-white hover:bg-white/25" onClick={() => setOpen(true)}>
        Edit available
      </Button>
    );
  }

  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-white/25 bg-black/15 p-3 text-left">
      <Label className="text-white" htmlFor="available-edit">
        Available balance (INR)
      </Label>
      <p className="text-[11px] text-white/70">Purane CRM ki tarah yahi number set karo. Base peeche se adjust hoga. Earnings/spends iske upar add/subtract hote rahenge.</p>
      <Input id="available-edit" type="number" value={value} onChange={(e) => setValue(e.target.value)} className="bg-white text-paper" />
      {err ? <p className="text-xs text-red-200">{err}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : `Save ${inr(Number(value) || 0)}`}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="text-white" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
