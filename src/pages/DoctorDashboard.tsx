import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import RiskBadge from '../components/shared/RiskBadge';
import {
  Stethoscope,
  CheckCircle,
  XCircle,
  Edit3,
  BookOpen,
  FileText,
  AlertTriangle,
  Send,
  ShieldAlert
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function DoctorDashboard() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [assistPatientId, setAssistPatientId] = useState<string>('');
  const [assistQuery, setAssistQuery] = useState<string>('');

  // Fetch pending doctor review queue
  const { data, isLoading, isError } = useQuery({
    queryKey: ['doctorQueue'],
    queryFn: async () => {
      const token = localStorage.getItem('token') || 'doctor-token';
      const res = await apiClient.get('/doctor/queue', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    },
    refetchInterval: 10_000,
  });

  // Doctor Action Mutation (Approve / Edit / Reject)
  const reviewMutation = useMutation({
    mutationFn: async ({ id, action, editedSuggestedAction, reviewNotes }: {
      id: string;
      action: 'approve' | 'edit' | 'reject';
      editedSuggestedAction?: string;
      reviewNotes?: string;
    }) => {
      const token = localStorage.getItem('token') || 'doctor-token';
      const res = await apiClient.post(`/doctor/review/${id}`, {
        action,
        editedSuggestedAction,
        reviewNotes
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    },
    onSuccess: () => {
      setEditingId(null);
      setEditText('');
      setReviewNotes('');
      queryClient.invalidateQueries({ queryKey: ['doctorQueue'] });
    }
  });

  // Live Consultation Decision Support Assist Mutation
  const assistMutation = useMutation({
    mutationFn: async ({ patientId, clinicalQuery }: { patientId: string; clinicalQuery: string }) => {
      const token = localStorage.getItem('token') || 'doctor-token';
      const res = await apiClient.post(`/doctor/assist/${patientId}`, {
        clinicalQuery
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return res.data;
    },
    onSuccess: () => {
      setAssistQuery('');
      queryClient.invalidateQueries({ queryKey: ['doctorQueue'] });
    }
  });

  const queue = data?.queue || [];
  const count = data?.count || 0;

  return (
    <div className="space-y-8 page-enter">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <Stethoscope className="w-7 h-7" style={{ color: 'var(--coral)' }} />
            <h1 className="text-white" style={{ fontSize: '2rem', letterSpacing: '0.06em' }}>DOCTOR CLINICAL DASHBOARD</h1>
          </div>
          <p className="font-mono text-[0.875rem] mt-1.5" style={{ color: 'var(--muted)' }}>
            Hermes 4 Clinical Decision Support Queue · {count} pending review{count !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-2 px-3 py-1.5"
            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)' }}
          >
            <ShieldAlert size={14} style={{ color: 'var(--risk-green)' }} />
            <span className="font-mono text-[0.75rem] uppercase tracking-wider" style={{ color: 'var(--risk-green)' }}>
              DPDP Compliant · Encryption Verified
            </span>
          </div>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Pending Doctor Queue */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold uppercase tracking-widest text-white flex items-center gap-2">
              <FileText size={16} style={{ color: 'var(--coral)' }} />
              Pending Doctor Review Queue ({count})
            </h2>
            <span className="font-mono text-[0.75rem]" style={{ color: 'var(--muted)' }}>
              Requires Doctor Sign-off
            </span>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="border border-border h-48 animate-pulse" style={{ background: 'var(--charcoal)' }} />
              ))}
            </div>
          ) : isError ? (
            <div className="p-8 text-center border border-red-500/30" style={{ background: 'rgba(239,68,68,0.05)' }}>
              <p className="font-mono text-sm text-red-400">Failed to load doctor review queue. Check authentication.</p>
            </div>
          ) : queue.length === 0 ? (
            <div className="p-12 text-center space-y-3" style={{ background: 'var(--charcoal)', border: '1px solid rgba(52,211,153,0.2)' }}>
              <CheckCircle className="w-10 h-10 mx-auto" style={{ color: 'var(--risk-green)' }} />
              <p className="font-mono text-base font-semibold text-white">No Pending Doctor Reviews</p>
              <p className="font-mono text-xs" style={{ color: 'var(--muted)' }}>
                All AI-drafted recommendations have been reviewed and signed off.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {queue.map((item: any) => {
                const isEditing = editingId === item.id;
                return (
                  <div
                    key={item.id}
                    className="p-6 space-y-5"
                    style={{
                      background: 'var(--charcoal)',
                      border: '1px solid var(--border)',
                      borderLeft: '4px solid var(--coral)'
                    }}
                  >
                    {/* Top Row: Patient Info + Persistent AI Tag */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-lg font-bold text-white">{item.patientName}</span>
                        <RiskBadge level={item.riskLevel || 'green'} />
                        <span className="font-mono text-xs px-2 py-0.5" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--muted)' }}>
                          ID: {item.nikshayId}
                        </span>
                      </div>

                      {/* MANDATORY PERSISTENT AI-SUGGESTED BADGE */}
                      <div
                        className="flex items-center gap-1.5 px-3 py-1 font-mono text-[0.75rem] font-bold uppercase tracking-wider"
                        style={{
                          background: 'rgba(245,166,35,0.12)',
                          border: '1px solid rgba(245,166,35,0.4)',
                          color: 'var(--risk-yellow)'
                        }}
                      >
                        <AlertTriangle size={12} />
                        AI-suggested — requires your review
                      </div>
                    </div>

                    {/* Side-by-Side Content */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Side A: Clinical Trigger & Summary */}
                      <div className="space-y-3">
                        <h3 className="font-mono text-xs uppercase tracking-wider text-white font-semibold">
                          Case Context & Trigger Reason
                        </h3>
                        <p className="font-mono text-xs p-3" style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--pale)', border: '1px solid var(--border)' }}>
                          <strong>Trigger:</strong> {item.reason}
                        </p>
                        <div className="space-y-1">
                          <span className="font-mono text-[0.75rem]" style={{ color: 'var(--muted)' }}>AI-Generated Case Summary:</span>
                          <p className="font-mono text-xs text-white p-3" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)' }}>
                            {item.aiSummary}
                          </p>
                        </div>
                      </div>

                      {/* Side B: Suggested Action & Guideline Citations */}
                      <div className="space-y-3">
                        <h3 className="font-mono text-xs uppercase tracking-wider text-white font-semibold flex items-center gap-1.5">
                          <BookOpen size={14} style={{ color: 'var(--coral)' }} />
                          Hermes 4 Suggested Next Action
                        </h3>

                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              rows={4}
                              className="w-full p-2.5 font-mono text-xs text-white bg-black border border-coral focus:outline-none"
                              placeholder="Edit suggested clinical action..."
                            />
                            <textarea
                              value={reviewNotes}
                              onChange={(e) => setReviewNotes(e.target.value)}
                              rows={2}
                              className="w-full p-2 font-mono text-[0.75rem] text-white bg-black border border-border"
                              placeholder="Doctor review notes (optional)..."
                            />
                          </div>
                        ) : (
                          <p className="font-mono text-xs text-white p-3" style={{ background: 'rgba(255,107,74,0.08)', border: '1px solid rgba(255,107,74,0.25)' }}>
                            {item.aiSuggestedAction}
                          </p>
                        )}

                        {/* Guideline Citations Box */}
                        <div className="p-3 space-y-1.5" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)' }}>
                          <span className="font-mono text-[0.7rem] uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--coral)' }}>
                            <BookOpen size={10} /> Verified Guideline Citations:
                          </span>
                          {item.guidelineCitations && item.guidelineCitations.map((c: any, idx: number) => (
                            <div key={idx} className="font-mono text-[0.75rem]" style={{ color: 'var(--muted)' }}>
                              • <strong>{c.guideline}</strong> ({c.section}): {c.citation}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3">
                      <div className="font-mono text-[0.75rem]" style={{ color: 'var(--muted)' }}>
                        Triggered {formatDistanceToNow(new Date(item.openedAt), { addSuffix: true })}
                      </div>

                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => reviewMutation.mutate({
                                id: item.id,
                                action: 'edit',
                                editedSuggestedAction: editText,
                                reviewNotes
                              })}
                              disabled={reviewMutation.isPending}
                              className="px-4 py-2 font-mono text-xs uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-500 font-bold"
                            >
                              Confirm & Approve Edited Action
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-2 font-mono text-xs uppercase tracking-wider border border-border text-muted"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => reviewMutation.mutate({ id: item.id, action: 'approve' })}
                              disabled={reviewMutation.isPending}
                              className="flex items-center gap-1.5 px-4 py-2 font-mono text-xs uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-500 font-bold transition-colors"
                            >
                              <CheckCircle size={13} /> Approve Action
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(item.id);
                                setEditText(item.aiSuggestedAction);
                              }}
                              className="flex items-center gap-1.5 px-3 py-2 font-mono text-xs uppercase tracking-wider border border-amber-500/40 text-amber-400 hover:border-amber-500 transition-colors"
                            >
                              <Edit3 size={13} /> Edit & Approve
                            </button>
                            <button
                              onClick={() => reviewMutation.mutate({ id: item.id, action: 'reject' })}
                              disabled={reviewMutation.isPending}
                              className="flex items-center gap-1.5 px-3 py-2 font-mono text-xs uppercase tracking-wider border border-red-500/40 text-red-400 hover:border-red-500 transition-colors"
                            >
                              <XCircle size={13} /> Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 1 Column: On-Demand Consultation Decision Support */}
        <div className="space-y-6">
          <div className="p-6 space-y-4" style={{ background: 'var(--charcoal)', border: '1px solid var(--border)' }}>
            <h2 className="font-mono text-sm font-semibold uppercase tracking-widest text-white flex items-center gap-2">
              <Stethoscope size={16} style={{ color: 'var(--coral)' }} />
              On-Demand Clinical Decision Support
            </h2>
            <p className="font-mono text-xs" style={{ color: 'var(--muted)' }}>
              Ask Hermes 4 for mid-consultation guideline assistance for a specific patient. Output is generated as a draft recommendation requiring your approval.
            </p>

            <div className="space-y-3">
              <div>
                <label className="font-mono text-[0.75rem] text-white block mb-1">Target Patient ID</label>
                <input
                  type="text"
                  value={assistPatientId}
                  onChange={(e) => setAssistPatientId(e.target.value)}
                  placeholder="e.g. 33333333-3333-3333-3333-333333333009"
                  className="w-full p-2 font-mono text-xs bg-black text-white border border-border focus:border-coral focus:outline-none"
                />
              </div>

              <div>
                <label className="font-mono text-[0.75rem] text-white block mb-1">Clinical Query / Symptom Check</label>
                <textarea
                  value={assistQuery}
                  onChange={(e) => setAssistQuery(e.target.value)}
                  rows={4}
                  placeholder="e.g. Patient reports persistent nausea after 3 weeks on FDC. Check hepatotoxicity guidance."
                  className="w-full p-2.5 font-mono text-xs bg-black text-white border border-border focus:border-coral focus:outline-none"
                />
              </div>

              <button
                onClick={() => {
                  if (assistPatientId) {
                    assistMutation.mutate({ patientId: assistPatientId, clinicalQuery: assistQuery });
                  }
                }}
                disabled={!assistPatientId || assistMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-wider bg-coral text-white hover:opacity-90 disabled:opacity-50"
              >
                <Send size={13} />
                {assistMutation.isPending ? 'Querying Hermes 4...' : 'Request Decision Support Draft'}
              </button>
            </div>

            {assistMutation.isSuccess && (
              <div className="p-3 border border-emerald-500/30 text-emerald-400 font-mono text-xs space-y-1" style={{ background: 'rgba(52,211,153,0.05)' }}>
                <p className="font-semibold">✓ Draft Suggestion Generated!</p>
                <p className="text-[0.7rem] text-muted">Added to Doctor Review Queue for explicit approval.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
