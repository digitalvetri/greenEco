"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, Loader2, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Label } from "@/components/ui/input";
import { Field } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { listOrderOptionsAction, createInvoiceAction } from "./actions";
import { InvoicePanel } from "./invoice-panel";

interface OrderOption {
  id: string;
  orderNo: string;
  clientName: string;
}

export function NewInvoiceDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Form state
  const [orderId, setOrderId] = useState("");
  const [description, setDescription] = useState("");
  const [grossAmount, setGrossAmount] = useState("");
  const [gstRate, setGstRate] = useState("18");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);

  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoadingOrders(true);
    listOrderOptionsAction()
      .then(setOrders)
      .finally(() => setLoadingOrders(false));
  }, [open]);

  function reset() {
    setOrderId("");
    setDescription("");
    setGrossAmount("");
    setGstRate("18");
    setDate(new Date().toISOString().split("T")[0]);
  }

  function handleClose() {
    setOpen(false);
    reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(grossAmount.replace(/,/g, ""));
    if (!orderId) return toast("Select a project", "error");
    if (!description.trim()) return toast("Enter a description", "error");
    if (!amount || amount <= 0) return toast("Enter a valid amount", "error");

    startSubmit(async () => {
      const r = await createInvoiceAction({
        orderId,
        description: description.trim(),
        grossAmount: amount,
        gstRate: parseInt(gstRate, 10),
        date,
      });
      if (!r.ok) return toast(r.error ?? "Failed to create invoice", "error");
      toast("Draft invoice created — review and issue it");
      handleClose();
      router.refresh();
      if (r.invoiceId) {
        setPanelId(r.invoiceId);
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusCircle className="size-4" /> New Invoice
      </Button>

      {/* Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleClose}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative z-10 w-full max-w-md rounded-xl bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="size-5 text-primary" />
                <h2 className="text-base font-semibold">New Invoice</h2>
              </div>
              <button
                onClick={handleClose}
                className="rounded-lg p-1 text-muted hover:bg-surface"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Project selector */}
              <div>
                <Label required>Project</Label>
                {loadingOrders ? (
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <Loader2 className="size-3 animate-spin" /> Loading projects…
                  </div>
                ) : (
                  <Select
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    required
                  >
                    <option value="">— Select project —</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.orderNo} · {o.clientName}
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              {/* Description */}
              <Field label="Description" required>
                <Input
                  placeholder="e.g. Mobilisation advance — STP 50 KLD"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </Field>

              {/* Amount + GST Rate */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Total amount (₹ incl. GST)" required>
                  <Input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="e.g. 118000"
                    value={grossAmount}
                    onChange={(e) => setGrossAmount(e.target.value)}
                    required
                  />
                </Field>
                <div>
                  <Label>GST Rate</Label>
                  <Select value={gstRate} onChange={(e) => setGstRate(e.target.value)}>
                    <option value="18">18%</option>
                    <option value="12">12%</option>
                    <option value="5">5%</option>
                    <option value="0">0%</option>
                  </Select>
                </div>
              </div>

              {/* Date */}
              <div>
                <Label>Invoice date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              {/* GST note */}
              {grossAmount && parseFloat(grossAmount) > 0 && (
                <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">
                  GST ({gstRate}%) will be back-calculated from the total. A draft is created first — issue it to assign a permanent invoice number.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={submitting}>
                  Create Draft Invoice
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide-in panel to review & issue the newly created draft */}
      <InvoicePanel
        invoiceId={panelId}
        open={panelId !== null}
        onClose={() => setPanelId(null)}
        onChanged={() => router.refresh()}
      />
    </>
  );
}
