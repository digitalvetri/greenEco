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
  disabled = false,
  scope,
}: {
  onUploaded: (files: { url: string; name: string }[]) => void;
  accept?: string;
  capture?: boolean;
  label?: string;
  multiple?: boolean;
  compress?: boolean;
  className?: string;
  /** Blocks the picker entirely. Use when the surrounding form isn't ready — the file
   *  is in storage the moment it's picked, so bailing out afterwards orphans it. */
  disabled?: boolean;
  /** "secure" stores the file behind a login instead of at a public-but-unguessable
   *  URL. Use for internal documents (drawings) that no customer receives by link. */
  scope?: "secure";
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
        if (scope) fd.append("scope", scope);
        const res = await fetch("/api/uploads", { method: "POST", body: fd });
        if (!res.ok) {
          // Surface the SERVER's reason. It was discarded in favour of a generic
          // "Upload failed", so a user hitting the size ceiling or the file-type
          // allowlist had no idea which — and no idea what to do about it.
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Upload failed (${res.status})`);
        }
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
        disabled={busy || disabled}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10",
          disabled && "cursor-not-allowed opacity-50 hover:bg-card",
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
