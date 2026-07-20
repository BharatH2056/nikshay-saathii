import React from 'react';

interface RiskBadgeProps {
  level: 'green' | 'yellow' | 'red' | string;
}

export default function RiskBadge({ level }: RiskBadgeProps) {
  const l = level?.toLowerCase();

  if (l === 'red') {
    return (
      <span className="risk-pill-red">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--risk-red)' }} />
        Critical
      </span>
    );
  }

  if (l === 'yellow') {
    return (
      <span className="risk-pill-yellow">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--risk-yellow)' }} />
        Warning
      </span>
    );
  }

  return (
    <span className="risk-pill-green">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--risk-green)' }} />
      Stable
    </span>
  );
}
