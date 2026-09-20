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
        "h-11 w-full rounded-xl border border-gold/20 bg-ink/70 px-3 text-base text-paper placeholder:text-paper/35 outline-none transition duration-200 focus:border-gold/70 focus:shadow-[0_0_0_3px_rgba(232,195,106,0.18)] sm:h-10 sm:text-sm",
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
        "min-h-24 w-full rounded-xl border border-gold/20 bg-ink/70 px-3 py-2 text-base text-paper placeholder:text-paper/35 outline-none transition duration-200 focus:border-gold/70 focus:shadow-[0_0_0_3px_rgba(232,195,106,0.18)] sm:text-sm",
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm text-paper/80", className)} {...props} />;
}
