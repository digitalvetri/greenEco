import type { CalendarEventType } from "@/server/services/calendar";

export type EventColor = { bg: string; text: string; dot: string; label: string };

const BASE: Record<CalendarEventType, EventColor> = {
  CALL:       { bg: "#3b82f6", text: "#fff", dot: "#3b82f6", label: "Call" },
  MEETING:    { bg: "#22c55e", text: "#fff", dot: "#22c55e", label: "Meeting" },
  SITE_VISIT: { bg: "#f97316", text: "#fff", dot: "#f97316", label: "Site Visit" },
  EMAIL:      { bg: "#eab308", text: "#1a1a1a", dot: "#eab308", label: "Email" },
  WHATSAPP:   { bg: "#eab308", text: "#1a1a1a", dot: "#eab308", label: "WhatsApp" },
  TASK:       { bg: "#a855f7", text: "#fff", dot: "#a855f7", label: "Task" },
};

export const OVERDUE_COLOR: EventColor = {
  bg: "#ef4444",
  text: "#fff",
  dot: "#ef4444",
  label: "Overdue",
};

export function eventColor(type: CalendarEventType, isOverdue: boolean): EventColor {
  return isOverdue ? OVERDUE_COLOR : (BASE[type] ?? OVERDUE_COLOR);
}

export const ALL_EVENT_TYPES: { value: string; label: string; color: string }[] = [
  { value: "CALL",       label: "Calls",       color: "#3b82f6" },
  { value: "MEETING",    label: "Meetings",    color: "#22c55e" },
  { value: "SITE_VISIT", label: "Site Visits", color: "#f97316" },
  { value: "EMAIL",      label: "Emails",      color: "#eab308" },
  { value: "WHATSAPP",   label: "WhatsApp",    color: "#eab308" },
  { value: "TASK",       label: "Tasks",       color: "#a855f7" },
];

export const FOLLOWUP_TYPE_MAP: Record<string, string> = {
  CALL: "Call",
  MEETING: "Meeting",
  SITE_VISIT: "Site Visit",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  TASK: "Task",
};
