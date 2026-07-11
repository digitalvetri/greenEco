"use client";

import { useState, type ReactNode } from "react";
import { Tabs } from "@/components/ui/tabs";

/**
 * Client tab shell for the AMC detail — each panel's content is rendered on the
 * server and passed in, so the heavy cards stay server components while the tab
 * switching is client-side. Splits the old flat 2-card scroll.
 */
export function TabPanels({ tabs }: { tabs: { key: string; label: string; count?: number; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  return (
    <div>
      <Tabs
        className="mb-4"
        active={active}
        onChange={setActive}
        items={tabs.map((t) => ({ key: t.key, label: t.label, count: t.count }))}
      />
      {tabs.find((t) => t.key === active)?.content}
    </div>
  );
}
