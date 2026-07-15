"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { MessageCircle, X, Send, Leaf, ArrowRight } from "lucide-react";
import { askEcoAction } from "./eco-actions";

type Source = { title: string; href?: string };
type Msg = { role: "user" | "eco"; text: string; sources?: Source[] };

const SUGGESTIONS = [
  "How do I create an invoice?",
  "Where are my follow-ups?",
  "How do I edit client details?",
  "How do I turn a lead into a proposal?",
];

const WELCOME: Msg = {
  role: "eco",
  text: "Hi, I'm Eco 🌿 — your in-app helper. Ask me how to do things in the app, and I'll walk you through it.",
};

export function EcoChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    start(async () => {
      try {
        const res = await askEcoAction(q);
        setMessages((m) => [...m, { role: "eco", text: res.answer, sources: res.sources }]);
      } catch {
        setMessages((m) => [
          ...m,
          { role: "eco", text: "Sorry, something went wrong. Please try again." },
        ]);
      }
    });
  }

  return (
    <>
      {/* Floating launcher — visible on every page */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close Eco help" : "Open Eco help"}
        className="fixed bottom-4 right-4 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/5 transition-transform hover:scale-105 md:bottom-6 md:right-6"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-4 z-40 flex h-[70vh] max-h-[560px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl md:bottom-24 md:right-6">
          {/* Header */}
          <div className="flex items-center gap-2.5 bg-gradient-to-r from-primary to-teal-600 px-4 py-3 text-white">
            <span className="flex size-8 items-center justify-center rounded-full bg-white/20">
              <Leaf className="size-4" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Eco</div>
              <div className="text-[11px] text-white/80">App help & how-to</div>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm " +
                    (m.role === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-surface text-foreground")
                  }
                >
                  {m.text}
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
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-sm text-muted">
                  <span className="inline-flex gap-1">
                    <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.2s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.1s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-muted" />
                  </span>
                </div>
              </div>
            )}

            {/* Suggestions (only before the user has asked anything) */}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
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
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask how to…"
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
