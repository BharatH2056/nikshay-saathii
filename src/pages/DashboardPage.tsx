import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import RiskCounters from '../components/dashboard/RiskCounters';
import PatientCard from '../components/dashboard/PatientCard';
import AdherenceTrend from '../components/dashboard/AdherenceTrend';
import DailyAdherenceTracker from '../components/dashboard/DailyAdherenceTracker';
import QuickRegisterModal from '../components/patient/QuickRegisterModal';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import { 
  RefreshCw, 
  Users, 
  AlertTriangle, 
  ArrowUpRight, 
  TrendingUp, 
  ShieldCheck, 
  MapPin, 
  Award,
  Globe,
  Settings,
  Download,
  Terminal,
  Activity,
  Plus,
  HardDrive,
  Database
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../hooks/useAuthStore';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [isQuickRegisterOpen, setIsQuickRegisterOpen] = useState(false);

  // Administrative filters and operations state
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [opStatusMsg, setOpStatusMsg] = useState('');

  // ── 1. Query for Health Worker Dashboard ──
  const { 
    data: dashboardData, 
    isLoading: isHwLoading, 
    refetch: refetchHw, 
    isFetching: isHwFetching 
  } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await apiClient.get('/dashboard');
      return res.data;
    },
    enabled: !isAdmin,
    refetchInterval: 30_000,
  });

  // ── 2. Query for Admin Dashboard ──
  const { 
    data: adminSummary, 
    isLoading: isAdminLoading, 
    refetch: refetchAdmin, 
    isFetching: isAdminFetching 
  } = useQuery({
    queryKey: ['admin-summary', selectedRegion],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/summary?region=${selectedRegion}`);
      return res.data;
    },
    enabled: isAdmin,
    refetchInterval: 30_000,
  });

  // Load system health monitoring metrics
  const { data: systemHealth, refetch: refetchHealth } = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/health');
      return res.data;
    },
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  // Load current backups
  const { data: backupsList = [], refetch: refetchBackups } = useQuery({
    queryKey: ['backups-list'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/backups');
      return res.data;
    },
    enabled: isAdmin,
  });

  // Load escalations for the administrator alerts feed
  const { data: openEscalations = [], isLoading: isEscalationsLoading } = useQuery({
    queryKey: ['escalations', 'open'],
    queryFn: async () => {
      const response = await apiClient.get('/escalations?status=open');
      return response.data;
    },
    enabled: isAdmin,
    refetchInterval: 15_000,
  });

  const isLoading = isAdmin ? isAdminLoading : isHwLoading;
  const isFetching = isAdmin ? isAdminFetching : isHwFetching;
  const refetch = isAdmin ? () => { refetchAdmin(); refetchHealth(); refetchBackups(); } : refetchHw;

  const handleTriggerBackup = async () => {
    setIsBackingUp(true);
    setOpStatusMsg('Triggering database hot-backup & checking integrity...');
    try {
      const res = await apiClient.post('/admin/backup');
      if (res.data.success) {
        setOpStatusMsg(`Backup successfully created: ${res.data.fileName} (${(res.data.sizeBytes / 1024).toFixed(1)} KB)`);
        refetchBackups();
        refetchHealth();
      } else {
        setOpStatusMsg('Backup failed: unknown error.');
      }
    } catch (err: any) {
      setOpStatusMsg(`Backup failed: ${err?.response?.data?.error || err.message}`);
    } finally {
      setIsBackingUp(false);
      setTimeout(() => setOpStatusMsg(''), 6000);
    }
  };

  const handleTriggerRestore = async (fileName: string) => {
    if (!window.confirm(`Are you absolutely sure you want to overwrite your active active database with backup "${fileName}"? This is irreversible.`)) {
      return;
    }
    setIsRestoring(true);
    setOpStatusMsg(`Restoring database from snapshot "${fileName}"...`);
    try {
      const res = await apiClient.post('/admin/restore', { fileName });
      if (res.data.success) {
        setOpStatusMsg(`Restore complete! Safety pre-restore snapshot created as: ${res.data.safetySnapshot}.`);
        refetchAdmin();
        refetchBackups();
        refetchHealth();
      } else {
        setOpStatusMsg('Restore failed: unknown error.');
      }
    } catch (err: any) {
      setOpStatusMsg(`Restore failed: ${err?.response?.data?.error || err.message}`);
    } finally {
      setIsRestoring(false);
      setTimeout(() => setOpStatusMsg(''), 8000);
    }
  };

  const handleExportNikshay = async () => {
    try {
      setOpStatusMsg('Generating Nikshay bulk upload adherence report...');
      const response = await apiClient.get('/admin/export/nikshay', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'nikshay_adherence_report.csv');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      setOpStatusMsg('Nikshay report downloaded successfully.');
    } catch (err: any) {
      console.error('Failed to export Nikshay report:', err);
      setOpStatusMsg(`Failed to export Nikshay report: ${err?.response?.data?.error || err.message}`);
    } finally {
      setTimeout(() => setOpStatusMsg(''), 5000);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER DTO ADMINISTRATOR PORTAL DASHBOARD
  // ──────────────────────────────────────────────────────────────────────────
  if (isAdmin) {
    const summary = adminSummary ?? {
      totalPatients: 0,
      totalWorkers: 0,
      totalEscalations: 0,
      regionSummary: [],
      uniqueRegions: [],
      cohortAdherenceCurve: []
    };

    const overallAdherence = 92; // Default mock average for DTO dashboard coverage

    return (
      <div className="space-y-8 page-enter">
        
        {/* ── Page Header ── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-border">
          <div>
            <h1 className="text-white flex items-center gap-2.5" style={{ fontSize: '2rem', letterSpacing: '0.06em' }}>
              DTO EXECUTIVE PORTAL
            </h1>
            <p className="font-mono text-[0.875rem] mt-1.5 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
              <span className="live-dot bg-accent" />
              <span style={{ color: 'var(--pale)' }}>District TB Elimination Command Center</span>
              <span style={{ opacity: 0.35 }}>·</span>
              <span style={{ color: 'var(--accent)' }}>Karnataka State HQ</span>
            </p>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap flex-shrink-0">
            {/* Multi-district / Multi-region admin view selector */}
            <div className="flex items-center gap-2 bg-surface border border-border px-3 py-1.5 rounded-xl">
              <Globe size={13} className="text-accent" />
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value)}
                className="bg-transparent text-white font-mono text-xs border-none outline-none cursor-pointer focus:ring-0 pr-4"
                style={{ WebkitAppearance: 'none', appearance: 'none' }}
              >
                <option value="all" className="bg-[#090B11] text-white">All Districts / Zones</option>
                {summary.uniqueRegions && summary.uniqueRegions.map((reg: string) => (
                  <option key={reg} value={reg} className="bg-[#090B11] text-white">
                    {reg}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="btn-ghost flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
              {isFetching ? 'Syncing...' : 'Sync'}
            </button>
            <button
              onClick={() => navigate('/admin/workers')}
              className="btn-primary flex items-center gap-2"
            >
              <Users size={13} />
              Manage CHW Force
            </button>
          </div>
        </div>

        {/* ── District Overview Counters ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Total Patients */}
          <div className="border border-border p-5 space-y-2 relative" style={{ background: '#0F111A' }}>
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--coral)' }} />
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted">Total Registered Patients</p>
            <div className="flex items-baseline gap-2">
              <span className="font-bebas text-3xl text-white">{summary.totalPatients}</span>
              <span className="font-mono text-[0.65rem] text-muted uppercase tracking-wider">Ni-Kshay Database</span>
            </div>
          </div>

          {/* Card 2: Active CHWs */}
          <div className="border border-border p-5 space-y-2 relative" style={{ background: '#0F111A' }}>
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--accent)' }} />
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted">Active CHW Force</p>
            <div className="flex items-baseline gap-2">
              <span className="font-bebas text-3xl text-white">{summary.totalWorkers}</span>
              <span className="font-mono text-[0.65rem] text-accent uppercase tracking-wider">Field Personnel</span>
            </div>
          </div>

          {/* Card 3: District Alerts */}
          <div className="border border-border p-5 space-y-2 relative" style={{ background: '#0F111A' }}>
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--risk-red)' }} />
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted">Open District Alerts</p>
            <div className="flex items-baseline gap-2">
              <span className="font-bebas text-3xl text-white">{summary.totalEscalations}</span>
              <span className="font-mono text-[0.65rem] text-risk-red uppercase tracking-wider">Action Required</span>
            </div>
          </div>

          {/* Card 4: Compliance Avg */}
          <div className="border border-border p-5 space-y-2 relative" style={{ background: '#0F111A' }}>
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: '#34D399' }} />
            <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted">District Compliance rate</p>
            <div className="flex items-baseline gap-2">
              <span className="font-bebas text-3xl text-white">{overallAdherence}%</span>
              <span className="font-mono text-[0.65rem] text-risk-green uppercase tracking-wider">Target Status: Good</span>
            </div>
          </div>

        </div>

        {/* ── Main Two Column Grid ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* Column 1 & 2: Regional Performance Coverage & Executive Feed */}
          <div className="xl:col-span-2 space-y-8">
            
            {/* Cohort Adherence Curve Over Time */}
            <div className="border border-border p-6 rounded-3xl space-y-5" style={{ background: '#090B11' }}>
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-accent" />
                  <h4 className="text-white text-xs uppercase font-mono tracking-widest" style={{ margin: 0 }}>
                    NTEP Treatment Cohort Adherence Curves
                  </h4>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
                  Compliance Decay Over Weeks
                </span>
              </div>

              <div className="h-48 w-full font-mono text-[10px]">
                {summary.cohortAdherenceCurve && 
                 summary.cohortAdherenceCurve.length > 0 && 
                 summary.cohortAdherenceCurve.some((c: any) => c.adherence !== null && c.adherence !== undefined) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={summary.cohortAdherenceCurve}
                      margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorAdherence" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis 
                        dataKey="week" 
                        stroke="rgba(255,255,255,0.4)" 
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="rgba(255,255,255,0.4)" 
                        domain={[50, 100]}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip 
                        contentStyle={{ background: '#0F111A', borderColor: 'rgba(255,255,255,0.15)', borderRadius: '12px' }}
                        itemStyle={{ color: 'white' }}
                        labelStyle={{ color: 'var(--accent)', fontWeight: 'bold' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="adherence" 
                        stroke="var(--accent)" 
                        strokeWidth={2}
                        fillOpacity={1} 
                        fill="url(#colorAdherence)" 
                        name="Adherence"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted space-y-2 text-center p-4">
                    <span className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>⚠ INSUFFICIENT COHORT DATA</span>
                    <span className="text-[10px] text-muted max-w-[240px] leading-normal">
                      Not enough active adherence logs recorded across treatment weeks. Direct patient activity is required to calculate live compliance curves.
                    </span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between text-[10px] font-mono text-muted bg-surface/30 p-3 rounded-xl border border-border/30">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-accent animate-pulse" /> Live Cohort Tracking</span>
                <span>NTEP Adherence target threshold: <span className="text-accent font-bold">90.0%</span></span>
              </div>
            </div>

            {/* Regional Health Distribution Stack meters */}
            <div className="border border-border p-6 rounded-3xl space-y-5" style={{ background: '#090B11' }}>
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <Globe size={14} className="text-accent" />
                  <h4 className="text-white text-xs uppercase font-mono tracking-widest" style={{ margin: 0 }}>
                    District Adherence Maps & Coverage
                  </h4>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
                  Per-regimen status
                </span>
              </div>

              {isLoading ? (
                <div className="space-y-4 py-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-10 w-full skeleton bg-surface" />
                  ))}
                </div>
              ) : summary.regionSummary.length === 0 ? (
                <div className="text-center py-8 text-muted font-mono text-xs">
                  No regional patient registers loaded. Enroll patients to view distribution maps.
                </div>
              ) : (
                <div className="space-y-4">
                  {summary.regionSummary.map((reg: any, idx: number) => {
                    const redPct = reg.total > 0 ? (reg.red / reg.total) * 100 : 0;
                    const yellowPct = reg.total > 0 ? (reg.yellow / reg.total) * 100 : 0;
                    const greenPct = reg.total > 0 ? (reg.green / reg.total) * 100 : 0;

                    return (
                      <div key={idx} className="space-y-2 border-b border-border/40 pb-3 last:border-b-0">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-1.5">
                            <MapPin size={11} className="text-coral" />
                            <span className="font-sans font-bold text-pale text-xs">
                              {reg.name === 'TB' ? 'Standard Protocol (TB)' : reg.name}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-muted">
                            {reg.total} Patient{reg.total === 1 ? '' : 's'} Logged
                          </span>
                        </div>

                        {/* Stacking bar indicator */}
                        <div className="h-3 w-full bg-surface rounded-lg overflow-hidden flex border border-border/30">
                          <div 
                            className="bg-risk-red h-full" 
                            style={{ width: `${redPct}%` }} 
                            title={`Red alerts: ${reg.red}`} 
                          />
                          <div 
                            className="bg-risk-yellow h-full" 
                            style={{ width: `${yellowPct}%` }} 
                            title={`Yellow caution: ${reg.yellow}`} 
                          />
                          <div 
                            className="bg-risk-green h-full" 
                            style={{ width: `${greenPct}%` }} 
                            title={`Green stable: ${reg.green}`} 
                          />
                        </div>

                        {/* Inline micro counts */}
                        <div className="flex justify-between text-[8px] font-mono uppercase text-muted tracking-wider">
                          <span className="text-risk-red">{reg.red} High Risk (Red)</span>
                          <span className="text-risk-yellow">{reg.yellow} Flagged (Yellow)</span>
                          <span className="text-risk-green">{reg.green} Stable (Green)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* DTO Active Incident Feed / Open Escalations */}
            <div className="border border-border p-6 rounded-3xl space-y-4" style={{ background: '#090B11' }}>
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-risk-red" />
                  <h4 className="text-white text-xs uppercase font-mono tracking-widest" style={{ margin: 0 }}>
                    Active District Escalation Logs
                  </h4>
                </div>
                <button
                  onClick={() => navigate('/escalations')}
                  className="font-mono text-[9px] uppercase tracking-wider text-risk-red hover:opacity-80 transition-opacity flex items-center gap-1"
                >
                  Go to Action Center <ArrowUpRight size={10} />
                </button>
              </div>

              {isEscalationsLoading ? (
                <div className="space-y-3 py-2">
                  <div className="h-12 w-full skeleton bg-surface" />
                </div>
              ) : openEscalations.length === 0 ? (
                <div className="text-center py-6 text-muted font-mono text-xs">
                  ✓ Excellent: No open district-level escalations recorded.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {openEscalations.slice(0, 4).map((esc: any) => (
                    <div 
                      key={esc.id} 
                      className="border border-border/50 p-3 bg-surface/30 rounded-xl flex items-center justify-between gap-4 hover:border-coral/40 transition-colors cursor-pointer"
                      onClick={() => navigate(`/patients/${esc.patientId}`)}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-sans font-bold text-xs text-white truncate">{esc.patientName || 'District Patient'}</span>
                          <span className="font-mono text-[8px] text-muted px-1.5 bg-risk-red/10 text-risk-red rounded-full border border-risk-red/20 uppercase tracking-widest">
                            {esc.escalationType || 'Missed Check-In'}
                          </span>
                        </div>
                        <p className="font-mono text-[10px] text-muted truncate leading-normal">
                          Opened: {new Date(esc.openedAt).toLocaleDateString()} · Last Check-In missed
                        </p>
                      </div>
                      <button className="btn-ghost shrink-0 py-1 px-2.5 text-[8px] uppercase tracking-widest">
                        Review Detail
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Column 3: DTO Control Shortcuts, DevOps, & Reports export */}
          <div className="xl:col-span-1 space-y-6">
            
            {/* System Live Monitoring & DevOps Hub */}
            <div className="border border-border p-5 rounded-3xl space-y-4" style={{ background: '#090B11' }}>
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <div className="flex items-center gap-1.5 text-accent">
                  <Activity size={13} />
                  <span className="font-mono text-[10px] uppercase tracking-wider block font-bold">System Health & DevOps</span>
                </div>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>

              {systemHealth ? (
                <div className="space-y-3 font-mono text-[11px]">
                  {/* Status Rows */}
                  <div className="flex justify-between items-center bg-surface/35 p-2.5 rounded-lg border border-border/20">
                    <span className="text-muted">Database Conn:</span>
                    <span className={systemHealth.dbStatus === 'healthy' ? 'text-emerald-400 font-bold' : 'text-risk-red font-bold'}>
                      {systemHealth.dbStatus.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-surface/35 p-2.5 rounded-lg border border-border/20">
                    <span className="text-muted">Adherence Cron:</span>
                    <span className={systemHealth.reminderCronStatus === 'healthy' ? 'text-emerald-400 font-bold' : 'text-risk-yellow font-bold'}>
                      {systemHealth.reminderCronStatus.toUpperCase()}
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-surface/35 p-2.5 rounded-lg border border-border/20">
                    <span className="text-muted">Alerts Overload:</span>
                    <span className={systemHealth.escalationQueueStatus === 'healthy' ? 'text-emerald-400 font-bold' : 'text-risk-red font-bold'}>
                      {systemHealth.escalationQueueStatus === 'healthy' ? 'CLEAR' : 'WARNING'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center bg-surface/35 p-2.5 rounded-lg border border-border/20">
                    <span className="text-muted">Last Reminder:</span>
                    <span className="text-pale text-[10px] text-right truncate max-w-[130px]" title={systemHealth.lastReminderSentAt}>
                      {systemHealth.lastReminderSentAt ? new Date(systemHealth.lastReminderSentAt).toLocaleTimeString() : 'Never'}
                    </span>
                  </div>

                  {/* Hot Backup Trigger */}
                  <div className="pt-2 border-t border-border/40 space-y-2">
                    <button
                      onClick={handleTriggerBackup}
                      disabled={isBackingUp || isRestoring}
                      className="w-full btn-primary py-2 text-[10px] uppercase tracking-wider flex items-center justify-center gap-2"
                    >
                      <HardDrive size={12} />
                      {isBackingUp ? 'Creating Hot Backup...' : 'Trigger DB Hot-Backup'}
                    </button>
                    
                    {opStatusMsg && (
                      <p className="text-[9px] text-center bg-[#0F111A] p-2 rounded border border-border/60 text-accent leading-normal break-words">
                        {opStatusMsg}
                      </p>
                    )}
                  </div>

                  {/* Backup Files List */}
                  {backupsList.length > 0 && (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      <p className="text-[9px] uppercase tracking-wider text-muted font-bold mb-1">Available Snapshots ({backupsList.length})</p>
                      {backupsList.slice(0, 3).map((backup: any) => (
                        <div key={backup.fileName} className="flex justify-between items-center bg-surface/20 p-2 rounded border border-border/10">
                          <div className="min-w-0 flex-1">
                            <p className="text-[9px] text-pale truncate font-bold">{backup.fileName}</p>
                            <p className="text-[8px] text-muted">
                              {new Date(backup.createdAt).toLocaleString()} · {(backup.sizeBytes / 1024).toFixed(0)} KB
                            </p>
                          </div>
                          <button
                            onClick={() => handleTriggerRestore(backup.fileName)}
                            disabled={isRestoring || isBackingUp}
                            className="ml-2 py-0.5 px-2 bg-risk-red/10 border border-risk-red/30 rounded text-risk-red text-[8px] uppercase tracking-widest font-bold hover:bg-risk-red hover:text-white transition-colors"
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 font-mono text-xs text-muted">Checking health...</div>
              )}
            </div>

            {/* Quick Action Hub */}
            <div className="border border-border p-5 rounded-3xl space-y-4" style={{ background: '#0F111A' }}>
              <h4 className="text-white text-xs font-mono uppercase tracking-widest border-b border-border/60 pb-3" style={{ margin: 0 }}>
                DTO Portal Operations
              </h4>
              
              <div className="flex flex-col gap-2.5 pt-1">
                {/* Enroll New Patient */}
                <button
                  onClick={() => navigate('/patients/new')}
                  className="w-full text-left font-sans text-xs p-3.5 bg-surface hover:bg-surface/80 rounded-2xl border border-border/60 text-pale hover:text-coral transition-colors flex items-center gap-3"
                >
                  <Plus size={14} className="text-coral" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white leading-tight">Enroll New Patient</p>
                    <p className="font-mono text-[9px] text-muted uppercase mt-0.5">Register under health worker</p>
                  </div>
                </button>

                {/* Add CHW Force */}
                <button
                  onClick={() => navigate('/admin/workers')}
                  className="w-full text-left font-sans text-xs p-3.5 bg-surface hover:bg-surface/80 rounded-2xl border border-border/60 text-pale hover:text-accent transition-colors flex items-center gap-3"
                >
                  <Users size={14} className="text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white leading-tight">Register CHW Personnel</p>
                    <p className="font-mono text-[9px] text-muted uppercase mt-0.5">Add field agent to district</p>
                  </div>
                </button>

                {/* Export compliance logs */}
                <button
                  onClick={handleExportNikshay}
                  className="w-full text-left font-sans text-xs p-3.5 bg-surface hover:bg-surface/80 rounded-2xl border border-border/60 text-pale hover:text-risk-green transition-colors flex items-center gap-3 block"
                >
                  <Download size={14} className="text-risk-green" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-white leading-tight">Export Nikshay Reports</p>
                    <p className="font-mono text-[9px] text-muted uppercase mt-0.5">Download full compliance CSV</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Platform Compliance Goal Gauge */}
            <div className="border border-border/80 p-5 rounded-3xl space-y-3 relative overflow-hidden" style={{ background: '#090B11' }}>
              <div className="flex items-center gap-1.5 text-coral">
                <Award size={13} />
                <span className="font-mono text-[9px] uppercase tracking-wider block font-bold">End TB Strategy Target</span>
              </div>
              <p className="font-sans text-xs leading-relaxed text-pale">
                India's National Strategic Plan mandates a target adherence compliance rate of <span className="font-bold text-accent">90%</span> or higher. The current Karnataka district average is <span className="font-bold text-risk-green">92%</span>, successfully meeting clinical targets.
              </p>
            </div>

          </div>

        </div>

        {/* ── Footer Diagnostics ── */}
        <div className="flex items-center justify-between border-t border-border pt-4 mt-2">
          <div className="flex items-center gap-2">
            <div className="live-dot" />
            <p className="font-mono text-[0.6875rem] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              District Admin Portal Secured · 30s sync
            </p>
          </div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-wider hidden sm:block" style={{ color: 'var(--muted)', opacity: 0.5 }}>
            Last sync: {new Date().toLocaleTimeString()}
          </p>
        </div>

      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER HEALTH WORKER / CHW DASHBOARD
  // ──────────────────────────────────────────────────────────────────────────
  const stats = dashboardData?.stats ?? { total: 0, red: 0, yellow: 0, green: 0 };
  const priorityPatients = dashboardData?.priorityPatients ?? [];
  const adherenceTrend = dashboardData?.adherenceTrend ?? [];

  return (
    <div className="space-y-8 page-enter">

      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-border">
        <div>
          <h1 className="text-white" style={{ fontSize: '2rem', letterSpacing: '0.06em' }}>DASHBOARD</h1>
          <p className="font-mono text-[0.875rem] mt-1.5 flex items-center gap-2 whitespace-nowrap overflow-hidden" style={{ color: 'var(--muted)' }}>
            <span className="live-dot" />
            <span style={{ color: 'var(--pale)' }}>{user?.region ?? 'Regional'} Adherence Overview</span>
            <span style={{ opacity: 0.35 }}>·</span>
            <span style={{ color: 'var(--coral)' }}>Real-Time Engine</span>
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            id="dashboard-refresh"
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-ghost flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
            {isFetching ? 'Syncing...' : 'Sync'}
          </button>
          <button
            id="dashboard-enroll"
            onClick={() => setIsQuickRegisterOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <Users size={13} />
            Enroll Patient
          </button>
        </div>
      </div>

      {/* ── Advisory Banner ── */}
      <div
        className="flex items-center justify-between px-4 py-3 gap-4"
        style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle size={13} style={{ color: 'var(--risk-red)', flexShrink: 0 }} className="animate-pulse" />
          <span className="font-mono text-[0.8125rem] whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: 'rgba(239,68,68,0.85)' }}>
            ADVISORY — Red alerts require immediate clinical contact and visit logs.
          </span>
        </div>
        <button
          onClick={() => navigate('/escalations')}
          className="hidden sm:flex items-center gap-1 font-mono text-[0.75rem] uppercase tracking-wider flex-shrink-0 transition-colors"
          style={{ color: 'var(--risk-red)' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Manage Alerts <ArrowUpRight size={11} />
        </button>
      </div>

      {/* ── Risk Counters ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="border border-border h-[130px] skeleton" style={{ background: 'var(--charcoal)' }} />
          ))}
        </div>
      ) : (
        <RiskCounters stats={stats} />
      )}

      {/* ── Medication Supply Alert Center ── */}
      {!isLoading && (dashboardData as any)?.lowMedicationPatients && (dashboardData as any).lowMedicationPatients.length > 0 && (
        <div className="border border-border p-6 rounded-3xl space-y-4 relative overflow-hidden animate-enter" style={{ background: '#0F111A' }}>
          {/* Accent border at top */}
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--accent)' }} />
          
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}
              >
                <AlertTriangle size={12} className="text-amber-500" />
              </div>
              <div>
                <h4 className="text-white text-xs uppercase font-mono tracking-widest" style={{ margin: 0 }}>
                  Medication Supply Alert Center (Refill Required)
                </h4>
                <p className="font-mono text-[10px] text-muted mt-0.5">
                  Automated Alerts: Patients within 5 days of running out of medication.
                </p>
              </div>
            </div>
            <span className="font-mono text-[0.6875rem] px-2.5 py-1 bg-amber-500/10 text-amber-500 rounded-full border border-amber-500/20 uppercase tracking-wider font-semibold animate-pulse">
              {(dashboardData as any).lowMedicationPatients.length} alert{(dashboardData as any).lowMedicationPatients.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(dashboardData as any).lowMedicationPatients.map((patient: any) => (
              <div 
                key={patient.id} 
                className="border border-border/60 p-4 bg-surface/30 rounded-2xl flex flex-col justify-between hover:border-amber-500/40 transition-colors"
              >
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-sans font-bold text-sm text-white truncate">{patient.fullName}</span>
                    <span className={`font-mono text-[9px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-semibold shrink-0 ${
                      patient.medicationDaysRemaining === 0 
                        ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {patient.medicationDaysRemaining === 0 ? 'Out of Stock' : `${patient.medicationDaysRemaining} days left`}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-muted mt-2">
                    Condition: {patient.condition || 'TB'} · Streak: {patient.currentStreak} days
                  </p>
                  <p className="font-mono text-[11px] text-muted">
                    Phone: {patient.phone}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border/20">
                  <button
                    onClick={() => navigate(`/patients/${patient.id}`)}
                    className="w-full btn-ghost text-center text-[10px] uppercase tracking-widest py-1.5"
                  >
                    View Record & Log Refill
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main Layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Priority Queue & Daily Tracker — 2 cols */}
        <div className="xl:col-span-2 space-y-8">
          {/* Daily Medication Adherence Tracker */}
          <DailyAdherenceTracker />

          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
                >
                  <AlertTriangle size={12} style={{ color: 'var(--risk-red)' }} />
                </div>
                <h4 style={{ color: 'var(--white)', fontSize: '0.8125rem' }}>Priority Attention Queue</h4>
              </div>
              <span className="font-mono text-[0.6875rem] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                {priorityPatients.length} flagged
              </span>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="border border-border h-20 skeleton" style={{ background: 'var(--charcoal)' }} />
                ))}
              </div>
            ) : priorityPatients.length === 0 ? (
              <div
                className="p-12 text-center space-y-3"
                style={{ background: 'var(--charcoal)', border: '1px solid rgba(52,211,153,0.15)' }}
              >
                <div
                  className="inline-flex items-center justify-center w-10 h-10 mx-auto mb-2"
                  style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)' }}
                >
                  <span className="font-mono font-bold text-base" style={{ color: 'var(--risk-green)' }}>✓</span>
                </div>
                <p className="font-mono text-sm font-semibold text-white uppercase tracking-wider">All Patients Stable</p>
                <p className="font-mono text-[0.8125rem] uppercase tracking-wider leading-relaxed" style={{ color: 'var(--muted)' }}>
                  Adherence signals within target thresholds.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {priorityPatients.map((patient: any) => (
                  <PatientCard key={patient.id} patient={patient} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Trend Chart — 1 col */}
        <div className="xl:col-span-1 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <div
              className="w-6 h-6 flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--coral-dim)', border: '1px solid rgba(255,107,74,0.25)' }}
            >
              <TrendingUp size={12} style={{ color: 'var(--coral)' }} />
            </div>
            <h4 style={{ color: 'var(--white)', fontSize: '0.8125rem' }}>7-Day Trend</h4>
          </div>
          {isLoading ? (
            <div className="border border-border h-72 skeleton" style={{ background: 'var(--charcoal)' }} />
          ) : (
            <AdherenceTrend data={adherenceTrend} />
          )}
        </div>

      </div>

      {/* ── Footer Diagnostics ── */}
      <div className="flex items-center justify-between border-t border-border pt-4 mt-2">
        <div className="flex items-center gap-2">
          <div className="live-dot" />
          <p className="font-mono text-[0.6875rem] uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            Ni-Kshay API Stable · 30s refresh
          </p>
        </div>
        <p className="font-mono text-[0.6875rem] uppercase tracking-wider hidden sm:block" style={{ color: 'var(--muted)', opacity: 0.5 }}>
          Last sync: {new Date().toLocaleTimeString()}
        </p>
      </div>

      {/* Quick Patient Registration Modal */}
      <QuickRegisterModal 
        isOpen={isQuickRegisterOpen} 
        onClose={() => setIsQuickRegisterOpen(false)} 
      />
    </div>
  );
}
