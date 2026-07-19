"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { CompanySettings } from "@/server/services/company-settings";
import { updateCompanyDetailsAction, updateThresholdsAction } from "./actions";

export function CompanyDetailsCard({ settings }: { settings: CompanySettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    name: settings.name,
    gstin: settings.gstin,
    stateCode: settings.stateCode,
    address: settings.address,
    logoUrl: settings.logoUrl,
    invoicePrefix: settings.invoicePrefix,
    orderPrefix: settings.orderPrefix,
    proposalPrefix: settings.proposalPrefix,
    poPrefix: settings.poPrefix,
    tagline: settings.tagline,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    branches: settings.branches.join(", "),
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  function save() {
    start(async () => {
      const res = await updateCompanyDetailsAction({
        ...f,
        branches: f.branches.split(",").map((b) => b.trim()).filter(Boolean),
      });
      if (res.ok) {
        toast(res.message ?? "Saved");
        router.refresh();
      } else toast(res.error ?? "Failed to save", "error");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="size-3.5" /> Company details
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field label="Company name" required>
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="GSTIN">
            <Input value={f.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} placeholder="33ABCDE1234F1Z5" />
          </Field>
          <Field label="State code" hint="2-digit GST state prefix.">
            <Input value={f.stateCode} onChange={(e) => set("stateCode", e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="33" />
          </Field>
        </div>
        <Field label="Address">
          <Input value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Registered / billing address" />
        </Field>
        <Field label="Logo URL" hint="Public image URL used on documents (optional).">
          <Input value={f.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…" />
        </Field>

        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Letterhead — every Proposal / Invoice / PO / Close-out PDF
          </p>
          <Field label="Tagline">
            <Input value={f.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="It's our future" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="6304984052, 8122773433" />
            </Field>
            <Field label="Email">
              <Input value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="you@greenecocare.com" />
            </Field>
          </div>
          <Field label="Website">
            <Input value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="www.greenecocare.com" />
          </Field>
          <Field label="Branches" hint="Comma-separated, shown in the PDF footer.">
            <Input value={f.branches} onChange={(e) => set("branches", e.target.value)} placeholder="Bangalore, Hyderabad, Cochin, Mangalore, Chennai" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
          <Field label="Invoice #">
            <Input value={f.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value)} />
          </Field>
          <Field label="Order #">
            <Input value={f.orderPrefix} onChange={(e) => set("orderPrefix", e.target.value)} />
          </Field>
          <Field label="Proposal #">
            <Input value={f.proposalPrefix} onChange={(e) => set("proposalPrefix", e.target.value)} />
          </Field>
          <Field label="PO #">
            <Input value={f.poPrefix} onChange={(e) => set("poPrefix", e.target.value)} />
          </Field>
        </div>
        <p className="text-[11px] text-muted">
          Document prefixes apply to numbers issued from now on; existing documents keep their number.
        </p>
        <div className="flex justify-end">
          <Button size="sm" loading={pending} onClick={save}>
            Save company details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ThresholdsCard({ settings }: { settings: CompanySettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [margin, setMargin] = useState(String(Math.round(settings.minMarginPct * 100)));
  const [limit, setLimit] = useState(String(settings.autoApproveLimit));
  const [alerts, setAlerts] = useState(settings.budgetAlertPct.join(", "));
  const [mult, setMult] = useState(String(settings.lowStockMultiplier));

  function save() {
    const budgetAlertPct = alerts
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    start(async () => {
      const res = await updateThresholdsAction({
        minMarginPct: Number(margin) / 100,
        autoApproveLimit: Number(limit) || 0,
        budgetAlertPct,
        lowStockMultiplier: Number(mult),
      });
      if (res.ok) {
        toast(res.message ?? "Saved");
        router.refresh();
      } else toast(res.error ?? "Failed to save", "error");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="size-3.5" /> Thresholds
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min margin %" hint="Blocks approving a proposal below this margin.">
            <Input value={margin} inputMode="numeric" onChange={(e) => setMargin(e.target.value.replace(/[^\d]/g, ""))} placeholder="10" />
          </Field>
          <Field label="Auto-approve limit ₹" hint="Site purchases ≤ this auto-approve. 0 = all manual.">
            <Input value={limit} inputMode="numeric" onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" />
          </Field>
        </div>
        <Field label="Budget alert thresholds %" hint="Comma-separated, e.g. 70, 90, 100.">
          <Input value={alerts} onChange={(e) => setAlerts(e.target.value)} placeholder="70, 90, 100" />
        </Field>
        <Field label="Low-stock reorder multiplier" hint="Flag items below reorder level × this (1 = at level, 1.5 = early buffer).">
          <Input value={mult} inputMode="decimal" onChange={(e) => setMult(e.target.value.replace(/[^\d.]/g, ""))} placeholder="1" />
        </Field>
        <p className="text-[11px] text-muted">Saved values take effect on the next automation run — no redeploy needed.</p>
        <div className="flex justify-end">
          <Button size="sm" loading={pending} onClick={save}>
            Save thresholds
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
