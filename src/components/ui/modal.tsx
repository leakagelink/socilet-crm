import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OverlayPortal } from "@/components/ui/overlay-portal";

export function Modal({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <OverlayPortal open={open} onClose={() => onOpenChange(false)}>
      <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center sm:p-4">
        <button
          type="button"
          aria-label="Close dialog"
          className="absolute inset-0 bg-black/65"
          onClick={() => onOpenChange(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="relative z-10 flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-panel shadow-2xl sm:max-h-[min(90dvh,52rem)] sm:w-[min(36rem,calc(100vw-2rem))] sm:flex-none sm:rounded-2xl sm:border sm:border-gold/25"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gold/15 bg-panel px-3 py-2.5 pt-[max(0.65rem,var(--sat))] sm:rounded-t-2xl sm:px-5 sm:pt-3">
            <h2 className="min-w-0 truncate text-base font-semibold sm:text-lg">{title}</h2>
            <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 sm:h-10 sm:w-10" aria-label="Close" onClick={() => onOpenChange(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="sheet-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-[max(1rem,var(--sab))] sm:px-5 sm:py-4">
            {children}
          </div>
        </div>
      </div>
    </OverlayPortal>
  );
}
