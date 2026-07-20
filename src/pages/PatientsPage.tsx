import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import RiskBadge from '../components/shared/RiskBadge';
import { useAuthStore } from '../hooks/useAuthStore';
import { Search, UserPlus, X, ChevronRight, Phone, Globe, Calendar, Hash, ClipboardList, Layers, FileSpreadsheet } from 'lucide-react';
import QuickRegisterModal from '../components/patient/QuickRegisterModal';
import BulkImportModal from '../components/patient/BulkImportModal';

interface PatientsPageProps {
  showNew?: boolean;
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

export default function PatientsPage({ showNew = false }: PatientsPageProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [showForm, setShowForm] = useState(showNew);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'high_risk' | 'adherent' | 'low_supply' | 'inactive' | 'all'>('active');

  const { data: patientsRaw, isLoading } = useQuery({
    queryKey: ['patients'],
    queryFn: async () => (await apiClient.get('/patients', { params: { include_all: 'true' } })).data,
  });

  const patients = Array.isArray(patientsRaw) ? patientsRaw : [];

  const filtered = patients
    .filter((p: any) => {
      if (!p) return false;
      if (user?.role === 'hw') {
        return p.healthWorkerId === user?.id;
      }
      return true;
    })
    .filter((p: any) => {
      if (!p) return false;
      if (statusFilter === 'all') return true;
      if (statusFilter === 'active') return p.status === 'active';
      if (statusFilter === 'high_risk') return p.riskLevel === 'red' && p.status === 'active';
      if (statusFilter === 'adherent') return p.riskLevel === 'green' && p.status === 'active';
      if (statusFilter === 'low_supply') return (p.medicationDaysRemaining ?? 0) <= 5 && p.status === 'active';
      if (statusFilter === 'inactive') return p.status !== 'active';
      return true;
    })
    .filter((p: any) => {
      if (!p) return false;
      const fullName = p.fullName || '';
      const phone = p.phone || '';
      const nikshayId = p.nikshayId || '';
      return (
        !search ||
        fullName.toLowerCase().includes(search.toLowerCase()) ||
        phone.includes(search) ||
        nikshayId.toLowerCase().includes(search.toLowerCase())
      );
    });

  const STATUS_FILTERS = [
    { key: 'active',    label: 'Active' },
    { key: 'high_risk', label: 'High Risk' },
    { key: 'adherent',  label: 'Adherent' },
    { key: 'low_supply', label: 'Low Med Supply ⚠️' },
    { key: 'inactive',  label: 'Inactive' },
    { key: 'all',       label: 'All Enrolled' },
  ] as const;

  return (
    <div className="space-y-8 page-enter">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-border">
        <div>
          <h1 className="text-white" style={{ fontSize: '2rem', letterSpacing: '0.06em' }}>PATIENT ROSTER</h1>
          <p className="font-mono text-[0.875rem] mt-1.5" style={{ color: 'var(--muted)' }}>
            {patients.length} Enrolled TB Cases · Active Cohort Panel
          </p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          {user?.role === 'admin' && (
            <button
              id="patients-bulk-import-btn"
              onClick={() => setShowBulkImport(true)}
              className="btn-ghost flex items-center gap-2"
            >
              <FileSpreadsheet size={14} /> Bulk CSV Import
            </button>
          )}
          <button
            id="patients-enroll-btn"
            onClick={() => setShowForm(true)}
            className="btn-primary flex items-center gap-2"
          >
            <UserPlus size={14} /> Enroll New Patient
          </button>
        </div>
      </div>

      {/* Enrollment Modal */}
      <QuickRegisterModal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
      />

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
      />

      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-grow">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--muted)' }} />
          <input
            id="patients-search"
            type="text"
            placeholder="Search by name, phone, or Nikshay ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap md:flex-nowrap flex-shrink-0">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className="px-4 py-2 font-mono text-[0.75rem] uppercase tracking-widest transition-all duration-200"
              style={{
                border: `1px solid ${statusFilter === key ? 'var(--coral)' : 'var(--border)'}`,
                background: statusFilter === key ? 'var(--coral-dim)' : 'transparent',
                color: statusFilter === key ? 'var(--coral)' : 'var(--muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Patient Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="border border-border h-16 skeleton" style={{ background: 'var(--charcoal)' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center space-y-3" style={{ background: 'var(--charcoal)', border: '1px solid var(--border)' }}>
          <div className="inline-flex items-center justify-center w-10 h-10 mx-auto mb-2"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <Search size={18} style={{ color: 'var(--muted)' }} />
          </div>
          <p className="font-mono text-sm font-semibold text-white uppercase tracking-wider">No Patient Records</p>
          <p className="font-mono text-[0.8125rem] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            {search || statusFilter !== 'active' ? 'Adjust search filters' : 'Begin enrollment flow'}
          </p>
        </div>
      ) : (
        <div className="border border-border overflow-x-auto" style={{ background: 'var(--charcoal)' }}>
          <table className="w-full border-collapse text-left min-w-[700px]">
            <thead>
              <tr className="border-b border-border" style={{ background: 'rgba(0,0,0,0.3)' }}>
                {['Patient', 'Contact', 'Medication', 'Status/Risk', 'Streak', 'Regimen', ''].map((h, i) => (
                  <th key={i} className="p-3 font-mono text-[0.6875rem] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((patient: any) => {
                const isActive = patient.status === 'active';
                const isRed    = patient.riskLevel === 'red';
                const isYellow = patient.riskLevel === 'yellow';
                const leftColor = !isActive 
                  ? '#6B705C' 
                  : isRed 
                    ? 'var(--risk-red)' 
                    : isYellow 
                      ? 'var(--risk-yellow)' 
                      : 'var(--risk-green)';
                return (
                  <tr
                    key={patient.id}
                    id={`patient-row-${patient.id}`}
                    onClick={() => navigate(`/patients/${patient.id}`)}
                    className="table-row cursor-pointer group"
                    style={{ borderLeft: `3px solid ${leftColor}` }}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 flex items-center justify-center font-mono font-bold text-sm flex-shrink-0"
                          style={{ 
                            background: 'var(--surface)', 
                            border: '1px solid var(--border)', 
                            color: leftColor,
                            opacity: isActive ? 1 : 0.6
                          }}
                        >
                          {(patient.fullName || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-mono text-[0.9375rem] text-white font-medium group-hover:text-coral transition-colors" style={{ lineHeight: 1.3, opacity: isActive ? 1 : 0.75 }}>
                              {patient.fullName || 'Unknown Patient'}
                            </p>
                            {!isActive && (
                              <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded" style={{
                                background: patient.status === 'completed' ? 'rgba(74, 93, 78, 0.15)' : 'rgba(178, 76, 61, 0.15)',
                                color: patient.status === 'completed' ? '#4A5D4E' : '#B24C3D',
                                border: `1px solid ${patient.status === 'completed' ? 'rgba(74, 93, 78, 0.3)' : 'rgba(178, 76, 61, 0.3)'}`
                              }}>
                                {patient.status}
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-[0.6875rem]" style={{ color: 'var(--muted)' }}>
                            {patient.nikshayId || '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 font-mono text-[0.875rem]" style={{ color: 'var(--pale)', opacity: isActive ? 1 : 0.6 }}>
                        <Phone size={10} style={{ color: 'var(--muted)' }} />
                        {patient.phone}
                      </div>
                    </td>
                    <td className="p-3">
                      {isActive ? (
                        <span className={`font-mono text-[0.75rem] uppercase tracking-wider px-2 py-0.5 rounded border ${
                          patient.medicationDaysRemaining <= 5
                            ? patient.medicationDaysRemaining === 0
                              ? 'bg-red-500/10 text-red-400 border-red-500/20 font-bold'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-green-500/10 text-green-400 border-green-500/20'
                        }`}>
                          {patient.medicationDaysRemaining === 0 ? 'Out of Stock' : `${patient.medicationDaysRemaining}d left`}
                        </span>
                      ) : (
                        <span className="font-mono text-[0.75rem] text-muted">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {isActive ? (
                        <RiskBadge level={patient.riskLevel} />
                      ) : (
                        <span className="font-mono text-[0.75rem] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[0.875rem] font-semibold" style={{ color: isActive ? 'var(--risk-green)' : 'var(--muted)' }}>
                        {patient.currentStreak}d
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[0.8125rem]" style={{ color: 'var(--pale)', opacity: isActive ? 1 : 0.6 }}>
                        {patient.regimenType}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <ChevronRight size={14} className="inline transition-all duration-200 group-hover:translate-x-1"
                        style={{ color: 'var(--muted)' }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="font-mono text-[0.6875rem] uppercase tracking-wider text-right" style={{ color: 'var(--muted)' }}>
        Showing {filtered.length} of {patients.length} enrolled patients
      </p>
    </div>
  );
}
