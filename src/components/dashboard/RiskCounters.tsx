import React, { useEffect, useState } from 'react';

interface CounterProps {
  label: string;
  count: number;
  variant: 'red' | 'warn' | 'teal' | 'accent';
  description?: string;
}

const VARIANT_MAP = {
  red:    { color: 'var(--risk-red)',    dim: 'var(--risk-red-dim)',    cls: 'stat-card-red' },
  warn:   { color: 'var(--risk-yellow)', dim: 'var(--risk-yellow-dim)', cls: 'stat-card-warn' },
  teal:   { color: 'var(--risk-green)',  dim: 'var(--risk-green-dim)',  cls: 'stat-card-teal' },
  accent: { color: 'var(--coral)',       dim: 'var(--coral-dim)',       cls: 'stat-card-accent' },
};

function StatCard({ label, count, variant, description }: CounterProps) {
  const [displayCount, setDisplayCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, [count]);

  useEffect(() => {
    if (!mounted) return;
    if (count === 0) { setDisplayCount(0); return; }
    let start = 0;
    const steps = Math.min(count, 60);
    const stepTime = Math.max(Math.floor(800 / steps), 12);
    const increment = Math.ceil(count / steps);
    const timer = setInterval(() => {
      start += increment;
      setDisplayCount(Math.min(start, count));
      if (start >= count) clearInterval(timer);
    }, stepTime);
    return () => clearInterval(timer);
  }, [count, mounted]);

  const { color, dim, cls } = VARIANT_MAP[variant];

  return (
    <div
      className={`stat-card card p-6 flex flex-col gap-3 ${cls}`}
      style={{ minHeight: '130px' }}
    >
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span className="mono-label">{label}</span>
        {/* Colored status dot */}
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>

      {/* Big number */}
      <div
        className="font-mono font-bold leading-none num-reveal"
        style={{ fontSize: '2.75rem', color, lineHeight: 1 }}
      >
        {displayCount}
      </div>

      {/* Description */}
      {description && (
        <p className="font-mono text-[0.6875rem] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          {description}
        </p>
      )}
    </div>
  );
}

interface RiskCountersProps {
  stats: { total: number; red: number; yellow: number; green: number; };
}

export default function RiskCounters({ stats }: RiskCountersProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard label="Critical"  count={stats.red}    variant="red"    description="Requires immediate action" />
      <StatCard label="Warnings"  count={stats.yellow} variant="warn"   description="Needs close monitoring" />
      <StatCard label="Stable"    count={stats.green}  variant="teal"   description="On-track adherence" />
      <StatCard label="Total"     count={stats.total}  variant="accent" description="Enrolled patients" />
    </div>
  );
}
