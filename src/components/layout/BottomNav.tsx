import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, AlertTriangle, Terminal, Download } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../hooks/useAuthStore';

export default function BottomNav() {
  const { user } = useAuthStore();

  const navItems = user?.role === 'admin'
    ? [
        { to: '/dashboard',     Icon: LayoutDashboard, label: 'Home' },
        { to: '/escalations',   Icon: AlertTriangle,    label: 'Alerts', hasAlert: true },
        { to: '/admin/workers', Icon: Users,            label: 'CHWs' },
      ]
    : [
        { to: '/dashboard',   Icon: LayoutDashboard, label: 'Home' },
        { to: '/patients',    Icon: Users,            label: 'Patients' },
        { to: '/simulator',   Icon: Terminal,         label: 'Sim' },
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

  return (
    <nav
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 md:hidden glass-panel rounded-full px-6 py-3"
      style={{
        width: 'max-content',
        background: 'rgba(10, 10, 20, 0.75)',
        border: '1px solid var(--glass-border)',
      }}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-4 right-4 h-[1px]"
        style={{ background: 'linear-gradient(90deg, transparent 0%, var(--accent-cyan) 50%, transparent 100%)' }}
      />

      <div className="h-full flex justify-around items-center px-2">
        {navItems.map(({ to, Icon, label, hasAlert }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-1 min-w-[48px] py-1.5 px-2 transition-all duration-200 rounded-[2px] ${
                isActive ? 'text-accent' : 'text-muted hover:text-pale'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {/* Active background pill */}
                {isActive && (
                  <span className="absolute inset-0 bg-accent/[0.06] rounded-[2px]" />
                )}

                <span className="relative">
                  <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                  {/* Alert badge */}
                  {hasAlert && activeCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-blood text-white font-jetbrains text-[0.9rem] font-semibold min-w-[14px] h-[14px] flex items-center justify-center rounded-full px-0.5 pulse-red-ring">
                      {activeCount}
                    </span>
                  )}
                </span>

                <span className="font-jetbrains text-[0.9rem] uppercase tracking-wider relative">
                  {label}
                </span>

                {/* Active underline dot */}
                {isActive && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-0.5 bg-accent rounded-full" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
