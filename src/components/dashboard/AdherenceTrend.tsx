import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';

interface AdherenceTrendProps {
  data?: { day: string; rate: number }[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value ?? 0;
  const color = val >= 85 ? 'var(--teal)' : val >= 60 ? 'var(--warn)' : 'var(--blood)';
  return (
    <div
      style={{
        background: 'rgba(12,12,12,0.95)',
        border: '1px solid var(--border)',
        padding: '8px 12px',
        backdropFilter: 'blur(8px)',
      }}
    >
      <p className="font-jetbrains text-[0.95rem] text-muted uppercase tracking-widest mb-1">{label}</p>
      <p className="font-bebas text-4xl" style={{ color, lineHeight: 1 }}>{val}%</p>
    </div>
  );
};

const CustomBar = (props: any) => {
  const { x, y, width, height, value } = props;
  const color = value >= 85 ? 'var(--teal)' : value >= 60 ? 'var(--warn)' : 'var(--blood)';
  const glowColor = value >= 85
    ? 'rgba(0,229,160,0.4)'
    : value >= 60
    ? 'rgba(245,158,11,0.4)'
    : 'rgba(192,57,43,0.4)';

  return (
    <g>
      {/* Glow shadow */}
      <rect x={x + 2} y={y} width={width - 4} height={height} fill={color} opacity={0.15} rx={1} />
      {/* Main bar */}
      <rect x={x + 2} y={y} width={width - 4} height={height} fill={color} opacity={0.85} rx={1} />
      {/* Top highlight */}
      <rect x={x + 2} y={y} width={width - 4} height={2} fill="rgba(255,255,255,0.25)" rx={1} />
    </g>
  );
};

export default function AdherenceTrend({ data }: AdherenceTrendProps) {
  const defaultData = data && data.length > 0 ? data : [
    { day: 'Mon', rate: 75 },
    { day: 'Tue', rate: 82 },
    { day: 'Wed', rate: 80 },
    { day: 'Thu', rate: 88 },
    { day: 'Fri', rate: 90 },
    { day: 'Sat', rate: 85 },
    { day: 'Sun', rate: 88 },
  ];

  const avgRate = Math.round(defaultData.reduce((a, b) => a + b.rate, 0) / defaultData.length);
  const avgColor = avgRate >= 85 ? 'var(--teal)' : avgRate >= 60 ? 'var(--warn)' : 'var(--blood)';

  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: 'var(--charcoal)',
        border: '1px solid var(--border)',
        padding: '20px',
      }}
    >
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-[1px]"
        style={{ background: 'linear-gradient(90deg, transparent, var(--accent) 50%, transparent)' }}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h4 className="text-white text-[0.9rem] tracking-[0.1em] uppercase mb-0.5">7-Day Trend</h4>
          <p className="font-jetbrains text-[0.9rem] text-muted uppercase tracking-widest">Regional adherence rate</p>
        </div>
        <div className="text-right">
          <p className="font-bebas text-4xl" style={{ color: avgColor, lineHeight: 1 }}>{avgRate}%</p>
          <p className="font-jetbrains text-[0.9rem] text-muted uppercase tracking-widest">7d avg</p>
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={defaultData} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
            <ReferenceLine y={85} stroke="var(--teal)" strokeDasharray="3 3" strokeOpacity={0.4} />
            <XAxis
              dataKey="day"
              stroke="transparent"
              tick={{ fill: 'var(--muted)', fontSize: 9, fontFamily: 'JetBrains Mono' }}
              tickLine={false}
            />
            <YAxis
              stroke="transparent"
              tick={{ fill: 'var(--muted)', fontSize: 9, fontFamily: 'JetBrains Mono' }}
              domain={[50, 100]}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="rate"
              stroke="var(--accent)"
              strokeWidth={1.5}
              fill="url(#areaGrad)"
              dot={{ fill: 'var(--accent)', r: 3, strokeWidth: 0 }}
              activeDot={{ fill: 'var(--accent)', r: 5, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Target label */}
      <div className="flex items-center gap-1.5 mt-3">
        <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
        <span className="font-jetbrains text-[0.85rem] text-muted uppercase tracking-widest">Target: 85%</span>
        <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
      </div>
    </div>
  );
}
