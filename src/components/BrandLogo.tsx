import { BRAND_LOGO } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  alt = "Socilet",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={BRAND_LOGO}
      alt={alt}
      className={cn("brand-mark object-contain object-center", className)}
    />
  );
}
