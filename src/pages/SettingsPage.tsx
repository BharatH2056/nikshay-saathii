import React from 'react';
import { useAuthStore } from '../hooks/useAuthStore';
import { User, Shield, Phone, MapPin, LogOut, RefreshCw } from 'lucide-react';

export default function SettingsPage() {
  const { user, logout, setRole } = useAuthStore();

  const systemConfig = [
    { label: 'Application',         value: 'Nikshay Saathi Engine v1.0.0' },
    { label: 'Build',                value: 'IBM SkillsBuild Capstone 2026' },
    { label: 'Reminder Schedule',    value: '08:00 / 15:00 / 20:00 IST' },
    { label: 'Adherence Threshold',  value: '>= 85%' },
    { label: 'Risk Engine',          value: 'Real-time + cron-based scoring' },
    { label: 'AI Guardrails',        value: 'Strict RAG context checking' },
    { label: 'SMS Gateway',          value: 'Twilio Active' },
  ];

  return (
    <div className="space-y-8 max-w-2xl page-enter">

      {/* Header */}
      <div className="pb-6 border-b border-border">
        <h1 className="text-white" style={{ fontSize: '2rem', letterSpacing: '0.06em' }}>SETTINGS</h1>
        <p className="font-mono text-[0.875rem] mt-1.5 whitespace-nowrap" style={{ color: 'var(--muted)' }}>
          Worker profile &amp; system configuration
        </p>
      </div>

      {/* Profile Card */}
      <div className="p-6 relative" style={{ background: 'var(--charcoal)', border: '1px solid var(--border)', borderLeft: '3px solid var(--coral)' }}>
        <div className="flex items-center gap-2 border-b border-border pb-4 mb-5">
          <User size={13} style={{ color: 'var(--coral)' }} />
          <h4 style={{ color: 'var(--coral)', fontSize: '0.8125rem' }}>User Profile</h4>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div
            className="w-14 h-14 flex items-center justify-center font-mono font-bold text-xl"
            style={{ background: 'var(--coral-dim)', border: '1px solid rgba(255,107,74,0.3)', color: 'var(--coral)' }}
          >
            {user?.fullName?.charAt(0) ?? 'U'}
          </div>
          <div>
            <p className="font-mono text-base font-semibold text-white">{user?.fullName ?? 'Health Worker'}</p>
            <p className="font-mono text-[0.8125rem] mt-0.5" style={{ color: 'var(--muted)' }}>{user?.email ?? '—'}</p>
            <span
              className="inline-block mt-2 font-mono text-[0.6875rem] uppercase tracking-widest px-2 py-0.5"
              style={user?.role === 'admin'
                ? { border: '1px solid rgba(255,107,74,0.4)', background: 'var(--coral-dim)', color: 'var(--coral)' }
                : { border: '1px solid rgba(52,211,153,0.35)', background: 'rgba(52,211,153,0.07)', color: 'var(--risk-green)' }}
            >
              {user?.role === 'admin' ? 'DTO Admin' : 'Health Worker'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { icon: <Phone size={11} />, label: 'Phone',  value: user?.phone  ?? '—' },
            { icon: <MapPin size={11} />, label: 'Region', value: user?.region ?? '—' },
          ].map(({ icon, label, value }) => (
            <div key={label} className="space-y-1">
              <div className="flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                {icon} {label}
              </div>
              <p className="font-mono text-[0.9375rem]" style={{ color: 'var(--pale)' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* System Info */}
      <div className="p-6" style={{ background: 'var(--charcoal)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2 border-b border-border pb-4 mb-5">
          <Shield size={13} style={{ color: 'var(--muted)' }} />
          <h4 style={{ color: 'var(--white)', fontSize: '0.8125rem' }}>System Configuration</h4>
        </div>
        <div className="space-y-0">
          {systemConfig.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center py-2.5 border-b border-border last:border-0">
              <span className="font-mono text-[0.75rem] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{label}</span>
              <span className="font-mono text-[0.875rem]" style={{ color: 'var(--pale)' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Clinical Notice */}
      <div className="p-4" style={{ background: 'rgba(245,166,35,0.05)', border: '1px solid rgba(245,166,35,0.18)' }}>
        <p className="font-mono text-[0.8125rem] leading-relaxed" style={{ color: 'var(--risk-yellow)' }}>
          ⚠ CLINICAL NOTICE — This software is an adherence analytics overlay. It does not provide medical treatment, diagnoses, or clinical advice. For medical issues, coordinate with the public health center.
        </p>
      </div>

      {/* Actions */}
      <div className="pt-4 border-t border-border flex gap-3">
        <button
          id="settings-switch-role"
          onClick={() => setRole(user?.role === 'admin' ? 'hw' : 'admin')}
          className="btn-ghost flex items-center gap-2"
        >
          <RefreshCw size={13} />
          Switch to {user?.role === 'admin' ? 'Field Worker' : 'DTO Admin'}
        </button>
        <button
          id="settings-reset"
          onClick={logout}
          className="btn-primary flex items-center gap-2"
          style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--risk-red)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <LogOut size={13} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
