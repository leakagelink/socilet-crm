import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/8 bg-panel/75 p-5 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.8)] backdrop-blur-md",
        className,
      )}
      {...props}
    />
  );
}
