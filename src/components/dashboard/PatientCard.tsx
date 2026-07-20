import React from 'react';
import { Link } from 'react-router-dom';
import { Phone, CheckSquare, Eye, Flame } from 'lucide-react';
import RiskBadge from '../shared/RiskBadge';

interface PatientCardProps {
  key?: string | number;
  patient: {
    id: string;
    fullName: string;
    phone: string;
    riskLevel: 'green' | 'yellow' | 'red' | string;
    currentStreak: number;
    channelPref: string;
    language: string;
  };
  onMarkVisited?: (patientId: string, name: string) => void;
}

export default function PatientCard({ patient, onMarkVisited }: PatientCardProps) {
  const isRed    = patient.riskLevel === 'red';
  const isYellow = patient.riskLevel === 'yellow';

  const leftBorderColor = isRed
    ? 'var(--risk-red)'
    : isYellow
    ? 'var(--risk-yellow)'
    : 'var(--risk-green)';

  return (
    <div
      className="group relative flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 transition-all duration-200 card"
      style={{
        background: 'var(--charcoal)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${leftBorderColor}`,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
        (e.currentTarget as HTMLElement).style.borderLeftColor = leftBorderColor;
        (e.currentTarget as HTMLElement).style.background = 'var(--mid)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLElement).style.borderLeftColor = leftBorderColor;
        (e.currentTarget as HTMLElement).style.background = 'var(--charcoal)';
      }}
    >
      {/* Patient info */}
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center font-mono font-bold text-sm"
          style={{
            background: isRed ? 'rgba(239,68,68,0.1)' : isYellow ? 'rgba(245,166,35,0.1)' : 'rgba(52,211,153,0.08)',
            border: `1px solid ${leftBorderColor}`,
            color: leftBorderColor,
          }}
        >
          {patient.fullName.charAt(0).toUpperCase()}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/patients/${patient.id}`}
              className="font-mono text-sm font-semibold text-white transition-colors"
              style={{ lineHeight: 1.3 }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--coral)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--white)')}
            >
              {patient.fullName}
            </Link>
            <RiskBadge level={patient.riskLevel} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
            <span className="font-mono text-[0.75rem]" style={{ color: 'var(--muted)' }}>{patient.phone}</span>
            <span
              className="font-mono text-[0.625rem] uppercase tracking-wider px-1.5 py-0.5"
              style={{ background: 'var(--coral-dim)', color: 'var(--coral)', border: '1px solid rgba(255,107,74,0.2)' }}
            >
              {patient.channelPref} · {patient.language}
            </span>
          </div>
        </div>
      </div>

      {/* Stats + Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Streak */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1"
          style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}
        >
          <Flame size={11} style={{ color: 'var(--risk-green)' }} />
          <span className="font-mono text-[0.75rem] font-semibold" style={{ color: 'var(--risk-green)' }}>
            {patient.currentStreak}d streak
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <a
            href={`tel:${patient.phone}`}
            aria-label={`Call ${patient.fullName}`}
            className="p-2 transition-all duration-200"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            title="Call patient"
          >
            <Phone size={13} style={{ color: 'var(--muted)' }} />
          </a>

          {isRed && onMarkVisited && (
            <button
              onClick={() => onMarkVisited(patient.id, patient.fullName)}
              className="btn-warn py-1.5 px-2.5 text-[0.6875rem]"
            >
              <CheckSquare size={11} />
              Visited
            </button>
          )}

          <Link
            to={`/patients/${patient.id}`}
            className="p-2 transition-all duration-200"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            aria-label={`View ${patient.fullName}`}
          >
            <Eye size={13} style={{ color: 'var(--muted)' }} />
          </Link>
        </div>
      </div>
    </div>
  );
}
