import React from 'react';
import { format } from 'date-fns';

interface Escalation {
  id: string;
  type: string;
  reason: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'auto_resolved' | string;
  openedAt: string;
  resolvedAt?: string;
}

interface EscalationLogProps {
  escalations: Escalation[];
}

function StatusBadge({ status }: { status: string }) {
  let bg = 'rgba(52,211,153,0.12)';
  let color = '#34D399';
  let border = 'rgba(52,211,153,0.3)';

  if (status === 'open') {
    bg = 'rgba(239,68,68,0.12)';
    color = '#EF4444';
    border = 'rgba(239,68,68,0.35)';
  } else if (status === 'acknowledged') {
    bg = 'rgba(245,166,35,0.12)';
    color = '#F5A623';
    border = 'rgba(245,166,35,0.35)';
  }

  return (
    <span style={{
      display: 'inline-block',
      fontFamily: '"IBM Plex Mono", monospace',
      fontSize: '0.6875rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      padding: '0.2rem 0.625rem',
      background: bg,
      color,
      border: `1px solid ${border}`,
    }}>
      {status.replace('_', ' ')}
    </span>
  );
}

export default function EscalationLog({ escalations }: EscalationLogProps) {
  if (escalations.length === 0) {
    return (
      <div style={{
        background: 'var(--charcoal)',
        border: '1px solid var(--border)',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: '0.875rem',
        color: 'var(--muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>
        No escalation history found.
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--charcoal)', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'var(--coral)' }} />
      <div style={{ padding: '1.5rem' }}>
        <h4 style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.8125rem',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--white)',
          margin: '0 0 1.25rem 0',
        }}>
          Alert &amp; Escalation Records
        </h4>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.8125rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Type', 'Trigger Reason', 'Date Raised', 'Status'].map(h => (
                  <th key={h} style={{ padding: '0 0 0.75rem 0', fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', paddingRight: '1.5rem' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {escalations.map((esc) => (
                <tr
                  key={esc.id}
                  style={{ borderBottom: '1px solid rgba(36,40,51,0.5)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '0.75rem 1.5rem 0.75rem 0', color: 'var(--white)', fontWeight: 600 }}>
                    {esc.type === 'SYMPTOM_SEVERE' ? '🔴 SYMPTOM' : '⚠️ ADHERENCE'}
                  </td>
                  <td style={{ padding: '0.75rem 1.5rem 0.75rem 0', color: 'var(--pale)', lineHeight: 1.5 }}>
                    {esc.reason}
                  </td>
                  <td style={{ padding: '0.75rem 1.5rem 0.75rem 0', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {format(new Date(esc.openedAt), 'yyyy-MM-dd HH:mm')}
                  </td>
                  <td style={{ padding: '0.75rem 0' }}>
                    <StatusBadge status={esc.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
