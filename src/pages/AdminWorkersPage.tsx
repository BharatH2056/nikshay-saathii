import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { 
  Users, 
  UserPlus, 
  Mail, 
  Phone, 
  MapPin, 
  ShieldAlert, 
  Check, 
  Copy, 
  ShieldCheck, 
  TrendingUp, 
  Search, 
  Plus, 
  X, 
  Eye, 
  EyeOff, 
  Loader2, 
  AlertCircle,
  Activity,
  Award
} from 'lucide-react';

interface HealthWorkerStats {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'hw' | 'admin';
  region: string;
  isActive: boolean;
  stats: {
    totalPatients: number;
    redAlerts: number;
    yellowAlerts: number;
    greenCount: number;
    avgAdherence: number;
  };
}

export default function AdminWorkersPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'hw' | 'admin'>('all');
  
  // Registration Drawer/Modal state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState('');
  const [role, setRole] = useState<'hw' | 'admin'>('hw');
  const [showPassword, setShowPassword] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch Health Workers List
  const { data: workers = [], isLoading, error, refetch } = useQuery<HealthWorkerStats[]>({
    queryKey: ['admin-workers'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/workers');
      return res.data;
    }
  });

  // Mutation to Register new health worker
  const registerMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiClient.post('/admin/workers', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-workers'] });
      // Reset form
      setFullName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setRegion('');
      setRole('hw');
      setIsRegisterOpen(false);
    },
    onError: (err: any) => {
      alert(err.response?.data?.error || 'Failed to register health worker');
    }
  });

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !phone || !password) {
      alert('Please fill out all required fields');
      return;
    }
    registerMutation.mutate({
      fullName,
      email,
      phone,
      password,
      region: region || null,
      role
    });
  };

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Filter Workers
  const filteredWorkers = workers.filter(worker => {
    const matchesSearch = 
      worker.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      worker.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      worker.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
      worker.phone.includes(searchQuery);
    
    const matchesRole = roleFilter === 'all' ? true : worker.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  // District Aggregated KPIs
  const totalCHWs = workers.filter(w => w.role === 'hw').length;
  const totalAdmins = workers.filter(w => w.role === 'admin').length;
  const activeAlertsAssigned = workers.reduce((sum, w) => sum + w.stats.redAlerts + w.stats.yellowAlerts, 0);
  const avgDistrictCompliance = workers.length > 0 
    ? Math.round(workers.reduce((sum, w) => sum + w.stats.avgAdherence, 0) / workers.length)
    : 100;

  return (
    <div className="space-y-8 page-enter">
      
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-border">
        <div>
          <h1 className="text-white" style={{ fontSize: '2rem', letterSpacing: '0.06em' }}>CHW DIRECTORY</h1>
          <p className="font-mono text-[0.875rem] mt-1.5 flex items-center gap-2" style={{ color: 'var(--muted)' }}>
            <span className="live-dot bg-accent" />
            <span style={{ color: 'var(--pale)' }}>District Staffing & Performance Monitoring</span>
          </p>
        </div>
        <div className="flex-shrink-0">
          <button
            onClick={() => setIsRegisterOpen(true)}
            className="btn-primary flex items-center gap-2"
          >
            <UserPlus size={14} />
            Register New Staff
          </button>
        </div>
      </div>

      {/* ── District Overview Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="border border-border/80 p-5 space-y-2 relative" style={{ background: '#0F111A' }}>
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--coral)' }} />
          <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted">Active CHW Force</p>
          <div className="flex items-baseline gap-2">
            <span className="font-bebas text-3xl text-white">{totalCHWs}</span>
            <span className="font-mono text-[0.65rem] text-risk-green uppercase tracking-wider">Field Staff</span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="border border-border/80 p-5 space-y-2 relative" style={{ background: '#0F111A' }}>
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--accent)' }} />
          <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted">Admin Directors</p>
          <div className="flex items-baseline gap-2">
            <span className="font-bebas text-3xl text-white">{totalAdmins}</span>
            <span className="font-mono text-[0.65rem] text-accent uppercase tracking-wider">DTO Officers</span>
          </div>
        </div>

        {/* Card 3 */}
        <div className="border border-border/80 p-5 space-y-2 relative" style={{ background: '#0F111A' }}>
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--risk-red)' }} />
          <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted">Assigned Alerts</p>
          <div className="flex items-baseline gap-2">
            <span className="font-bebas text-3xl text-white">{activeAlertsAssigned}</span>
            <span className="font-mono text-[0.65rem] text-risk-red uppercase tracking-wider">Actionable</span>
          </div>
        </div>

        {/* Card 4 */}
        <div className="border border-border/80 p-5 space-y-2 relative" style={{ background: '#0F111A' }}>
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: '#34D399' }} />
          <p className="font-mono text-[0.625rem] uppercase tracking-wider text-muted">District Adherence Avg</p>
          <div className="flex items-baseline gap-2">
            <span className="font-bebas text-3xl text-white">{avgDistrictCompliance}%</span>
            <span className="font-mono text-[0.65rem] text-risk-green uppercase tracking-wider">Target Met</span>
          </div>
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div className="bg-surface/40 border border-border p-4 rounded-2xl flex flex-col sm:flex-row gap-4 items-center justify-between">
        {/* Search input */}
        <div className="relative w-full sm:max-w-md">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search by name, email, region..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl pl-10 pr-4 py-2 font-mono text-[0.8rem] text-pale focus:outline-none focus:border-coral transition-colors"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto shrink-0">
          <button
            onClick={() => setRoleFilter('all')}
            className={`px-4 py-1.5 rounded-xl font-mono text-[0.7rem] uppercase tracking-wider transition-all ${
              roleFilter === 'all'
                ? 'bg-coral text-white'
                : 'bg-surface border border-border text-muted hover:text-pale'
            }`}
          >
            All Roles
          </button>
          <button
            onClick={() => setRoleFilter('hw')}
            className={`px-4 py-1.5 rounded-xl font-mono text-[0.7rem] uppercase tracking-wider transition-all ${
              roleFilter === 'hw'
                ? 'bg-coral text-white'
                : 'bg-surface border border-border text-muted hover:text-pale'
            }`}
          >
            CHW Field Workers
          </button>
          <button
            onClick={() => setRoleFilter('admin')}
            className={`px-4 py-1.5 rounded-xl font-mono text-[0.7rem] uppercase tracking-wider transition-all ${
              roleFilter === 'admin'
                ? 'bg-coral text-white'
                : 'bg-surface border border-border text-muted hover:text-pale'
            }`}
          >
            DTO Admins
          </button>
        </div>
      </div>

      {/* ── Staff Cards Grid ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border border-border/80 h-64 rounded-3xl skeleton" style={{ background: '#0F111A' }} />
          ))}
        </div>
      ) : filteredWorkers.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-border rounded-3xl space-y-4">
          <Users size={32} className="text-muted mx-auto" />
          <h3 className="font-mono text-sm uppercase tracking-wider text-pale">No Personnel Found</h3>
          <p className="font-mono text-xs text-muted">Try adjusting your filters or search terms.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkers.map((worker) => (
            <div 
              key={worker.id}
              className="border border-border/85 rounded-3xl p-5 space-y-4 relative overflow-hidden transition-all duration-300 hover:border-coral/40"
              style={{ background: '#0E1016' }}
            >
              {/* Top role tag */}
              <div className="flex justify-between items-start">
                <span className={`font-mono text-[8px] uppercase tracking-widest px-2 py-0.5 rounded border ${
                  worker.role === 'admin' 
                    ? 'bg-purple-950/40 text-purple-400 border-purple-800/40' 
                    : 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                }`}>
                  {worker.role === 'admin' ? 'DTO Admin' : 'CHW Field Worker'}
                </span>

                {/* Status indicator */}
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${worker.isActive ? 'bg-risk-green' : 'bg-muted'}`} />
                  <span className="font-mono text-[8px] uppercase tracking-wider text-muted">
                    {worker.isActive ? 'Active' : 'Suspended'}
                  </span>
                </div>
              </div>

              {/* Worker Profile */}
              <div>
                <h3 className="font-sans font-bold text-white text-base truncate" style={{ margin: 0 }}>
                  {worker.fullName}
                </h3>
                <div className="flex items-center gap-1.5 text-muted mt-1">
                  <MapPin size={11} className="text-coral" />
                  <span className="font-mono text-[10px] uppercase tracking-wider truncate">
                    {worker.region || 'National Division'}
                  </span>
                </div>
              </div>

              {/* Contacts */}
              <div className="bg-surface/50 border border-border/50 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-muted hover:text-pale transition-colors">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Mail size={11} className="shrink-0" />
                    <span className="font-mono text-[9px] truncate">{worker.email}</span>
                  </div>
                  <button 
                    onClick={() => handleCopyText(worker.email, worker.id + 'email')}
                    className="p-1 hover:bg-surface rounded shrink-0"
                  >
                    {copiedId === worker.id + 'email' ? <Check size={10} className="text-risk-green" /> : <Copy size={10} />}
                  </button>
                </div>
                <div className="flex items-center justify-between text-muted hover:text-pale transition-colors">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Phone size={11} className="shrink-0" />
                    <span className="font-mono text-[9px] truncate">{worker.phone}</span>
                  </div>
                  <button 
                    onClick={() => handleCopyText(worker.phone, worker.id + 'phone')}
                    className="p-1 hover:bg-surface rounded shrink-0"
                  >
                    {copiedId === worker.id + 'phone' ? <Check size={10} className="text-risk-green" /> : <Copy size={10} />}
                  </button>
                </div>
              </div>

              {/* Stats Breakdown */}
              <div className="grid grid-cols-2 gap-2 border-t border-border/50 pt-3">
                <div className="text-left space-y-0.5">
                  <span className="font-mono text-[8px] text-muted uppercase tracking-wider block">Patients</span>
                  <span className="font-bebas text-lg text-white">{worker.stats.totalPatients} Assigned</span>
                </div>
                <div className="text-right space-y-0.5">
                  <span className="font-mono text-[8px] text-muted uppercase tracking-wider block">Compl. Rate</span>
                  <span className={`font-bebas text-lg ${worker.stats.avgAdherence >= 85 ? 'text-risk-green' : 'text-risk-yellow'}`}>
                    {worker.stats.avgAdherence}%
                  </span>
                </div>
              </div>

              {/* Risk Levels Segment bar */}
              {worker.stats.totalPatients > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between font-mono text-[7.5px] text-muted uppercase tracking-wider">
                    <span>Patient Risk Breakdown</span>
                    <span className="text-risk-red font-bold">{worker.stats.redAlerts} red alerts</span>
                  </div>
                  <div className="h-1.5 w-full bg-surface rounded-full flex overflow-hidden">
                    <div 
                      className="bg-risk-red h-full transition-all duration-300" 
                      style={{ width: `${(worker.stats.redAlerts / worker.stats.totalPatients) * 100}%` }} 
                    />
                    <div 
                      className="bg-risk-yellow h-full transition-all duration-300" 
                      style={{ width: `${(worker.stats.yellowAlerts / worker.stats.totalPatients) * 100}%` }} 
                    />
                    <div 
                      className="bg-risk-green h-full transition-all duration-300" 
                      style={{ width: `${(worker.stats.greenCount / worker.stats.totalPatients) * 100}%` }} 
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add New Staff Slide-Over Drawer/Modal ── */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-all duration-300">
          <div 
            className="w-full max-w-[460px] bg-dark border-l border-border h-full p-8 flex flex-col space-y-6 relative overflow-y-auto"
            style={{ boxShadow: '-10px 0 30px -10px rgba(0,0,0,0.5)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <UserPlus size={18} className="text-coral" />
                <h2 className="font-sans font-bold text-lg text-white" style={{ margin: 0 }}>Register New Staff</h2>
              </div>
              <button 
                onClick={() => setIsRegisterOpen(false)}
                className="p-1.5 border border-border rounded-xl hover:bg-surface text-muted hover:text-pale transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleRegisterSubmit} className="space-y-5 flex-1">
              
              {/* Full Name */}
              <div className="input-group">
                <label className="field-label">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar CHW"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>

              {/* Email Address */}
              <div className="input-group">
                <label className="field-label">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="ramesh@asha.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {/* Mobile Phone */}
              <div className="input-group">
                <label className="field-label">Primary Mobile Phone *</label>
                <input
                  type="tel"
                  required
                  placeholder="+919876543212"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>

              {/* Password */}
              <div className="input-group relative">
                <label className="field-label">Access Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="password123"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-pale p-1"
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              {/* Staff Role */}
              <div className="input-group">
                <label className="field-label">Assigned Platform Role *</label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => setRole('hw')}
                    className={`py-2 px-3 border rounded-xl font-mono text-[10px] uppercase tracking-wider text-center transition-all ${
                      role === 'hw'
                        ? 'bg-coral border-coral text-white'
                        : 'bg-surface border-border text-muted hover:text-pale'
                    }`}
                  >
                    Field CHW
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('admin')}
                    className={`py-2 px-3 border rounded-xl font-mono text-[10px] uppercase tracking-wider text-center transition-all ${
                      role === 'admin'
                        ? 'bg-coral border-coral text-white'
                        : 'bg-surface border-border text-muted hover:text-pale'
                    }`}
                  >
                    DTO Admin
                  </button>
                </div>
              </div>

              {/* Geographic Region */}
              <div className="input-group">
                <label className="field-label">Geographic Region/Zone</label>
                <input
                  type="text"
                  placeholder="e.g. Rural Karnataka (Zone C)"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                />
              </div>

              {/* Actions Footer */}
              <div className="border-t border-border pt-6 mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="font-mono text-[10px] uppercase tracking-widest text-muted hover:text-pale py-2 px-4 rounded-xl border border-border hover:bg-surface transition-colors w-1/2 text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registerMutation.isPending}
                  className="btn-primary w-1/2 justify-center py-2 text-[0.8rem]"
                >
                  {registerMutation.isPending ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Add Personnel</span>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
