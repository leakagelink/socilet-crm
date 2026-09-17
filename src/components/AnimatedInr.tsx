import { useEffect, useRef, useState } from "react";
import { inr } from "@/lib/utils";

export function AnimatedInr({ value }: { value: number }) {
  const fromRef = useRef(0);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const from = fromRef.current;
    const target = Number.isFinite(value) ? value : 0;
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - (1 - p) ** 3;
      const next = from + (target - from) * eased;
      setShown(next);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="anim-inr font-semibold tracking-tight">{inr(Math.round(shown))}</span>;
}
