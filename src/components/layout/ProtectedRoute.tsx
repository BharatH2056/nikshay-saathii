import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../hooks/useAuthStore';
import { useEffect } from 'react';
import React from 'react';

export default function ProtectedRoute() {
  const { token, checkAuth, loading } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-dark text-pale font-mono text-4xl tracking-widest">
        LOADING NIKSHAY SAATHI SYSTEM...
      </div>
    );
  }

  return <Outlet />;
}
