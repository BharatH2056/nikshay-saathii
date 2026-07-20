import React, { useEffect } from 'react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../hooks/useAuthStore';

export default function Layout() {
  const location = useLocation();
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <div className="min-h-screen bg-dark text-pale flex">
      {/* Sidebar for Desktop */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 md:ml-[256px] pb-[80px] md:pb-8 min-w-0">
        {/* Page-level gradient accent */}
        <div
          className="pointer-events-none fixed top-0 right-0 w-[40vw] h-[40vh] opacity-[0.04] blur-[80px]"
          style={{ background: 'radial-gradient(ellipse, var(--blood) 0%, transparent 70%)' }}
        />
        <div
          className="pointer-events-none fixed bottom-0 left-[256px] w-[30vw] h-[30vh] opacity-[0.03] blur-[60px]"
          style={{ background: 'radial-gradient(ellipse, var(--accent) 0%, transparent 70%)' }}
        />

        <div className="relative max-w-[1280px] mx-auto px-6 md:px-8 pt-6 md:pt-8">
          {/* Page transition wrapper — key on route for re-animation */}
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Bottom Nav for Mobile */}
      <BottomNav />
    </div>
  );
}
