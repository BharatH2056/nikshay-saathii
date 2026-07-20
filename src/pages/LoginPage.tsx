import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../hooks/useAuthStore';
import { Activity, Mail, Lock, ArrowRight, Shield } from 'lucide-react';

// Animated background grid cells
function GridCell({ delay }: { delay: number }) {
  return (
    <div
      className="border border-white/[0.025] transition-all duration-1000"
      style={{
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

export default function LoginPage() {
  const { login, token, loading, error } = useAuthStore();
  const [email, setEmail] = useState('healthworker@nikshay.in');
  const [password, setPassword] = useState('password123');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  if (token) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await login(email, password);
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center relative overflow-hidden px-4">

      {/* ── Animated radial gradient orbs ── */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full opacity-[0.06] blur-[100px] pointer-events-none"
        style={{ background: 'radial-gradient(circle, var(--blood) 0%, transparent 70%)' }}
      />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full opacity-[0.04] blur-[80px] pointer-events-none"
        style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }}
      />

      {/* ── Grid background ── */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(var(--border-bright) 1px, transparent 1px),
            linear-gradient(90deg, var(--border-bright) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* ── Large hero text ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <span
          className="font-bebas text-[18vw] text-white leading-none"
          style={{ opacity: 0.018, letterSpacing: '0.05em', WebkitTextFillColor: 'var(--white)' }}
        >
          NIKSHAY
        </span>
      </div>

      {/* ── Scanlines overlay ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 6px)',
          opacity: 0.4,
        }}
      />

      {/* ── Login card ── */}
      <div className={`relative z-10 w-full max-w-[420px] transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>

        {/* Card corner accents */}
        <div className="absolute -top-px -left-px w-16 h-16 pointer-events-none"
          style={{ borderTop: '1px solid var(--blood)', borderLeft: '1px solid var(--blood)', opacity: 0.6 }}
        />
        <div className="absolute -bottom-px -right-px w-16 h-16 pointer-events-none"
          style={{ borderBottom: '1px solid var(--accent)', borderRight: '1px solid var(--accent)', opacity: 0.4 }}
        />

        {/* Header */}
        <div className="text-center mb-8">
          {/* Logo mark */}
          <div className="inline-flex items-center justify-center w-14 h-14 mb-5 relative">
            <div className="absolute inset-0 bg-blood/[0.12] border border-blood/40 pulse-red-ring" />
            <Activity size={22} className="text-blood relative z-10" />
          </div>

          <h1
            className="font-bebas leading-none mb-1 text-5xl"
            style={{ letterSpacing: '0.04em' }}
          >
            Nikshay Saathi
          </h1>
          <div className="flex items-center justify-center gap-2 mt-2">
            <div className="h-px w-8" style={{ background: 'var(--border)' }} />
            <p className="font-jetbrains text-[0.95rem] text-muted uppercase tracking-[0.18em]">
              TB Adherence Monitoring · v1.0
            </p>
            <div className="h-px w-8" style={{ background: 'var(--border)' }} />
          </div>
        </div>

        {/* Form card */}
        <div
          className="relative overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(20,20,20,0.9) 0%, rgba(12,12,12,0.95) 100%)',
            border: '1px solid var(--border)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Card top accent bar */}
          <div className="absolute top-0 left-0 right-0 h-[1px]"
            style={{ background: 'linear-gradient(90deg, transparent, var(--accent) 40%, var(--blood) 70%, transparent)' }}
          />

          <div className="p-8">
            {/* Card header */}
            <div className="flex items-center gap-3 pb-5 mb-6 border-b border-border/60">
              <Shield size={13} className="text-accent" />
              <h4 className="text-accent text-[0.9rem] tracking-[0.12em]">Health Worker Login</h4>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>

              {/* Email */}
              <div className="input-group">
                <label htmlFor="login-email" className="field-label">
                  <Mail size={9} />
                  Email Address
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="worker@nikshay.in"
                  required
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div className="input-group">
                <label htmlFor="login-password" className="field-label">
                  <Lock size={9} />
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              {/* Error state */}
              {error && (
                <div
                  className="flex items-start gap-2.5 p-3 fade-up"
                  style={{
                    background: 'rgba(192,57,43,0.08)',
                    border: '1px solid rgba(192,57,43,0.3)',
                  }}
                >
                  <span className="text-blood text-4xl mt-0.5">⚠</span>
                  <p className="font-jetbrains text-[0.9rem] text-blood leading-relaxed">{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                id="login-submit"
                type="submit"
                disabled={isSubmitting || loading}
                className="btn-primary w-full justify-center py-3.5 text-[0.9rem] mt-2"
              >
                {isSubmitting || loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Access Dashboard</span>
                    <ArrowRight size={13} />
                  </>
                )}
              </button>
            </form>

            {/* Demo hint */}
            <div className="mt-6 pt-5 border-t border-border/50 text-center">
              <p className="font-jetbrains text-[0.95rem] text-muted uppercase tracking-[0.12em]">
                Demo credentials pre-filled above
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-center gap-2">
          <div className="live-dot" />
          <p className="font-jetbrains text-[0.9rem] text-muted/60 uppercase tracking-[0.12em]">
            IBM SkillsBuild Capstone 2026 · Zero-cost TB adherence layer
          </p>
        </div>
      </div>
    </div>
  );
}
