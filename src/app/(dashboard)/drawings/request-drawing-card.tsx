"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { DRAWING_DISCIPLINES, DRAWING_PRIORITIES, DEFAULT_DRAWING_SLA_DAYS } from "@/lib/constants";
import { createDrawingRequestAction } from "./actions";

interface Option {
  id: string;
  label: string;
}

/** ISO yyyy-mm-dd, N days out — the date input's format. */
function inDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * "Ask for a drawing." Collapsed by default so the queue is what you see first —
 * people open this page to check on a request far more often than to raise one.
 *
 * A request can name a project, an enquiry, or neither. The two pickers are mutually
 * exclusive (the service refuses both), so choosing one clears the other rather than
 * letting the user build a request the server will reject.
 */
export function RequestDrawingCard({
  canDraw,
  projects,
  enquiries,
  members,
}: {
  canDraw: boolean;
  projects: Option[];
  enquiries: Option[];
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    title: "",
    discipline: "Layout" as (typeof DRAWING_DISCIPLINES)[number],
    attachTo: "" as "" | "project" | "enquiry",
    orderId: "",
    leadId: "",
    purpose: "",
    notes: "",
    dueDate: inDays(DEFAULT_DRAWING_SLA_DAYS),
    priority: "NORMAL" as (typeof DRAWING_PRIORITIES)[number],
    assignedToId: "",
  });

  if (!canDraw) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 pt-5 text-sm text-muted">
          <Lock className="size-4 shrink-0" />
          <span>
            You don&apos;t have drawing access yet, so you can&apos;t raise a request. Any request you
            raised before still shows below. An admin can enable it in Settings → Users.
          </span>
        </CardContent>
      </Card>
    );
  }

  function submit() {
    if (!f.title.trim()) {
      toast("Say what needs to be drawn", "error");
      return;
    }
    start(async () => {
      try {
        await createDrawingRequestAction({
          title: f.title.trim(),
          discipline: f.discipline,
          orderId: f.attachTo === "project" && f.orderId ? f.orderId : undefined,
          leadId: f.attachTo === "enquiry" && f.leadId ? f.leadId : undefined,
          purpose: f.purpose.trim() || undefined,
          notes: f.notes.trim() || undefined,
          dueDate: f.dueDate ? new Date(f.dueDate) : undefined,
          priority: f.priority,
          assignedToId: f.assignedToId || undefined,
        });
        toast("Drawing requested.");
        setF((p) => ({ ...p, title: "", purpose: "", notes: "", orderId: "", leadId: "", attachTo: "" }));
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not raise the request", "error");
      }
    });
  }

  if (!open) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="min-w-0">
            <p className="text-sm font-medium">Need a drawing?</p>
            <p className="text-xs text-muted">
              Say what you need and by when. It appears here the moment it&apos;s uploaded — you can
              accept it or send it back for a revision.
            </p>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Request a drawing
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Request a drawing</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="What needs to be drawn?" required hint="This becomes the drawing's title, and its revisions track against it.">
          <Input
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            placeholder="e.g. GA layout — 30 KLD STP, plant room"
            autoFocus
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Discipline">
            <Select
              value={f.discipline}
              onChange={(e) => setF({ ...f, discipline: e.target.value as (typeof DRAWING_DISCIPLINES)[number] })}
            >
              {DRAWING_DISCIPLINES.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </Select>
          </Field>
          <Field label="Needed by" hint={`Defaults to ${DEFAULT_DRAWING_SLA_DAYS} days`}>
            <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </Field>
          <Field label="Priority">
            <Select
              value={f.priority}
              onChange={(e) => setF({ ...f, priority: e.target.value as (typeof DRAWING_PRIORITIES)[number] })}
            >
              {DRAWING_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p[0] + p.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What's it for?" hint="Optional — a project, an enquiry, or nothing at all.">
            <Select
              value={f.attachTo}
              onChange={(e) =>
                // Switching target clears the other id, so the server never sees both.
                setF({ ...f, attachTo: e.target.value as "" | "project" | "enquiry", orderId: "", leadId: "" })
              }
            >
              <option value="">Not linked to anything</option>
              <option value="project">A project</option>
              <option value="enquiry">An enquiry we&apos;re quoting</option>
            </Select>
          </Field>

          {f.attachTo === "project" && (
            <Field label="Project">
              <Select value={f.orderId} onChange={(e) => setF({ ...f, orderId: e.target.value })}>
                <option value="">Select a project…</option>
                {projects.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {f.attachTo === "enquiry" && (
            <Field label="Enquiry">
              <Select value={f.leadId} onChange={(e) => setF({ ...f, leadId: e.target.value })}>
                <option value="">Select an enquiry…</option>
                {enquiries.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {members.length > 0 && (
          <Field label="Assign to" hint="Leave blank to put it in the shared queue.">
            <Select value={f.assignedToId} onChange={(e) => setF({ ...f, assignedToId: e.target.value })}>
              <option value="">Anyone on the drawing team</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Details" hint="Dimensions, constraints, what it's needed for — anything the draughtsman shouldn't have to ask for.">
          <Textarea
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
            placeholder="e.g. invert level is 2.5 ft, plant room is 4m × 6m, client wants the blower outside the room"
          />
        </Field>

        <Button disabled={pending} onClick={submit}>
          <Send className="size-4" /> {pending ? "Sending…" : "Send request"}
        </Button>
      </CardContent>
    </Card>
  );
}
