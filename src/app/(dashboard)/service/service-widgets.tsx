"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Ticket, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { createContractAction, createTicketAction, updateTicketAction } from "./actions";

interface Opt {
  id: string;
  label: string;
}

const FREQ_VISITS: Record<string, number> = { MONTHLY: 12, QUARTERLY: 4, HALF_YEARLY: 2, YEARLY: 1 };

export function NewContractButton({ orders, isAdmin }: { orders: Opt[]; isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  // Lazy initializer: reading the clock during render is impure (and risks an
  // SSR/hydration mismatch across midnight). Compute the date defaults once,
  // client-side, on first mount.
  const [f, setF] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    return {
      orderId: "",
      clientName: "",
      siteAddress: "",
      startDate: today,
      endDate: nextYear,
      annualValue: "",
      frequency: "QUARTERLY",
    };
  });

  if (!isAdmin) return null;

  function submit() {
    start(async () => {
      try {
        const res = await createContractAction({
          orderId: f.orderId || undefined,
          clientName: f.clientName,
          siteAddress: f.siteAddress,
          startDate: f.startDate,
          endDate: f.endDate,
          annualValue: Number(f.annualValue),
          frequency: f.frequency,
          visitsPerYear: FREQ_VISITS[f.frequency],
        });
        toast(`AMC ${res.contractNo} created — ${res.visits} visits scheduled`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed", "error");
      }
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New AMC
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New Service Contract (AMC)">
        <div className="space-y-3">
          <Field label="Link to project (optional)">
            <Select value={f.orderId} onChange={(e) => {
              const o = orders.find((x) => x.id === e.target.value);
              setF({ ...f, orderId: e.target.value, clientName: o ? o.label.split(" · ")[1] ?? f.clientName : f.clientName });
            }}>
              <option value="">— standalone —</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Client" required>
              <Input value={f.clientName} onChange={(e) => setF({ ...f, clientName: e.target.value })} />
            </Field>
            <Field label="Annual value ₹" required>
              <Input value={f.annualValue} onChange={(e) => setF({ ...f, annualValue: e.target.value })} />
            </Field>
          </div>
          <Field label="Site address" required>
            <Input value={f.siteAddress} onChange={(e) => setF({ ...f, siteAddress: e.target.value })} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Start">
              <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
            </Field>
            <Field label="End">
              <Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
            </Field>
            <Field label="Frequency">
              <Select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}>
                {Object.keys(FREQ_VISITS).map((k) => (
                  <option key={k} value={k}>{k.replace(/_/g, " ")}</option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="text-xs text-muted">
            {FREQ_VISITS[f.frequency]} preventive-maintenance visits/year will be auto-scheduled.
          </p>
          <Button className="w-full" loading={pending} disabled={!f.clientName || !f.annualValue || !f.siteAddress} onClick={submit}>
            <CalendarPlus className="size-4" /> Create & schedule visits
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export function NewTicketButton({ contracts }: { contracts: Opt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ contractId: "", title: "", description: "", raisedBy: "", priority: "MEDIUM" });

  function submit() {
    start(async () => {
      try {
        const res = await createTicketAction({
          contractId: f.contractId || undefined,
          title: f.title,
          description: f.description,
          raisedBy: f.raisedBy || "Client",
          priority: f.priority,
        });
        toast(`Ticket ${res.ticketNo} raised`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed", "error");
      }
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Ticket className="size-4" /> Raise Ticket
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Raise Service Ticket">
        <div className="space-y-3">
          <Field label="Contract (optional)">
            <Select value={f.contractId} onChange={(e) => setF({ ...f, contractId: e.target.value })}>
              <option value="">— none —</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Title" required>
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Blower not starting" />
          </Field>
          <Field label="Description" required>
            <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Raised by">
              <Input value={f.raisedBy} onChange={(e) => setF({ ...f, raisedBy: e.target.value })} placeholder="Client / staff" />
            </Field>
            <Field label="Priority">
              <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Button className="w-full" loading={pending} disabled={!f.title || !f.description} onClick={submit}>
            Raise ticket
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export function TicketRow({
  ticket,
}: {
  ticket: { id: string; ticketNo: string; title: string; priority: string; status: string; slaBreached: boolean; raisedBy: string };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const priorityVariant = ticket.priority === "CRITICAL" || ticket.priority === "HIGH" ? "danger" : ticket.priority === "MEDIUM" ? "warn" : "default";
  const statusVariant = ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "ok" : ticket.status === "IN_PROGRESS" ? "primary" : "default";

  function advance(status: string) {
    start(async () => {
      try {
        await updateTicketAction(ticket.id, { status });
        toast(`Ticket ${status.toLowerCase()}`);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not update ticket", "error");
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">{ticket.ticketNo}</span>
          <Badge variant={priorityVariant}>{ticket.priority}</Badge>
          {ticket.slaBreached && ticket.status !== "RESOLVED" && ticket.status !== "CLOSED" && (
            <Badge variant="danger">SLA breached</Badge>
          )}
        </div>
        <div className="mt-0.5 truncate text-sm font-medium">{ticket.title}</div>
        <div className="text-xs text-muted">by {ticket.raisedBy}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={statusVariant}>{ticket.status.replace(/_/g, " ")}</Badge>
        {ticket.status === "OPEN" && (
          <Button size="sm" variant="outline" loading={pending} onClick={() => advance("IN_PROGRESS")}>
            Start
          </Button>
        )}
        {ticket.status === "IN_PROGRESS" && (
          <Button size="sm" loading={pending} onClick={() => advance("RESOLVED")}>
            Resolve
          </Button>
        )}
      </div>
    </div>
  );
}
