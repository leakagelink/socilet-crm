import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition duration-200 ease-out disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-b from-gold to-[#c9a24a] text-ink shadow-[0_8px_22px_rgba(232,195,106,0.32)] hover:brightness-110 hover:shadow-[0_12px_28px_rgba(232,195,106,0.42)]",
        outline: "border border-gold/25 bg-transparent text-paper hover:border-gold/50 hover:bg-gold/10",
        ghost: "hover:bg-gold/10 hover:text-gold text-paper",
        danger: "bg-red-700 text-white hover:bg-red-600",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
