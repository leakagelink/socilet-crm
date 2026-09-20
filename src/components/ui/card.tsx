import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "lift shine rounded-2xl border border-gold/15 bg-panel/80 p-5 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.85)] backdrop-blur-md",
        className,
      )}
      {...props}
    />
  );
}
