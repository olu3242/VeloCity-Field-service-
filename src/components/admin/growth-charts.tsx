"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface GrowthChartsProps {
  revenueByCategory: Array<{ category: string; revenue: number }>;
  demandForecast: Array<{ area: string; expectedJobs: number; providersNeeded: number }>;
}

export function GrowthCharts({ revenueByCategory, demandForecast }: GrowthChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="h-72 rounded-lg border bg-white p-4">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">Revenue by Category</h3>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={revenueByCategory}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="category" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="h-72 rounded-lg border bg-white p-4">
        <h3 className="mb-4 text-sm font-semibold text-gray-700">Demand Forecast</h3>
        <ResponsiveContainer width="100%" height="85%">
          <LineChart data={demandForecast}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="area" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="expectedJobs" stroke="#16a34a" strokeWidth={2} />
            <Line type="monotone" dataKey="providersNeeded" stroke="#dc2626" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
