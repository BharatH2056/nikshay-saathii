import React from 'react';
import { AlertOctagon, ShieldCheck } from 'lucide-react';

interface SymptomLog {
  id: string;
  checkinDate: string;
  responses: {
    vomiting: boolean;
    yellow_eyes: boolean;
    stomach_pain: 'none' | 'mild' | 'severe';
    appetite_loss: boolean;
  };
  severityScore: number;
  escalated: boolean;
  createdAt: string;
}

interface SymptomTimelineProps {
  logs: SymptomLog[];
}

function SymptomRow({ label, value, danger }: { label: string; value: string; danger: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
        {label}
      </span>
      <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.75rem', fontWeight: danger ? 700 : 400, color: danger ? '#EF4444' : 'var(--pale)' }}>
        {value}
      </span>
    </div>
  );
}

export default function SymptomTimeline({ logs }: SymptomTimelineProps) {
  if (logs.length === 0) {
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
        No weekly symptom reports yet.
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
          Weekly Symptom Survey Logs
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
          {/* Timeline line */}
          <div style={{
            position: 'absolute',
            left: '15px',
            top: '8px',
            bottom: '8px',
            width: '1px',
            background: 'var(--border)',
          }} />

          {logs.map((log) => (
            <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', position: 'relative' }}>
              {/* Icon bubble */}
              <div style={{
                width: '2rem',
                height: '2rem',
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: log.escalated ? 'rgba(239,68,68,0.12)' : 'rgba(52,211,153,0.1)',
                border: `1px solid ${log.escalated ? '#EF4444' : '#34D399'}`,
                color: log.escalated ? '#EF4444' : '#34D399',
                position: 'relative',
                zIndex: 10,
              }}>
                {log.escalated ? <AlertOctagon size={13} /> : <ShieldCheck size={13} />}
              </div>

              {/* Card */}
              <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '0.875rem', fontWeight: 600, color: 'var(--white)' }}>
                    {log.checkinDate}
                  </span>
                  <span style={{
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: '0.6875rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    padding: '0.2rem 0.625rem',
                    background: log.escalated ? 'rgba(239,68,68,0.15)' : 'rgba(52,211,153,0.1)',
                    color: log.escalated ? '#EF4444' : '#34D399',
                    border: `1px solid ${log.escalated ? 'rgba(239,68,68,0.35)' : 'rgba(52,211,153,0.3)'}`,
                  }}>
                    Severity: {log.severityScore}/4
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <SymptomRow label="Vomiting" value={log.responses.vomiting ? 'YES' : 'NO'} danger={log.responses.vomiting} />
                  <SymptomRow label="Yellow Eyes" value={log.responses.yellow_eyes ? 'YES' : 'NO'} danger={log.responses.yellow_eyes} />
                  <SymptomRow label="Stomach Pain" value={log.responses.stomach_pain.toUpperCase()} danger={log.responses.stomach_pain === 'severe'} />
                  <SymptomRow label="Appetite Loss" value={log.responses.appetite_loss ? 'YES' : 'NO'} danger={log.responses.appetite_loss} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
