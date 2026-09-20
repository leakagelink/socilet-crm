import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "lift shine rounded-2xl border border-gold/25 bg-panel/90 p-5 shadow-[0_18px_40px_-28px_rgba(11,22,36,0.28)] backdrop-blur-md",
        className,
      )}
      {...props}
    />
  );
}
