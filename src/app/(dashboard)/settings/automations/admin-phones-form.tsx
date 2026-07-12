"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { saveAdminPhonesAction } from "./actions";

export function AdminPhonesForm({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const r = await saveAdminPhonesAction(value);
      if (r.ok) toast("Admin recipients saved");
      else toast(r.error ?? "Failed", "error");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="9600759304, 9600700000"
        aria-label="Admin WhatsApp numbers"
        className="max-w-md flex-1"
      />
      <Button size="sm" variant="outline" loading={pending} onClick={save}>
        <Save className="size-4" /> Save
      </Button>
    </div>
  );
}
