import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-line bg-panel/80 p-5 shadow-xl shadow-black/20", className)} {...props} />;
}
