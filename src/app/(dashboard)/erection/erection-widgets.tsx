"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, HelpCircle, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { Uploader, Thumb } from "@/components/mobile/uploader";
import { formatINR } from "@/lib/money";
import { createEntryAction, reviewEntryAction } from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, okMsg: string, done?: () => void) => {
    start(async () => {
      try {
        await fn();
        toast(okMsg);
        done?.();
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Something went wrong", "error");
      }
    });
  };
  return { run, pending };
}

export function EntryForm({ projects }: { projects: { id: string; label: string }[] }) {
  const { run, pending } = useRun();
  const [f, setF] = useState({ orderId: "", type: "LABOUR", description: "", gangOrShop: "", amount: "", paymentMode: "CASH" });
  const [bills, setBills] = useState<{ url: string; name: string }[]>([]);

  const needsBill = f.type === "SITE_PURCHASE";

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>New Erection Entry</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Project" required>
            <Select value={f.orderId} onChange={(e) => setF({ ...f, orderId: e.target.value })}>
              <option value="">Choose project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="LABOUR">Labour</option>
              <option value="SITE_PURCHASE">Site Purchase</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. tank shuttering — 4 masons, 6 helpers" className="min-h-14" />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Gang / Shop">
            <Input value={f.gangOrShop} onChange={(e) => setF({ ...f, gangOrShop: e.target.value })} />
          </Field>
          <Field label="Amount ₹">
            <Input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
          <Field label="Payment">
            <Select value={f.paymentMode} onChange={(e) => setF({ ...f, paymentMode: e.target.value })}>
              {["CASH", "UPI", "NEFT", "CHEQUE"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <Uploader label={needsBill ? "Bill photo (required)" : "Bill photo"} capture onUploaded={(files) => setBills([...bills, ...files])} />
            {needsBill && bills.length === 0 && <span className="text-xs text-danger">Site purchase needs a bill</span>}
          </div>
          <div className="mt-2 flex gap-2">
            {bills.map((b, i) => (
              <Thumb key={i} url={b.url} onRemove={() => setBills(bills.filter((_, j) => j !== i))} />
            ))}
          </div>
        </div>
        <Button
          disabled={pending || !f.orderId || !f.amount || (needsBill && bills.length === 0)}
          onClick={() =>
            run(
              () =>
                createEntryAction({
                  orderId: f.orderId,
                  type: f.type,
                  date: new Date(),
                  description: f.description,
                  gangOrShop: f.gangOrShop || undefined,
                  amount: Number(f.amount),
                  paymentMode: f.paymentMode,
                  billImages: bills.map((b) => ({ url: b.url })),
                }),
              "Entry submitted",
              () => {
                setF({ ...f, description: "", gangOrShop: "", amount: "" });
                setBills([]);
              },
            )
          }
        >
          {pending ? "Saving…" : "Submit entry"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function VerificationCard({
  entry,
}: {
  entry: {
    id: string;
    type: string;
    description: string;
    amount: string;
    status: string;
    gangOrShop: string | null;
    billImages: { url: string }[];
    orderNo: string;
    createdById: string;
  };
}) {
  const { run, pending } = useRun();
  const [note, setNote] = useState("");
  const variant = entry.status === "APPROVED" ? "ok" : entry.status === "REJECTED" ? "danger" : entry.status === "QUERIED" ? "warn" : "default";
  const reviewable = entry.status === "PENDING" || entry.status === "QUERIED";

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="primary">{entry.type.replace(/_/g, " ")}</Badge>
            <span className="font-mono text-xs text-muted">{entry.orderNo}</span>
            <Badge variant={variant}>{entry.status}</Badge>
          </div>
          <div className="mt-1 text-sm">{entry.description}</div>
          {entry.gangOrShop && <div className="text-xs text-muted">{entry.gangOrShop}</div>}
        </div>
        <div className="text-right font-semibold">{formatINR(entry.amount)}</div>
      </div>
      <div className="mt-2 flex gap-2">
        {entry.billImages.map((b, i) => (
          <a key={i} href={b.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.url} alt="bill" className="size-16 rounded border border-border object-cover" />
          </a>
        ))}
      </div>
      {reviewable && (
        <div className="mt-2 flex items-center gap-2">
          <Input className="h-8 flex-1" placeholder="Query/note" aria-label="Review note" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" aria-label="Approve entry" disabled={pending} onClick={() => run(() => reviewEntryAction(entry.id, "APPROVE"), "Entry approved")}>
            <Check className="size-4" />
          </Button>
          {entry.status === "PENDING" && (
            <Button size="sm" variant="outline" aria-label="Query entry" disabled={pending || !note} onClick={() => run(() => reviewEntryAction(entry.id, "QUERY", note), "Entry queried")}>
              <HelpCircle className="size-4" />
            </Button>
          )}
          <Button size="sm" variant="danger" aria-label="Reject entry" disabled={pending} onClick={() => run(() => reviewEntryAction(entry.id, "REJECT", note), "Entry rejected")}>
            <X className="size-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}
