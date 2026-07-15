"use client";

import { useEffect, useRef, useState, useTransition, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { MessageCircle, X, Send, Leaf, ArrowRight, Mic, MicOff, Volume2, VolumeX, Languages } from "lucide-react";
import { askEcoAction } from "./eco-actions";

type Lang = "en" | "ta";
type Source = { title: string; href?: string };
type Msg = { role: "user" | "eco"; text: string; sources?: Source[] };
type HistoryEntry = { role: "user" | "eco"; text: string };

const SUGGESTIONS: Record<Lang, string[]> = {
  en: [
    "How do I create an invoice?",
    "Where are my follow-ups?",
    "How do I add a new lead?",
    "How do I turn a lead into a proposal?",
  ],
  ta: [
    "Invoice எப்படி உருவாக்குவது?",
    "Follow-ups எங்கே பார்க்கலாம்?",
    "புதிய Lead எப்படி சேர்ப்பது?",
    "Lead-ஐ Proposal ஆக மாற்றுவது எப்படி?",
  ],
};

const WELCOME: Record<Lang, string> = {
  en: "Hi, I'm Eco 🌿 — your AI assistant for Green Ecocare CRM.\n\nAsk me anything about leads, proposals, invoices, projects, materials, or how to use this app. I also support Tamil — tap the TA button. Voice input available on Chrome — tap the mic!",
  ta: "வணக்கம்! நான் Eco 🌿 — உங்கள் Green Ecocare CRM AI உதவியாளர்.\n\nLeads, proposals, invoices, projects, materials பற்றி எதுவும் கேளுங்கள். குரல் மூலமும் கேட்கலாம் — mic பொத்தானை அழுத்துங்கள்!",
};

function isTamilText(s: string): boolean {
  return /[஀-௿]/.test(s);
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ");
}

export function EcoChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Lang>("en");
  const [messages, setMessages] = useState<Msg[]>([{ role: "eco", text: WELCOME.en }]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const [recording, setRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognizerRef = useRef<any>(null);

  // Check speech API support on mount (client only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      setSpeechSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    }
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  function switchLang(newLang: Lang) {
    setLang(newLang);
    setMessages([{ role: "eco", text: WELCOME[newLang] }]);
    if (recognizerRef.current) {
      recognizerRef.current.stop();
      setRecording(false);
    }
  }

  function speak(text: string) {
    if (!voiceEnabled || typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanForSpeech(text));
    utterance.lang = lang === "ta" ? "ta-IN" : "en-IN";
    utterance.rate = 0.92;
    utterance.pitch = 1.05;
    const voices = window.speechSynthesis.getVoices();
    const targetLang = lang === "ta" ? "ta" : "en";
    const match = voices.find((v) => v.lang.startsWith(targetLang));
    if (match) utterance.voice = match;
    window.speechSynthesis.speak(utterance);
  }

  const startRecording = useCallback(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionCtor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognizer = new SpeechRecognitionCtor();
    recognizer.lang = lang === "ta" ? "ta-IN" : "en-IN";
    recognizer.continuous = false;
    recognizer.interimResults = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognizer.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript as string;
      setInput(transcript);
      setRecording(false);
    };
    recognizer.onerror = () => setRecording(false);
    recognizer.onend = () => setRecording(false);

    recognizerRef.current = recognizer;
    recognizer.start();
    setRecording(true);
  }, [lang]);

  function stopRecording() {
    recognizerRef.current?.stop();
    setRecording(false);
  }

  function handleInput(value: string) {
    setInput(value);
    // Auto-detect Tamil script
    if (isTamilText(value) && lang !== "ta") {
      setLang("ta");
    }
  }

  function buildHistory(): HistoryEntry[] {
    // Pass last 6 messages (skip initial welcome)
    return messages
      .filter((_, i) => i > 0)
      .slice(-6)
      .map((m) => ({ role: m.role, text: m.text }));
  }

  function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;

    const activeLang = isTamilText(q) ? "ta" : lang;
    if (activeLang !== lang) setLang(activeLang);

    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    const history = buildHistory();

    start(async () => {
      try {
        const res = await askEcoAction({ question: q, lang: activeLang, history, page: pathname });
        const ecoMsg: Msg = { role: "eco", text: res.answer, sources: res.sources };
        setMessages((m) => [...m, ecoMsg]);
        speak(res.answer);
      } catch {
        const errText =
          activeLang === "ta"
            ? "மன்னிக்கவும், ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்."
            : "Sorry, something went wrong. Please try again.";
        setMessages((m) => [...m, { role: "eco", text: errText }]);
      }
    });
  }

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close Eco AI Assistant" : "Open Eco AI Assistant"}
        className="fixed bottom-4 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105 md:bottom-6 md:right-6"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-4 z-40 flex h-[75vh] max-h-[600px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:bottom-24 md:right-6">
          {/* Header */}
          <div className="flex items-center gap-2 bg-gradient-to-r from-primary to-teal-600 px-3 py-2.5 text-white">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20">
              <Leaf className="size-4" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-sm font-semibold">Eco AI Assistant</div>
              <div className="truncate text-[11px] text-white/80">
                {lang === "ta"
                  ? "Green Ecocare CRM உதவியாளர்"
                  : "Green Ecocare CRM • AI powered"}
              </div>
            </div>
            {/* Language toggle */}
            <button
              type="button"
              onClick={() => switchLang(lang === "en" ? "ta" : "en")}
              className="flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-xs font-bold text-white hover:bg-white/30"
              title="Switch language / மொழி மாற்று"
            >
              <Languages className="size-3" />
              {lang === "en" ? "TA" : "EN"}
            </button>
            {/* Voice toggle */}
            <button
              type="button"
              onClick={() => setVoiceEnabled((v) => !v)}
              className="shrink-0 rounded-full p-1 text-white/80 hover:text-white"
              title={voiceEnabled ? "Mute voice output" : "Enable voice output"}
              aria-label={voiceEnabled ? "Mute voice output" : "Enable voice output"}
            >
              {voiceEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user" ? "flex justify-end" : "flex items-end gap-1.5"
                }
              >
                {m.role === "eco" && (
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                    E
                  </span>
                )}
                <div
                  className={
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm " +
                    (m.role === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-surface text-foreground")
                  }
                >
                  {m.text}
                  {m.role === "eco" && (
                    <button
                      type="button"
                      onClick={() => speak(m.text)}
                      className="ml-1.5 inline-flex items-center text-muted hover:text-primary"
                      title={lang === "ta" ? "声에 கேளுங்கள்" : "Read aloud"}
                      aria-label="Read aloud"
                    >
                      <Volume2 className="size-3" />
                    </button>
                  )}
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                      {m.sources
                        .filter((s) => s.href)
                        .map((s, j) => (
                          <Link
                            key={j}
                            href={s.href!}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <ArrowRight className="size-3" /> {s.title}
                          </Link>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {pending && (
              <div className="flex items-end gap-1.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  E
                </span>
                <div className="rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-sm text-muted">
                  <span className="inline-flex gap-1">
                    <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.2s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.1s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted" />
                  </span>
                </div>
              </div>
            )}

            {/* Suggestion chips — only on fresh chat */}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS[lang].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            className="flex items-center gap-2 border-t border-border p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            {/* Mic button */}
            {speechSupported && (
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                className={
                  "flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors " +
                  (recording
                    ? "animate-pulse border-danger/60 bg-danger/10 text-danger"
                    : "border-border bg-card text-muted hover:border-primary/50 hover:text-primary")
                }
                title={
                  recording
                    ? lang === "ta"
                      ? "நிறுத்து"
                      : "Stop recording"
                    : lang === "ta"
                    ? "குரல் உள்ளீடு"
                    : "Voice input"
                }
                aria-label={recording ? "Stop recording" : "Start voice input"}
              >
                {recording ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </button>
            )}

            <input
              value={input}
              onChange={(e) => handleInput(e.target.value)}
              placeholder={
                lang === "ta" ? "கேள்வி கேளுங்கள்…" : "Ask anything about the app…"
              }
              aria-label="Ask Eco a question"
              className="h-9 flex-1 rounded-full border border-border bg-background px-3 text-sm outline-none focus:border-primary/50"
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label="Send"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
