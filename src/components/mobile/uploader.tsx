"use client";

import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { Camera, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * PhotoCapture / file uploader (spec §7.3, §mobile). Compresses images
 * client-side to ≤ 400KB before upload; returns {url, name} for each file.
 * Optionally geo-tags via callback. Used for stage photos, drawings, bill images.
 */
export function Uploader({
  onUploaded,
  accept = "image/*",
  capture,
  label = "Add photo",
  multiple = true,
  compress = true,
  className,
}: {
  onUploaded: (files: { url: string; name: string }[]) => void;
  accept?: string;
  capture?: boolean;
  label?: string;
  multiple?: boolean;
  compress?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setErr(null);
    const out: { url: string; name: string }[] = [];
    try {
      for (const f of Array.from(files)) {
        let file = f;
        if (compress && f.type.startsWith("image/")) {
          file = await imageCompression(f, { maxSizeMB: 0.4, maxWidthOrHeight: 1600 });
        }
        const fd = new FormData();
        fd.append("file", file, f.name);
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        if (!res.ok) throw new Error("Upload failed");
        out.push(await res.json());
      }
      onUploaded(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10",
        )}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        {busy ? "Uploading…" : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        {...(capture ? { capture: "environment" } : {})}
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}

export function Thumb({ url, onRemove }: { url: string; onRemove?: () => void }) {
  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="upload" className="size-16 rounded-lg border border-border object-cover" />
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-danger text-white"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
