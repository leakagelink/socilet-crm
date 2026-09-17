import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-xl border border-line bg-ink/70 px-3 text-paper placeholder:text-paper/35 outline-none transition focus:border-gold/50",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-24 w-full rounded-xl border border-line bg-ink/70 px-3 py-2 text-paper placeholder:text-paper/35 outline-none transition focus:border-gold/50",
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm text-paper/80", className)} {...props} />;
}
