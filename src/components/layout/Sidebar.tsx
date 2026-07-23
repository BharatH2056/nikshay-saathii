import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../hooks/useAuthStore';
import { LayoutDashboard, Users, AlertTriangle, Download, Settings, LogOut, Terminal, Activity, RefreshCw, Stethoscope } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

export default function Sidebar() {
  const { user, logout, setRole } = useAuthStore();
  const navigate = useNavigate();

  const navItems = [
    { to: '/dashboard',        Icon: LayoutDashboard, label: user?.role === 'admin' ? 'Executive' : 'Dashboard' },
    { to: '/doctor-dashboard', Icon: Stethoscope,     label: 'Doctor Portal' },
    { to: '/escalations',      Icon: AlertTriangle,   label: 'Escalations', hasAlert: true },
    ...(user?.role === 'admin' ? [{ to: '/admin/workers', Icon: Users, label: 'CHW Staff' }] : [{ to: '/patients', Icon: Users, label: 'My Patients' }]),
    { to: '/simulator',        Icon: Terminal,        label: 'Simulator' },
    { to: '/settings',         Icon: Settings,        label: 'Settings' },
  ];

  const { data: openEscalations = [] } = useQuery({
    queryKey: ['escalations', 'open'],
    queryFn: async () => {
      const response = await apiClient.get('/escalations?status=open');
      return response.data;
    },
    refetchInterval: 10000,
  });

  const activeCount = openEscalations.length;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className="fixed top-0 left-0 h-full w-[256px] flex flex-col z-20 hidden md:flex"
      style={{
        background: '#0E1016',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Coral top accent strip */}
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'var(--coral)' }} />

      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-border">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center"
            style={{ background: 'var(--coral-dim)', border: '1px solid rgba(255,107,74,0.3)' }}
          >
            <Activity size={14} style={{ color: 'var(--coral)' }} />
          </div>
          <div className="min-w-0">
            <p className="font-mono font-bold text-white tracking-[0.1em] text-sm uppercase leading-none">
              NIKSHAY SAATHI
            </p>
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] mt-0.5" style={{ color: 'var(--muted)' }}>
              TB Adherence Platform
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-0.5">
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] px-3 mb-3" style={{ color: 'var(--muted)' }}>
          Navigation
        </p>

        {navItems.map(({ to, Icon, label, hasAlert }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 px-3 py-3 font-mono text-[0.75rem] uppercase tracking-[0.08em] transition-all duration-200 ${
                isActive
                  ? 'text-white sidebar-glow'
                  : 'text-muted hover:text-pale hover:bg-white/[0.02]'
              }`
            }
            style={({ isActive }) => isActive ? {
              background: 'rgba(255,107,74,0.08)',
              paddingLeft: '16px',
            } : {}}
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={14}
                  className="flex-shrink-0 transition-colors"
                  style={{ color: isActive ? 'var(--coral)' : undefined }}
                />
                <span className="flex-1">{label}</span>

                {/* Escalation badge */}
                {hasAlert && activeCount > 0 && (
                  <span
                    className="flex-shrink-0 font-mono text-[0.6rem] font-bold px-1.5 py-px pulse-red-ring"
                    style={{ background: 'var(--risk-red)', color: '#fff' }}
                  >
                    {activeCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-border p-4 space-y-3">
        {/* User card */}
        <div
          className="flex items-center gap-3 p-2.5"
          style={{ background: 'var(--coral-dim)', border: '1px solid rgba(255,107,74,0.2)' }}
        >
          <div
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center font-mono font-bold text-sm"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--coral)' }}
          >
            {user?.fullName?.charAt(0) ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs font-semibold text-white truncate">{user?.fullName}</p>
            <p className="font-mono text-[0.6rem] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              {user?.role === 'admin' ? 'DTO Admin' : 'Field Worker'}
            </p>
          </div>
        </div>

        {/* Switch role */}
        <button
          onClick={() => setRole(user?.role === 'admin' ? 'hw' : 'admin')}
          className="w-full btn-ghost text-[0.6875rem] py-2 justify-center"
        >
          <RefreshCw size={11} />
          Switch to {user?.role === 'admin' ? 'Field Worker' : 'DTO Admin'}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 font-mono text-[0.6875rem] uppercase tracking-wider py-2 transition-colors"
          style={{ color: 'var(--muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--risk-red)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
        >
          <LogOut size={11} />
          Sign Out
        </button>

        <p className="font-mono text-[0.5rem] text-center uppercase tracking-widest" style={{ color: 'var(--muted)', opacity: 0.45 }}>
          IBM SkillsBuild 2026 · v1.0
        </p>
      </div>
    </aside>
  );
}
