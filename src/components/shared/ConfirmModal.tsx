import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  notes?: string;
  setNotes?: (n: string) => void;
}

export default function ConfirmModal({ isOpen, title, message, onConfirm, onCancel, notes, setNotes }: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(11,13,16,0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: 'var(--charcoal)',
          border: '1px solid var(--border)',
          maxWidth: '26rem',
          width: '100%',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* coral top accent */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'var(--coral)' }} />

        <div style={{ padding: '1.5rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.875rem' }}>
            <AlertTriangle size={14} style={{ color: 'var(--coral)', flexShrink: 0 }} />
            <h3
              style={{
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.9375rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--white)',
                margin: 0,
              }}
            >
              {title}
            </h3>
          </div>

          {/* Message */}
          <p
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.875rem',
              color: 'var(--pale)',
              lineHeight: 1.65,
              margin: '0 0 1.25rem 0',
            }}
          >
            {message}
          </p>

          {/* Optional notes textarea */}
          {setNotes && (
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--muted)',
                  marginBottom: '0.375rem',
                }}
              >
                Visit Notes (Optional)
              </label>
              <textarea
                style={{
                  width: '100%',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--white)',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '0.875rem',
                  padding: '0.75rem',
                  resize: 'none',
                  height: '5rem',
                  outline: 'none',
                }}
                placeholder="Enter details about the home visit..."
                value={notes || ''}
                onChange={(e) => setNotes(e.target.value)}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--coral)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>
          )}

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--border)', marginBottom: '1.25rem' }} />

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              onClick={onCancel}
              className="btn-ghost"
              style={{ paddingLeft: '1.25rem', paddingRight: '1.25rem' }}
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="btn-primary"
              style={{ paddingLeft: '1.25rem', paddingRight: '1.25rem' }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
