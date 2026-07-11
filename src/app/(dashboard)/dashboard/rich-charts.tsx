"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from "recharts";

export function DonutChart({ data, total }: { data: { label: string; value: number; color: string }[]; total: number }) {
  const d = data.filter((x) => x.value > 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={190}>
        <PieChart>
          <Pie data={d.length ? d : [{ label: "None", value: 1, color: "#e5e7eb" }]} dataKey="value" innerRadius={62} outerRadius={88} paddingAngle={d.length > 1 ? 3 : 0} stroke="none">
            {(d.length ? d : [{ color: "#e5e7eb" }]).map((s, i) => (
              <Cell key={i} fill={s.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{total}</span>
        <span className="text-[11px] text-muted">Total Projects</span>
      </div>
    </div>
  );
}

export function RevenueArea({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`}
          contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }}
        />
        <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2.5} fill="url(#rev)" dot={{ r: 3, fill: "var(--primary)" }} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
