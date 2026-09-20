import { Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { canAddAttachment, fileToAttachment, type Attachment } from "@/lib/attachments";

export function FileAttachments({
  files,
  onChange,
}: {
  files: Attachment[];
  onChange: (next: Attachment[]) => void;
}) {
  return (
    <div className="grid gap-2 rounded-xl border border-gold/25 bg-gold/5 p-3">
      <Label>Proofs / files</Label>
      <p className="text-xs text-paper/50">Contract, screenshot, payment proof — max 4 files, 700KB each. Stored with the record.</p>
      {files.map((f) => (
        <div key={f.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-gold/20 bg-panel px-3 py-2 text-sm">
          <Paperclip className="h-4 w-4 shrink-0 text-gold" />
          <a href={f.data} download={f.name} className="min-w-0 truncate text-gold underline">
            {f.name}
          </a>
          <Button type="button" variant="ghost" size="icon" className="ml-auto shrink-0" aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((x) => x.id !== f.id))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {canAddAttachment(files) ? (
        <input
          type="file"
          accept="image/*,.pdf,.doc,.docx"
          className="text-sm"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              onChange([...files, await fileToAttachment(file)]);
            } catch (err) {
              window.alert(err instanceof Error ? err.message : "Upload failed");
            }
          }}
        />
      ) : (
        <p className="text-xs text-paper/45">File limit reached.</p>
      )}
    </div>
  );
}
