"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { UserPlus, Search, ArrowLeft, Check, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeadForm, type LeadFormInitial } from "../lead-form";
import { searchCustomersAction } from "../actions";

type Contact = { name: string; designation: string; mobile: string };
type CustomerMatch = {
  id: string;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  segment: string | null;
  lastStatus: string;
  contacts: Contact[];
};

type Mode = "choose" | "new" | "existing";

export function NewLeadFlow() {
  const [mode, setMode] = useState<Mode>("choose");
  const [selected, setSelected] = useState<CustomerMatch | null>(null);

  if (mode === "new") {
    return (
      <div className="space-y-3">
        <BackBar onBack={() => setMode("choose")} label="New customer" />
        <LeadForm mode="create" />
      </div>
    );
  }

  if (mode === "existing" && selected) {
    const initial: LeadFormInitial = {
      customerName: selected.customerName,
      address: selected.address,
      phone: selected.phone,
      email: selected.email,
      source: "Reference",
      requirement: "",
      segment: selected.segment ?? "",
    };
    return (
      <div className="space-y-3">
        <BackBar onBack={() => setSelected(null)} label={`Existing customer: ${selected.customerName}`} />
        <div className="rounded-lg border border-primary/30 bg-primary-50 px-3 py-2 text-sm text-primary-700">
          Details pre-filled from this customer&apos;s record. Edit anything below, then add the new
          enquiry&apos;s requirement/sizing and save.
        </div>
        <LeadForm mode="create" initial={initial} initialContacts={selected.contacts} />
      </div>
    );
  }

  if (mode === "existing") {
    return (
      <div className="space-y-3">
        <BackBar onBack={() => setMode("choose")} label="Search existing customer" />
        <CustomerSearch onSelect={setSelected} />
      </div>
    );
  }

  // choose
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ChoiceCard
        icon={UserPlus}
        title="Add New Customer"
        description="Capture a brand-new enquiry with a fresh customer form."
        onClick={() => setMode("new")}
      />
      <ChoiceCard
        icon={Search}
        title="Search Existing Customer"
        description="Reuse a past customer's details — name, contact and address auto-fill."
        onClick={() => setMode("existing")}
      />
    </div>
  );
}

function ChoiceCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof UserPlus;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="size-5" />
      </span>
      <span className="text-base font-semibold">{title}</span>
      <span className="text-sm text-muted">{description}</span>
    </button>
  );
}

function BackBar({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> {label}
    </button>
  );
}

function CustomerSearch({ onSelect }: { onSelect: (c: CustomerMatch) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerMatch[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const res = await searchCustomersAction(q);
        setResults(res);
        setSearched(true);
      });
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone or address…"
            className="pl-9"
            aria-label="Search existing customers"
          />
          {pending && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" />}
        </div>

        {query.trim().length >= 2 && searched && results.length === 0 && !pending && (
          <p className="py-4 text-center text-sm text-muted">
            No matching customer. Go back and choose &ldquo;Add New Customer&rdquo;.
          </p>
        )}

        <div className="divide-y divide-border">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              className="group flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                {c.customerName.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{c.customerName}</span>
                  <Badge>{c.lastStatus}</Badge>
                </div>
                <div className="truncate text-xs text-muted">
                  {c.phone}
                  {c.address ? ` · ${c.address}` : ""}
                </div>
              </div>
              <Check className="size-4 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
