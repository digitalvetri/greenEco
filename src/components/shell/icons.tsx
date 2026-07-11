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
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/lib/nav";

const REGISTRY: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  leads: Users,
  proposals: FileText,
  projects: HardHat,
  service: LifeBuoy,
  clients: Contact,
  materials: Boxes,
  erection: Wrench,
  invoices: Receipt,
  reports: BarChart3,
  settings: Settings,
};

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  const Icon = REGISTRY[name] ?? LayoutDashboard;
  return <Icon className={className} />;
}
