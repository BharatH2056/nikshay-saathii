import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import RiskBadge from '../components/shared/RiskBadge';
import { AlertTriangle, CheckCircle, Clock, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const STATUS_CONFIG = {
  open:          { label: 'Open',          color: 'var(--risk-red)',    border: 'rgba(239,68,68,0.25)',    bg: 'rgba(239,68,68,0.05)' },
  acknowledged:  { label: 'Acknowledged',  color: 'var(--risk-yellow)', border: 'rgba(245,166,35,0.25)',   bg: 'rgba(245,166,35,0.04)' },
  resolved:      { label: 'Resolved',      color: 'var(--risk-green)',  border: 'rgba(52,211,153,0.2)',    bg: 'rgba(52,211,153,0.04)' },
  auto_resolved: { label: 'Auto-Resolved', color: 'var(--muted)',       border: 'var(--border)',           bg: '' },
};

const TABS = ['open', 'acknowledged', 'resolved', 'all'];

export default function EscalationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('open');

  const { data = [], isLoading } = useQuery({
    queryKey: ['escalations', statusFilter],
    queryFn: async () => {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await apiClient.get(`/escalations${params}`);
      return res.data;
    },
    refetchInterval: 15_000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: string) => apiClient.post(`/escalations/${id}/acknowledge`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['escalations'] }),
  });

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => apiClient.post(`/escalations/${id}/resolve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['escalations'] }),
  });

  const openCount = data.filter((e: any) => e.status === 'open').length;

  return (
    <div className="space-y-8 page-enter">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-border">
        <div>
          <h1 className="text-white" style={{ fontSize: '2rem', letterSpacing: '0.06em' }}>ESCALATIONS</h1>
          <p className="font-mono text-[0.875rem] mt-1.5 whitespace-nowrap" style={{ color: 'var(--muted)' }}>
            Alert queue · {openCount} open
          </p>
        </div>

        {openCount > 0 && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 pulse-red-ring flex-shrink-0"
            style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.3)' }}
          >
            <AlertTriangle size={13} style={{ color: 'var(--risk-red)' }} />
            <span className="font-mono text-[0.8125rem] uppercase tracking-wider" style={{ color: 'var(--risk-red)' }}>
              {openCount} patient{openCount !== 1 ? 's' : ''} need attention
            </span>
          </div>
        )}
      </div>

      {/* Status Tabs */}
      <div className="flex gap-0 border-b border-border">
        {TABS.map(status => {
          const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
          const label = status === 'all' ? 'All' : cfg?.label ?? status;
          const isActive = statusFilter === status;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className="px-5 py-3 font-mono text-[0.75rem] uppercase tracking-widest transition-colors border-b-2 -mb-px"
              style={{
                color: isActive ? (cfg?.color ?? 'var(--coral)') : 'var(--muted)',
                borderBottomColor: isActive ? (cfg?.color ?? 'var(--coral)') : 'transparent',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Escalation List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="border border-border h-24 animate-pulse" style={{ background: 'var(--charcoal)' }} />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="p-12 text-center space-y-3" style={{ background: 'var(--charcoal)', border: '1px solid rgba(52,211,153,0.15)' }}>
          <div
            className="inline-flex items-center justify-center w-10 h-10 mx-auto mb-2"
            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}
          >
            <CheckCircle size={18} style={{ color: 'var(--risk-green)' }} />
          </div>
          <p className="font-mono text-sm font-semibold text-white uppercase tracking-wider">
            No {statusFilter !== 'all' ? statusFilter : ''} escalations
          </p>
          <p className="font-mono text-[0.8125rem] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            {statusFilter === 'open' ? 'All patients are stable right now' : 'Nothing to show in this category'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((esc: any) => {
            const cfg = STATUS_CONFIG[esc.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.open;
            return (
              <div
                key={esc.id}
                className="card p-5"
                style={{
                  background: 'var(--charcoal)',
                  border: `1px solid ${cfg.border}`,
                  borderLeft: `3px solid ${cfg.color}`,
                  ...(cfg.bg ? { backgroundColor: cfg.bg } : {}),
                }}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-start gap-4">
                    {/* Status icon with colored bg */}
                    <div
                      className="mt-0.5 w-7 h-7 flex items-center justify-center flex-shrink-0"
                      style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}40` }}
                    >
                      <AlertTriangle size={13} style={{ color: cfg.color }} />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => navigate(`/patients/${esc.patientId}`)}
                          className="font-mono text-[0.9375rem] text-white font-semibold transition-colors"
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--coral)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--white)')}
                        >
                          {esc.patientName ?? 'Unknown Patient'}
                        </button>
                        {esc.patientRiskLevel && <RiskBadge level={esc.patientRiskLevel} />}
                        <span
                          className="font-mono text-[0.6875rem] uppercase tracking-widest px-2 py-0.5"
                          style={{ border: `1px solid ${cfg.color}50`, color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      <p className="font-mono text-[0.875rem]" style={{ color: 'var(--pale)' }}>{esc.reason}</p>
                      <div className="flex items-center gap-1.5 font-mono text-[0.75rem]" style={{ color: 'var(--muted)' }}>
                        <Clock size={9} />
                        {formatDistanceToNow(new Date(esc.openedAt), { addSuffix: true })}
                        {esc.patientPhone && (
                          <span className="ml-2">{esc.patientPhone}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap flex-shrink-0">
                    {esc.status === 'open' && (
                      <button
                        onClick={() => acknowledgeMutation.mutate(esc.id)}
                        disabled={acknowledgeMutation.isPending}
                        className="flex items-center gap-1.5 font-mono text-[0.75rem] uppercase tracking-widest px-3 py-2 transition-colors disabled:opacity-50"
                        style={{ border: '1px solid rgba(245,166,35,0.4)', color: 'var(--risk-yellow)' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--risk-yellow)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(245,166,35,0.4)')}
                      >
                        <Clock size={10} /> Acknowledge
                      </button>
                    )}
                    {(esc.status === 'open' || esc.status === 'acknowledged') && (
                      <button
                        onClick={() => resolveMutation.mutate(esc.id)}
                        disabled={resolveMutation.isPending}
                        className="flex items-center gap-1.5 font-mono text-[0.75rem] uppercase tracking-widest px-3 py-2 transition-colors disabled:opacity-50"
                        style={{ border: '1px solid rgba(52,211,153,0.4)', color: 'var(--risk-green)' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--risk-green)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(52,211,153,0.4)')}
                      >
                        <CheckCircle size={10} /> Mark Visited
                      </button>
                    )}
                    <button
                      onClick={() => navigate(`/patients/${esc.patientId}`)}
                      className="flex items-center gap-1.5 font-mono text-[0.75rem] uppercase tracking-widest px-3 py-2 transition-colors"
                      style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--coral)'; e.currentTarget.style.borderColor = 'rgba(255,107,74,0.4)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                    >
                      <ChevronRight size={10} /> View
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-border pt-4">
        <div className="live-dot" />
        <p className="font-mono text-[0.6875rem] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
          Auto-refreshing every 15s · {data.length} escalation{data.length !== 1 ? 's' : ''} shown
        </p>
      </div>
    </div>
  );
}
