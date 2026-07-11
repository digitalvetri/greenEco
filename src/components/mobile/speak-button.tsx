"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * SpeakButton (spec §7.1). Web Speech API on-device, attempts ta-IN then en-IN
 * (Tanglish). When unsupported, it degrades to a disabled hint — the audio-record
 * + Sarvam/Whisper fallback route lands in Phase 4. Inserts editable text via
 * onTranscript; the caller keeps the raw transcript too.
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
    rec.lang = "ta-IN";
    rec.interimResults = true;
    rec.continuous = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (i < e.results.length - 1) finalText += t;
        else interim = t;
      }
      onTranscript((finalText + interim).trim(), (finalText + interim).trim());
    };
    rec.onerror = () => {
      // Retry once in en-IN if Tamil recognition errors out.
      if (rec.lang === "ta-IN") {
        rec.lang = "en-IN";
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
      title={supported ? "Speak (Tamil/English)" : "Voice input not supported on this browser"}
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
