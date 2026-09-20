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
      <div className="fixed inset-0 z-50">
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
          className="sheet-scroll absolute inset-x-3 top-[calc(var(--sat)+0.75rem)] bottom-[calc(var(--sab)+1rem)] z-10 overflow-y-auto rounded-2xl border border-white/12 bg-panel p-4 shadow-2xl sm:inset-x-auto sm:left-1/2 sm:top-[max(6vh,calc(var(--sat)+1rem))] sm:bottom-auto sm:max-h-[86vh] sm:w-[min(560px,calc(100%-1.5rem))] sm:-translate-x-1/2 sm:p-5"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{title}</h2>
            <Button variant="ghost" size="icon" aria-label="Close" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {children}
        </div>
      </div>
    </OverlayPortal>
  );
}
