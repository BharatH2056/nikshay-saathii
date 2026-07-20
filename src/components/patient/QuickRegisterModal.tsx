import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../hooks/useAuthStore';
import { 
  X, 
  UserPlus, 
  Phone, 
  Calendar, 
  ClipboardList, 
  Globe, 
  Layers, 
  Hash, 
  ShieldAlert 
} from 'lucide-react';

interface QuickRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (patient: any) => void;
}

const REGIMENS = ['2HRZE/4HR', '2HRZE/4HRE', '9H', 'B-Pal'];
const LANGUAGES = ['en', 'kn'] as const;
const LANG_LABELS: Record<string, string> = { en: 'English', kn: 'Kannada (ka)' };
const LANG_TO_BACKEND: Record<string, string> = { en: 'en', kn: 'ka' };
const REGIMEN_TO_BACKEND = (_: string) => 'standard_6mo_dots';

function normalizePhone(raw: string): string {
  const clean = raw.trim();
  if (clean.startsWith('+91')) {
    const digits = clean.substring(3).replace(/\D/g, '');
    return `+91${digits}`;
  }
  const digits = clean.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return clean;
}

export default function QuickRegisterModal({ isOpen, onClose, onSuccess }: QuickRegisterModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [consentGiven, setConsentGiven] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    language: 'en',
    treatmentStartDate: new Date().toISOString().split('T')[0],
    regimenType: '2HRZE/4HR',
    assignedHWId: '',
    nikshayId: '',
    channelPref: 'sms',
    condition: 'TB',
    treatmentDurationDays: 180,
    medicationSupplyDays: 30,
    caregiverName: '',
    caregiverPhone: '',
    caregiverRelation: '',
    caregiverChannelPref: 'sms'
  });

  const { data: workers = [] } = useQuery({
    queryKey: ['workers'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/auth/workers');
        return res.data;
      } catch {
        return [];
      }
    },
    enabled: isOpen
  });

  const enrollMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        full_name: data.fullName.trim(),
        phone: normalizePhone(data.phone),
        language: LANG_TO_BACKEND[data.language] ?? 'en',
        condition: data.condition,
        regimen_type: REGIMEN_TO_BACKEND(data.regimenType),
        treatment_start: data.treatmentStartDate,
        treatment_duration_days: Number(data.treatmentDurationDays),
        channel_pref: data.channelPref || 'sms',
        medication_supply_days: Number(data.medicationSupplyDays),
        last_refill_date: data.treatmentStartDate, // Default last refill date is treatment start
        health_worker_id: data.assignedHWId || user?.id || '11111111-1111-1111-1111-111111111111',
        caregiver_name: data.caregiverName.trim() || null,
        caregiver_phone: data.caregiverPhone.trim() ? normalizePhone(data.caregiverPhone) : null,
        caregiver_relation: data.caregiverRelation.trim() || null,
        caregiver_channel_pref: data.caregiverChannelPref || 'sms',
        consent_given: consentGiven
      };
      const res = await apiClient.post('/patients', payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      
      // Reset form
      setConsentGiven(false);
      setForm({
        fullName: '',
        phone: '',
        language: 'en',
        treatmentStartDate: new Date().toISOString().split('T')[0],
        regimenType: '2HRZE/4HR',
        assignedHWId: '',
        nikshayId: '',
        channelPref: 'sms',
        condition: 'TB',
        treatmentDurationDays: 180,
        medicationSupplyDays: 30,
        caregiverName: '',
        caregiverPhone: '',
        caregiverRelation: '',
        caregiverChannelPref: 'sms'
      });

      onClose();

      const patient = data?.patient ?? data;
      if (onSuccess) {
        onSuccess(patient);
      } else if (patient?.id) {
        navigate(`/patients/${patient.id}`);
      }
    }
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark/90 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-lg relative overflow-hidden flex flex-col max-h-[90vh] animate-slide-up"
        style={{ background: 'var(--charcoal)', border: '1px solid var(--border)' }}
      >
        {/* Top Accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--coral)' }} />

        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <UserPlus size={16} style={{ color: 'var(--coral)' }} />
            <h3 style={{ color: 'var(--coral)', fontSize: '0.9375rem' }} className="font-mono uppercase font-bold tracking-wider">
              Quick Patient Registration
            </h3>
          </div>
          <button 
            onClick={onClose} 
            style={{ color: 'var(--muted)' }}
            className="hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form
          className="p-6 space-y-4 overflow-y-auto flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            enrollMutation.mutate(form);
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Full Name */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted block">Full Name</label>
              <input 
                type="text" 
                placeholder="e.g., Rajesh Naik" 
                value={form.fullName}
                onChange={(e) => setForm(prev => ({ ...prev, fullName: e.target.value }))} 
                required 
                className="w-full font-mono text-sm"
              />
            </div>

            {/* Phone Number */}
            <div className="space-y-1.5">
              <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted flex items-center gap-1">
                <Phone size={10} /> Phone Number
              </label>
              <input 
                type="tel" 
                placeholder="e.g., 9876543210" 
                value={form.phone}
                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))} 
                required 
                className="w-full font-mono text-sm"
              />
              <p className="font-mono text-[0.6rem] text-muted leading-none">
                10-digit number. +91 prefix auto-added.
              </p>
            </div>

            {/* Disease/Condition */}
            <div className="space-y-1.5">
              <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted block">Condition / Diagnosis</label>
              <input 
                type="text" 
                placeholder="e.g., TB, HIV, Asthma" 
                value={form.condition}
                onChange={(e) => setForm(prev => ({ ...prev, condition: e.target.value }))} 
                required 
                className="w-full font-mono text-sm"
              />
            </div>

            {/* Treatment Start Date */}
            <div className="space-y-1.5">
              <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted flex items-center gap-1">
                <Calendar size={10} /> Treatment Start
              </label>
              <input 
                type="date" 
                value={form.treatmentStartDate}
                onChange={(e) => setForm(prev => ({ ...prev, treatmentStartDate: e.target.value }))} 
                required 
                className="w-full font-mono text-sm"
              />
            </div>

            {/* Medication Supply Days */}
            <div className="space-y-1.5">
              <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted block">Medication Supply (Days)</label>
              <select
                value={form.medicationSupplyDays}
                onChange={(e) => setForm(prev => ({ ...prev, medicationSupplyDays: Number(e.target.value) }))}
                className="w-full font-mono text-sm"
              >
                <option value={15}>15 Days Supply</option>
                <option value={30}>30 Days Supply</option>
                <option value={45}>45 Days Supply</option>
                <option value={60}>60 Days Supply</option>
                <option value={90}>90 Days Supply</option>
              </select>
            </div>

            {/* Treatment Duration (Days) */}
            <div className="space-y-1.5">
              <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted block">Course Duration (Days)</label>
              <input 
                type="number" 
                min="1" 
                value={form.treatmentDurationDays}
                onChange={(e) => setForm(prev => ({ ...prev, treatmentDurationDays: parseInt(e.target.value) || 0 }))} 
                required 
                className="w-full font-mono text-sm"
              />
            </div>

            {/* Regimen Type */}
            <div className="space-y-1.5">
              <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted flex items-center gap-1">
                <Layers size={10} /> Regimen Type
              </label>
              <select 
                value={form.regimenType} 
                onChange={(e) => setForm(prev => ({ ...prev, regimenType: e.target.value }))}
                className="w-full font-mono text-sm"
              >
                {REGIMENS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Language */}
            <div className="space-y-1.5">
              <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted flex items-center gap-1">
                <Globe size={10} /> Language Pref
              </label>
              <select 
                value={form.language} 
                onChange={(e) => setForm(prev => ({ ...prev, language: e.target.value }))}
                className="w-full font-mono text-sm"
              >
                {LANGUAGES.map(l => <option key={l} value={l}>{LANG_LABELS[l]}</option>)}
              </select>
            </div>

            {/* Notification Channel */}
            <div className="space-y-1.5">
              <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted block">Alert Delivery Channel</label>
              <select 
                value={form.channelPref} 
                onChange={(e) => setForm(prev => ({ ...prev, channelPref: e.target.value }))}
                className="w-full font-mono text-sm"
              >
                <option value="sms">SMS Network</option>
                <option value="whatsapp">WhatsApp Business</option>
              </select>
            </div>

            {/* Divider for Caregiver Info */}
            <div className="md:col-span-2 border-t border-border/50 pt-3 mt-1">
              <h4 className="font-mono text-[0.75rem] uppercase tracking-wider text-muted font-bold flex items-center gap-1" style={{ color: 'var(--coral)' }}>
                <ShieldAlert size={12} /> Caregiver / Support Contact (Optional)
              </h4>
            </div>

            {/* Caregiver Name */}
            <div className="space-y-1.5">
              <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted block">Supporter Name</label>
              <input 
                type="text" 
                placeholder="e.g., Suman Naik" 
                value={form.caregiverName}
                onChange={(e) => setForm(prev => ({ ...prev, caregiverName: e.target.value }))} 
                className="w-full font-mono text-sm"
              />
            </div>

            {/* Caregiver Relation */}
            <div className="space-y-1.5">
              <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted block">Relationship to Patient</label>
              <input 
                type="text" 
                placeholder="e.g., Spouse, Brother, Friend" 
                value={form.caregiverRelation}
                onChange={(e) => setForm(prev => ({ ...prev, caregiverRelation: e.target.value }))} 
                className="w-full font-mono text-sm"
              />
            </div>

            {/* Caregiver Phone */}
            <div className="space-y-1.5">
              <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted flex items-center gap-1">
                <Phone size={10} /> Supporter Phone
              </label>
              <input 
                type="tel" 
                placeholder="e.g., 9876543211" 
                value={form.caregiverPhone}
                onChange={(e) => setForm(prev => ({ ...prev, caregiverPhone: e.target.value }))} 
                className="w-full font-mono text-sm"
              />
              <p className="font-mono text-[0.6rem] text-muted leading-none">
                10-digit number. +91 prefix auto-added.
              </p>
            </div>

            {/* Caregiver Notification Channel */}
            <div className="space-y-1.5">
              <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted block">Supporter Alert Channel</label>
              <select 
                value={form.caregiverChannelPref} 
                onChange={(e) => setForm(prev => ({ ...prev, caregiverChannelPref: e.target.value }))}
                className="w-full font-mono text-sm"
              >
                <option value="sms">SMS Network</option>
                <option value="whatsapp">WhatsApp Business</option>
              </select>
            </div>

            {/* Assign Health Worker */}
            {workers.length > 0 && (
              <div className="space-y-1.5 md:col-span-2">
                <label className="font-mono text-[0.6875rem] uppercase tracking-wider text-muted block">Assign Field Health Worker</label>
                <select 
                  value={form.assignedHWId} 
                  onChange={(e) => setForm(prev => ({ ...prev, assignedHWId: e.target.value }))}
                  className="w-full font-mono text-sm"
                >
                  <option value="">-- Self Assign ({user?.fullName || 'Current User'}) --</option>
                  {workers.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.fullName} ({w.region})</option>
                  ))}
                </select>
              </div>
            )}

            {/* DPDP Act Consent Compliance Checklist */}
            <div className="md:col-span-2 border-t border-border/50 pt-3 mt-1">
              <h4 className="font-mono text-[0.75rem] uppercase tracking-wider text-muted font-bold flex items-center gap-1" style={{ color: 'var(--coral)' }}>
                <ShieldAlert size={12} /> DPDP Act Compliance & Consent
              </h4>
              <div className="mt-2.5 p-3.5 bg-surface/40 border border-border/40 rounded-xl space-y-2">
                <p className="font-mono text-[0.625rem] text-muted leading-relaxed uppercase">
                  Under India's Digital Personal Data Protection (DPDP) Act, explicit verifiable consent must be captured prior to processing sensitive health & location data of TB/infectious disease patients.
                </p>
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={consentGiven}
                    onChange={(e) => setConsentGiven(e.target.checked)}
                    required
                    className="mt-0.5 rounded border-border bg-charcoal text-risk-green focus:ring-0 cursor-pointer"
                  />
                  <span className="font-mono text-[0.6875rem] text-pale leading-normal uppercase">
                    I confirm that the patient has provided explicit verbal/written consent to store their encrypted records and receive treatment reminders via WhatsApp/SMS. <span className="text-risk-red font-bold">*</span>
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Error display */}
          {enrollMutation.error && (() => {
            const errData = (enrollMutation.error as any)?.response?.data;
            const zodErrors: Array<{ message: string; path: string[] }> = errData?.errors ?? [];
            const genericMsg: string = errData?.error ?? 'Registration failed';
            return (
              <div className="p-3 font-mono text-[0.8125rem] space-y-1"
                style={{ border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.07)', color: 'var(--risk-red)' }}>
                {zodErrors.length > 0
                  ? zodErrors.map((e, i) => <p key={i}>⚠ <strong>{e.path?.join('.') || 'field'}</strong>: {e.message}</p>)
                  : <p>⚠ {genericMsg}</p>
                }
              </div>
            );
          })()}

          {/* Action buttons */}
          <div className="flex gap-3 pt-4 border-t border-border mt-6">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 btn-ghost py-2.5 justify-center text-xs"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={enrollMutation.isPending} 
              className="flex-1 btn-primary py-2.5 justify-center text-xs"
            >
              {enrollMutation.isPending ? 'Registering...' : 'Register Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
