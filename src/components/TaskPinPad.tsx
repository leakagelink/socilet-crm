import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validTaskPin } from "@/lib/taskLock";

export function TaskPinPad({
  label = "Enter PIN",
  submitLabel = "Unlock",
  onSubmit,
}: {
  label?: string;
  submitLabel?: string;
  onSubmit: (pin: string) => Promise<void> | void;
}) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    const value = pin.trim();
    if (!validTaskPin(value)) {
      setErr("PIN must be 4–8 digits.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await onSubmit(value);
      setPin("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not verify PIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void go();
      }}
    >
      <label className="grid gap-1 text-sm">
        <span className="text-paper/60">{label}</span>
        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="••••"
        />
      </label>
      {err ? <p className="text-sm text-rose-300">{err}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Checking…" : submitLabel}
      </Button>
    </form>
  );
}
