"use client";

import { BarChart, Bar, XAxis, ResponsiveContainer, Cell, Tooltip, PieChart, Pie } from "recharts";

const PIPELINE_COLORS: Record<string, string> = {
  NEW: "#0ea5e9",
  IN_FOLLOWUP: "#10b981",
  QUOTE_REQUESTED: "#f59e0b",
  CONVERTED: "#0f7a4d",
  ON_HOLD: "#a3a3a3",
  LOST: "#dc2626",
};

export function PipelineChart({ data }: { data: Record<string, number> }) {
  const rows = Object.entries(data).map(([status, count]) => ({
    status: status.replace(/_/g, " "),
    key: status,
    count,
  }));
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted">No leads yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <XAxis dataKey="status" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} interval={0} />
        <Tooltip
          cursor={{ fill: "color-mix(in srgb, var(--primary) 8%, transparent)" }}
          contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={48}>
          {rows.map((r) => (
            <Cell key={r.key} fill={PIPELINE_COLORS[r.key] ?? "#10b981"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ReceivablesDonut({ due, overdue }: { due: number; overdue: number }) {
  const current = Math.max(due - overdue, 0);
  const data = [
    { name: "Not yet due", value: current, fill: "#10b981" },
    { name: "Overdue", value: overdue, fill: "#dc2626" },
  ].filter((d) => d.value > 0);
  if (data.length === 0) return <p className="py-8 text-center text-sm text-muted">Nothing outstanding.</p>;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3} stroke="none">
          {data.map((d, i) => (
            <Cell key={i} fill={d.fill} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`}
          contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
