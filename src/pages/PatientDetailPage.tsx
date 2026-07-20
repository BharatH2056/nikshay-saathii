import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import RiskBadge from '../components/shared/RiskBadge';
import AdherenceCalendar from '../components/patient/AdherenceCalendar';
import EscalationLog from '../components/patient/EscalationLog';
import SymptomTimeline from '../components/patient/SymptomTimeline';
import ConfirmModal from '../components/shared/ConfirmModal';
import SupportVisits from '../components/patient/SupportVisits';
import PatientRemindersTab from '../components/patient/PatientRemindersTab';
import PatientStickyNote from '../components/patient/PatientStickyNote';
import PatientQuickContact from '../components/patient/PatientQuickContact';
import { ArrowLeft, Phone, Calendar, Activity, Trash2, CheckCircle, Flame, Edit, X, ClipboardList, Globe, Layers } from 'lucide-react';

const REGIMENS = ['2HRZE/4HR', '2HRZE/4HRE', '9H', 'B-Pal'];
const LANGUAGES = ['en', 'kn'] as const;
const LANG_LABELS: Record<string, string> = { en: 'English', kn: 'Kannada (ka)' };

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '', phone: '', language: 'en',
    treatmentStartDate: '', regimenType: '2HRZE/4HR', channelPref: 'sms',
    caregiverName: '', caregiverPhone: '', caregiverRelation: '', caregiverChannelPref: 'sms'
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'reminders' | 'escalations' | 'symptoms' | 'visits'>('overview');
  const [showRefillModal, setShowRefillModal] = useState(false);
  const [refillForm, setRefillForm] = useState({
    last_refill_date: new Date().toISOString().split('T')[0],
    medication_supply_days: 30
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['patient', id],
    queryFn: async () => (await apiClient.get(`/patients/${id}`)).data,
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => apiClient.patch(`/patients/${id}`, { status: 'completed' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      navigate('/patients');
    }
  });

  const refillMutation = useMutation({
    mutationFn: async (payload: typeof refillForm) => {
      const res = await apiClient.post(`/patients/${id}/refill`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setShowRefillModal(false);
    }
  });

  const markVisitMutation = useMutation({
    mutationFn: async () => apiClient.post('/visits', { patient_id: id, visitType: 'home_visit', notes: 'Marked from dashboard' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });

  const updatePatientMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      const payload = {
        full_name: data.fullName.trim(),
        phone: data.phone,
        language: data.language === 'kn' ? 'ka' : 'en',
        regimen_type: data.regimenType,
        treatment_start: new Date(data.treatmentStartDate),
        channel_pref: data.channelPref,
        caregiver_name: data.caregiverName.trim() || null,
        caregiver_phone: data.caregiverPhone.trim() || null,
        caregiver_relation: data.caregiverRelation.trim() || null,
        caregiver_channel_pref: data.caregiverChannelPref
      };
      const res = await apiClient.put(`/patients/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', id] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setShowEditForm(false);
    }
  });

  const openEditForm = () => {
    const patientData = data?.patient;
    if (!patientData) return;
    setEditForm({
      fullName: patientData.fullName,
      phone: patientData.phone,
      language: patientData.language === 'ka' || patientData.language === 'Kannada' ? 'kn' : 'en',
      treatmentStartDate: patientData.treatmentStart ? new Date(patientData.treatmentStart).toISOString().split('T')[0] : '',
      regimenType: patientData.regimenType || '2HRZE/4HR',
      channelPref: patientData.channelPref || 'sms',
      caregiverName: patientData.caregiverName || '',
      caregiverPhone: patientData.caregiverPhone || '',
      caregiverRelation: patientData.caregiverRelation || '',
      caregiverChannelPref: patientData.caregiverChannelPref || 'sms'
    });
    setShowEditForm(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-6 bg-charcoal border border-border animate-pulse w-48 skeleton" />
        <div className="h-40 bg-charcoal border border-border animate-pulse skeleton" />
        <div className="h-64 bg-charcoal border border-border animate-pulse skeleton" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="font-mono text-lg font-bold uppercase tracking-wide" style={{ color: 'var(--risk-red)' }}>Patient Not Found</p>
        <button onClick={() => navigate('/patients')} className="font-mono text-sm" style={{ color: 'var(--muted)' }}>
          ← Back to patients
        </button>
      </div>
    );
  }

  const { patient, adherenceLogs = [], escalations = [], symptomCheckins = [] } = data;

  const daysOnTreatment = patient.treatmentStart
    ? Math.floor((Date.now() - new Date(patient.treatmentStart).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const takenCount = adherenceLogs.filter((l: any) => l.status).length;
  const adherenceRate = adherenceLogs.length > 0
    ? Math.round((takenCount / adherenceLogs.length) * 100)
    : 0;

  const tabs = [
    { key: 'overview', label: 'Adherence Log' },
    { key: 'reminders', label: 'Daily Reminders' },
    { key: 'escalations', label: `Escalations (${escalations.length})` },
    { key: 'symptoms', label: `Symptom Checks (${symptomCheckins.length})` },
    { key: 'visits', label: 'Support Visits & Notes' },
  ] as const;

  const isRed = patient.riskLevel === 'red';
  const isYellow = patient.riskLevel === 'yellow';
  const borderCol = isRed ? 'border-blood/40' : isYellow ? 'border-warn/40' : 'border-teal/40';

  return (
    <div className="space-y-8 page-enter">
      {/* Back nav */}
      <button
        onClick={() => navigate('/patients')}
        className="flex items-center gap-2 font-mono text-[0.75rem] uppercase tracking-wider transition-colors"
        style={{ color: 'var(--muted)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--coral)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
      >
        <ArrowLeft size={12} /> Back to Patients
      </button>

      {/* Patient Header */}
      <div
        className="p-6 relative overflow-hidden"
        style={{
          background: 'var(--charcoal)',
          border: '1px solid var(--border)',
          borderLeft: `3px solid ${isRed ? 'var(--risk-red)' : isYellow ? 'var(--risk-yellow)' : 'var(--risk-green)'}`,
        }}
      >
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 flex items-center justify-center font-mono font-bold text-xl flex-shrink-0"
              style={{
                background: isRed ? 'rgba(239,68,68,0.1)' : isYellow ? 'rgba(245,166,35,0.1)' : 'rgba(52,211,153,0.08)',
                border: `1px solid ${isRed ? 'var(--risk-red)' : isYellow ? 'var(--risk-yellow)' : 'var(--risk-green)'}`,
                color: isRed ? 'var(--risk-red)' : isYellow ? 'var(--risk-yellow)' : 'var(--risk-green)',
              }}
            >
              {patient.fullName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-white font-mono font-bold" style={{ fontSize: '1.375rem', letterSpacing: '0.03em', lineHeight: 1.2 }}>
                {patient.fullName}
              </h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
                <span className="font-mono text-[0.875rem] flex items-center gap-1.5" style={{ color: 'var(--pale)' }}>
                  <Phone size={10} style={{ color: 'var(--muted)' }} /> {patient.phone}
                </span>
                <span
                  className="font-mono text-[0.6875rem] uppercase tracking-wider px-1.5 py-0.5"
                  style={{ background: 'var(--coral-dim)', color: 'var(--coral)', border: '1px solid rgba(255,107,74,0.25)' }}
                >
                  {patient.language}
                </span>
                <RiskBadge level={patient.riskLevel} />
                <span
                  className="font-mono text-[0.6875rem] uppercase tracking-widest px-2 py-0.5"
                  style={patient.status === 'active'
                    ? { border: '1px solid rgba(52,211,153,0.3)', background: 'rgba(52,211,153,0.06)', color: 'var(--risk-green)' }
                    : { border: '1px solid var(--border)', color: 'var(--muted)' }}
                >
                  {patient.status}
                </span>
              </div>
              {patient.nikshayId && (
                <p className="font-mono text-[0.75rem] mt-2" style={{ color: 'var(--muted)' }}>
                  Nikshay ID: <span style={{ color: 'var(--pale)' }}>{patient.nikshayId}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap flex-shrink-0">
            {patient.status === 'active' && (
              <button
                id="patient-log-refill"
                onClick={() => {
                  setRefillForm({
                    last_refill_date: new Date().toISOString().split('T')[0],
                    medication_supply_days: Number(patient.medicationSupplyDays || 30)
                  });
                  setShowRefillModal(true);
                }}
                className="btn-primary flex items-center gap-2"
              >
                <ClipboardList size={12} /> Log Refill
              </button>
            )}
            <button onClick={openEditForm} className="btn-ghost flex items-center gap-2">
              <Edit size={12} /> Edit
            </button>
            <button
              id="patient-mark-visit"
              onClick={() => setActiveTab('visits')}
              className="btn-teal flex items-center gap-2"
            >
              <CheckCircle size={12} /> Log Field Visit
            </button>
            {patient.status === 'active' && (
              <button
                id="patient-deactivate"
                onClick={() => setShowDeactivate(true)}
                className="btn-ghost flex items-center gap-2"
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--risk-red)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = ''; e.currentTarget.style.borderColor = ''; }}
              >
                <Trash2 size={12} /> Complete Treatment
              </button>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-6 pt-6 border-t border-border">
          {[
            { label: 'Streak',       value: `${patient.currentStreak} days`, color: 'var(--coral)' },
            { label: 'Adherence',    value: `${adherenceRate}%`,            color: adherenceRate >= 85 ? 'var(--risk-green)' : adherenceRate >= 60 ? 'var(--risk-yellow)' : 'var(--risk-red)' },
            { label: 'Days Enrolled', value: `${daysOnTreatment} days`,     color: 'var(--pale)' },
            { label: 'Med Supply',   value: patient.medicationDaysRemaining === 0 ? 'Out of Stock' : `${patient.medicationDaysRemaining}d left`, color: patient.medicationDaysRemaining <= 5 ? 'var(--risk-red)' : 'var(--risk-green)' },
            { label: 'Condition',    value: patient.condition || 'TB',      color: 'var(--coral)' },
            { label: 'Duration',     value: patient.treatmentDurationDays ? `${patient.treatmentDurationDays}d` : '180d', color: 'var(--pale)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="space-y-1">
              <p className="font-mono text-[0.6875rem] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{label}</p>
              <p className="font-mono font-bold text-base" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 2-Column Responsive Layout: Left 3/4 for Tabs & Main Info, Right 1/4 for CHW Sticky Note */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        <div className="lg:col-span-3 space-y-6">
          {/* Tabs */}
          <div className="border-b border-border">
            <div className="flex gap-0 overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="px-5 py-3 font-mono text-[0.75rem] uppercase tracking-widest transition-colors border-b-2 -mb-px shrink-0"
                  style={{
                    color: activeTab === tab.key ? 'var(--coral)' : 'var(--muted)',
                    borderBottomColor: activeTab === tab.key ? 'var(--coral)' : 'transparent',
                    fontWeight: activeTab === tab.key ? 600 : 400,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab components */}
          <div className="fade-up">
            {activeTab === 'overview' && (
              <AdherenceCalendar
                logs={adherenceLogs}
              />
            )}
            {activeTab === 'reminders' && (
              <PatientRemindersTab
                patientId={id!}
                patientName={patient.fullName}
                patientPhone={patient.phone}
                channelPref={patient.channelPref}
              />
            )}
            {activeTab === 'escalations' && (
              <EscalationLog
                escalations={escalations}
              />
            )}
            {activeTab === 'symptoms' && (
              <SymptomTimeline logs={symptomCheckins} />
            )}
            {activeTab === 'visits' && (
              <SupportVisits
                patientId={id!}
                patientLanguage={patient.language}
                patientName={patient.fullName}
              />
            )}
          </div>
        </div>

        {/* Persistent CHW Sidebar Actions: Quick Contact, Caregiver Info, and Sticky Note Notepad */}
        <div className="lg:col-span-1 space-y-6">
          {patient.caregiverName && (
            <div className="p-5 relative overflow-hidden" style={{ background: 'var(--charcoal)', border: '1px solid var(--border)' }}>
              <div className="absolute top-0 left-0 right-0 h-[1.5px]" style={{ background: 'var(--coral)' }} />
              <p className="font-mono text-[0.6875rem] uppercase tracking-wider font-bold flex items-center gap-1.5 mb-3" style={{ color: 'var(--coral)' }}>
                <Activity size={11} /> Support Supporter
              </p>
              <div className="space-y-3 font-mono">
                <div>
                  <p className="text-[0.625rem] text-muted uppercase tracking-wider">Name</p>
                  <p className="text-xs text-white font-semibold mt-0.5">{patient.caregiverName}</p>
                </div>
                {patient.caregiverRelation && (
                  <div>
                    <p className="text-[0.625rem] text-muted uppercase tracking-wider">Relationship</p>
                    <p className="text-xs text-pale mt-0.5">{patient.caregiverRelation}</p>
                  </div>
                )}
                {patient.caregiverPhone && (
                  <div>
                    <p className="text-[0.625rem] text-muted uppercase tracking-wider">Contact Phone</p>
                    <p className="text-xs text-pale mt-0.5 flex items-center gap-1">
                      <Phone size={10} className="text-muted" /> {patient.caregiverPhone}
                    </p>
                  </div>
                )}
                {patient.caregiverChannelPref && (
                  <div>
                    <p className="text-[0.625rem] text-muted uppercase tracking-wider">Channel Pref</p>
                    <span className="inline-block mt-1 text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5" style={{ background: 'rgba(255,107,74,0.08)', color: 'var(--coral)', border: '1px solid rgba(255,107,74,0.2)' }}>
                      {patient.caregiverChannelPref}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <PatientQuickContact
            patientId={id!}
            patientName={patient.fullName}
            phoneNumber={patient.phone}
            preferredChannel={patient.channelPref}
          />
          <PatientStickyNote 
            patientId={id!} 
            initialNote={patient.stickyNote || patient.sticky_note || ''} 
          />
        </div>
      </div>

      {/* Deactivate confirm modal */}
      <ConfirmModal
        isOpen={showDeactivate}
        title="Complete Patient Treatment Plan"
        message={`This will transition ${patient.fullName} to 'completed' status and deactivate reminder notifications. Active records will be archived.`}
        onConfirm={() => deactivateMutation.mutate()}
        onCancel={() => setShowDeactivate(false)}
      />

      {/* Edit Form Modal */}
      {showEditForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark/90 backdrop-blur-md">
          <div className="w-full max-w-lg overflow-hidden relative" style={{ background: 'var(--charcoal)', border: '1px solid var(--border)' }}>
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--coral)' }} />
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-2">
                <ClipboardList size={14} style={{ color: 'var(--coral)' }} />
                <h3 style={{ color: 'var(--coral)', fontSize: '0.9375rem' }}>Edit Patient Record</h3>
              </div>
              <button onClick={() => setShowEditForm(false)} style={{ color: 'var(--muted)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--white)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
              >
                <X size={18} />
              </button>
            </div>
            <form
              className="p-6 space-y-4 max-h-[75vh] overflow-y-auto"
              onSubmit={(e) => { e.preventDefault(); updatePatientMutation.mutate(editForm); }}
            >
              <div className="space-y-1.5">
                <label className="field-label">Full Name</label>
                <input
                  type="text"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm(prev => ({ ...prev, fullName: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="field-label"><Phone size={9} /> Phone Number</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="field-label"><Calendar size={9} /> Treatment Start Date</label>
                <input
                  type="date"
                  value={editForm.treatmentStartDate}
                  onChange={(e) => setEditForm(prev => ({ ...prev, treatmentStartDate: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="field-label"><Globe size={9} /> Language</label>
                <select
                  value={editForm.language}
                  onChange={(e) => setEditForm(prev => ({ ...prev, language: e.target.value }))}
                >
                  {LANGUAGES.map(l => <option key={l} value={l}>{LANG_LABELS[l]}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="field-label"><Layers size={9} /> Regimen Type</label>
                <select
                  value={editForm.regimenType}
                  onChange={(e) => setEditForm(prev => ({ ...prev, regimenType: e.target.value }))}
                >
                  {REGIMENS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="field-label">Notification Channel</label>
                <select
                  value={editForm.channelPref}
                  onChange={(e) => setEditForm(prev => ({ ...prev, channelPref: e.target.value }))}
                >
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>

              {/* Caregiver fields separator */}
              <div className="col-span-1 md:col-span-2 border-t border-border/50 pt-3 mt-1">
                <p className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted font-bold flex items-center gap-1" style={{ color: 'var(--coral)' }}>
                  Caregiver / Support Contact (Optional)
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="field-label">Supporter Name</label>
                <input
                  type="text"
                  placeholder="e.g., Suman Naik"
                  value={editForm.caregiverName}
                  onChange={(e) => setEditForm(prev => ({ ...prev, caregiverName: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="field-label">Relationship to Patient</label>
                <input
                  type="text"
                  placeholder="e.g., Spouse, Brother, Friend"
                  value={editForm.caregiverRelation}
                  onChange={(e) => setEditForm(prev => ({ ...prev, caregiverRelation: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="field-label">Supporter Phone</label>
                <input
                  type="tel"
                  placeholder="e.g., 9876543211"
                  value={editForm.caregiverPhone}
                  onChange={(e) => setEditForm(prev => ({ ...prev, caregiverPhone: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="field-label">Supporter Alert Channel</label>
                <select
                  value={editForm.caregiverChannelPref}
                  onChange={(e) => setEditForm(prev => ({ ...prev, caregiverChannelPref: e.target.value }))}
                >
                  <option value="sms">SMS</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>

              {updatePatientMutation.error && (() => {
                const errData = (updatePatientMutation.error as any)?.response?.data;
                const genericMsg: string = errData?.error ?? 'Update failed';
                return (
                  <div className="p-3 font-mono text-[0.8125rem]" style={{ border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.07)', color: 'var(--risk-red)' }}>
                    <p>⚠ {genericMsg}</p>
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-4 border-t border-border mt-6">
                <button type="button" onClick={() => setShowEditForm(false)} className="flex-1 btn-ghost py-3 justify-center">
                  Cancel
                </button>
                <button type="submit" disabled={updatePatientMutation.isPending} className="flex-1 btn-primary py-3 justify-center">
                  {updatePatientMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Refill Medication Modal */}
      {showRefillModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark/95 backdrop-blur-md">
          <div
            className="w-full max-w-md relative overflow-hidden"
            style={{ background: 'var(--charcoal)', border: '1px solid var(--border)' }}
          >
            {/* Accent top bar */}
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--accent)' }} />

            <div className="flex items-center justify-between p-6 border-b border-border">
              <div className="flex items-center gap-2">
                <ClipboardList size={15} style={{ color: 'var(--accent)' }} />
                <h3 style={{ color: 'var(--accent)', fontSize: '0.9375rem' }} className="font-mono uppercase font-bold tracking-wider">Log Medication Refill</h3>
              </div>
              <button onClick={() => setShowRefillModal(false)} className="text-muted hover:text-white">
                <X size={15} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                refillMutation.mutate(refillForm);
              }}
              className="p-6 space-y-4"
            >
              <div className="space-y-1.5">
                <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted block">Refill / Distribution Date</label>
                <input
                  type="date"
                  required
                  value={refillForm.last_refill_date}
                  onChange={e => setRefillForm(prev => ({ ...prev, last_refill_date: e.target.value }))}
                  className="w-full font-mono text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted block">Medication Supply (Days)</label>
                <select
                  value={refillForm.medication_supply_days}
                  onChange={e => setRefillForm(prev => ({ ...prev, medication_supply_days: Number(e.target.value) }))}
                  className="w-full font-mono text-sm"
                >
                  <option value={15}>15 Days Supply</option>
                  <option value={30}>30 Days Supply</option>
                  <option value={45}>45 Days Supply</option>
                  <option value={60}>60 Days Supply</option>
                  <option value={90}>90 Days Supply</option>
                </select>
              </div>

              <div className="bg-surface/50 border border-border/60 p-4 rounded-2xl space-y-2">
                <p className="font-sans text-xs text-pale">
                  Logging a refill resets the medication supply countdown for <span className="font-bold text-white">{patient.fullName}</span>. An automated alert will highlight this patient again once they are within 5 days of running out.
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border mt-6">
                <button type="button" onClick={() => setShowRefillModal(false)} className="flex-1 btn-ghost py-2.5 justify-center text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={refillMutation.isPending} className="flex-1 btn-primary py-2.5 justify-center text-xs">
                  {refillMutation.isPending ? 'Saving Refill...' : 'Log Refill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
