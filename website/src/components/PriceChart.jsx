import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

function formatDate(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function formatCurrency(val) {
  if (typeof val !== 'number') return '₹0';
  return `₹${val.toLocaleString('en-IN')}`;
}

export default function PriceChart({ history = [], baselinePrice, targetPrice, currency = 'INR' }) {
  if (!history || history.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
        No price history recorded yet.
      </div>
    );
  }

  // Format data for Recharts
  const chartData = history.map((entry) => ({
    date: formatDate(entry.timestamp),
    fullDate: new Date(entry.timestamp).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    price: entry.price,
    timestamp: new Date(entry.timestamp).getTime(),
  }));

  // Calculate min and max for chart domain with comfortable padding
  const prices = chartData.map((d) => d.price);
  if (baselinePrice) prices.push(baselinePrice);
  if (targetPrice) prices.push(targetPrice);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.15 || minPrice * 0.1;

  const yDomain = [
    Math.max(0, Math.floor((minPrice - padding) / 100) * 100),
    Math.ceil((maxPrice + padding) / 100) * 100,
  ];

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const dropFromBaseline = baselinePrice
        ? Math.round(((baselinePrice - data.price) / baselinePrice) * 100)
        : 0;

      return (
        <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-800 text-xs space-y-1">
          <p className="text-slate-400">{data.fullDate}</p>
          <p className="text-base font-bold text-white">{formatCurrency(data.price)}</p>
          {dropFromBaseline > 0 && (
            <p className="text-emerald-400 font-medium">
              📉 -{dropFromBaseline}% lower than baseline
            </p>
          )}
          {targetPrice && data.price <= targetPrice && (
            <p className="text-amber-300 font-medium">🎯 Below your target buy price!</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          
          <XAxis
            dataKey="date"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
          />

          <YAxis
            domain={yDomain}
            tickFormatter={(val) => `₹${(val / 1000).toFixed(val >= 10000 ? 0 : 1)}k`}
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#cbd5e1' }}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Baseline Reference Line */}
          {baselinePrice && (
            <ReferenceLine
              y={baselinePrice}
              stroke="#64748b"
              strokeDasharray="4 4"
              label={{
                value: `Baseline: ${formatCurrency(baselinePrice)}`,
                position: 'insideTopRight',
                fill: '#64748b',
                fontSize: 10,
              }}
            />
          )}

          {/* Target Price Reference Line */}
          {targetPrice && (
            <ReferenceLine
              y={targetPrice}
              stroke="#10b981"
              strokeDasharray="4 4"
              label={{
                value: `Target: ${formatCurrency(targetPrice)}`,
                position: 'insideBottomRight',
                fill: '#059669',
                fontSize: 10,
                fontWeight: 'bold',
              }}
            />
          )}

          {/* Price curve */}
          <Line
            type="monotone"
            dataKey="price"
            stroke="#6366f1"
            strokeWidth={3}
            dot={{ r: 3, fill: '#4f46e5', strokeWidth: 2, stroke: '#ffffff' }}
            activeDot={{ r: 6, fill: '#4f46e5', stroke: '#ffffff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
