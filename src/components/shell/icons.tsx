"use client";

import {
  LayoutDashboard,
  Users,
  FileText,
  HardHat,
  Contact,
  Boxes,
  Wrench,
  Receipt,
  BarChart3,
  Settings,
  LifeBuoy,
  CalendarClock,
  DraftingCompass,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/lib/nav";

const REGISTRY: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  followups: CalendarClock,
  leads: Users,
  proposals: FileText,
  projects: HardHat,
  service: LifeBuoy,
  clients: Contact,
  materials: Boxes,
  erection: Wrench,
  drawings: DraftingCompass,
  invoices: Receipt,
  reports: BarChart3,
  settings: Settings,
};

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  const Icon = REGISTRY[name] ?? LayoutDashboard;
  return <Icon className={className} />;
}
