import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <Dialog.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-black/65"
          onClick={() => onOpenChange(false)}
        />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="sheet-scroll fixed inset-x-3 top-[7dvh] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 overflow-y-scroll rounded-2xl border border-white/12 bg-panel p-4 shadow-2xl sm:inset-x-auto sm:left-1/2 sm:top-[6vh] sm:bottom-auto sm:h-auto sm:max-h-[86vh] sm:w-[min(560px,calc(100%-1.5rem))] sm:-translate-x-1/2 sm:p-5"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
