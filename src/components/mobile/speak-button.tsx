"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SpeakButton (spec §7.1). Web Speech API on-device in Indian English (en-IN) so the
 * transcript comes out in Latin script — English, or Tanglish (Tamil-English mix)
 * romanized — not Tamil script (ta-IN garbles mixed/English speech). When unsupported,
 * it degrades to a disabled hint. Inserts editable text via onTranscript.
 */
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

export function SpeakButton({
  onTranscript,
  className,
}: {
  onTranscript: (text: string, raw: string) => void;
  className?: string;
}) {
  const [listening, setListening] = useState(false);
  // Computed after mount to avoid a server/client hydration mismatch.
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setSupported(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
  }, []);

  function toggle() {
    if (!supported) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as new () => SpeechRecognitionLike;
    const rec = new Ctor();
    // Indian English → Latin-script output (English / romanized Tanglish), not Tamil script.
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      // `e.results` already holds every result (final + the live interim) since the
      // session started, so rebuild the full transcript each event — never accumulate
      // into an outer variable (that re-adds earlier results and duplicates the text).
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      const clean = text.trim().replace(/\s+/g, " ");
      onTranscript(clean, clean);
    };
    rec.onerror = () => {
      // Retry once in generic English if en-IN errors out on this browser.
      if (rec.lang === "en-IN") {
        rec.lang = "en-US";
        try {
          rec.start();
          return;
        } catch {
          /* ignore */
        }
      }
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!supported}
      title={supported ? "Speak (English / Tanglish)" : "Voice input not supported on this browser"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
        listening
          ? "border-danger bg-danger/10 text-danger"
          : supported
            ? "border-border bg-card text-primary hover:bg-primary/10"
            : "border-border bg-card text-muted opacity-60",
        className,
      )}
    >
      {listening ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : supported ? (
        <Mic className="size-3.5" />
      ) : (
        <MicOff className="size-3.5" />
      )}
      {listening ? "Listening…" : "Speak"}
    </button>
  );
}
