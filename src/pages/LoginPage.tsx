import React, { useState } from 'react';
import { Database, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  clearRuntimeSupabaseConfig,
  getSupabaseConfig,
  saveRuntimeSupabaseConfig,
} from '../lib/supabase';
import { api } from '../services/api';
import { Modal } from '../components/ui/Modal';

export function LoginPage() {
  const { login } = useAuth();
  const { notify } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Password reset state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetMsg, setResetMsg] = useState('');

  // Supabase connection modal
  const currentSb = getSupabaseConfig();
  const [sbOpen, setSbOpen] = useState(false);
  const [sbUrl, setSbUrl] = useState(currentSb.url);
  const [sbKey, setSbKey] = useState(currentSb.anonKey);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      notify('success', 'Signed in successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMsg('');
    try {
      const res = await api.resetPassword(resetEmail, resetPassword || undefined);
      setResetMsg(res.message);
      notify('info', res.message);
    } catch (err: unknown) {
      setResetMsg(err instanceof Error ? err.message : 'Unable to process reset request.');
    }
  };

  const handleSaveSupabase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sbUrl.trim() || !sbKey.trim()) {
      clearRuntimeSupabaseConfig();
      notify('info', 'Cleared runtime Supabase configuration.');
    } else {
      saveRuntimeSupabaseConfig(sbUrl, sbKey);
      notify('success', 'Connected to Supabase project. Reloading...');
    }
    setSbOpen(false);
    window.location.reload();
  };

  const fillCredential = (em: string, pw: string) => {
    setEmail(em);
    setPassword(pw);
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Left Institutional Context Panel */}
        <div className="lg:col-span-5 bg-emerald-950 text-white p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <img
                src="/crest-default.jpg"
                alt="Ghanaian Basic School Crest"
                className="w-12 h-12 rounded-lg object-cover bg-white p-0.5"
              />
              <div>
                <h1 className="text-lg font-bold tracking-tight font-display">Akwaaba SchoolSuite</h1>
                <p className="text-xs text-emerald-200">Ghanaian Basic School Administration</p>
              </div>
            </div>

            <h2 className="mt-8 text-2xl font-bold leading-snug font-display" style={{ textWrap: 'balance' }}>
              Unified academic, staff, and assessment management for Basic 1–9.
            </h2>
            <p className="mt-3 text-sm text-emerald-100/85 leading-relaxed">
              Built for multi-school tenancy with GES teacher records, SBA &amp; examination grading, daily attendance,
              and printable terminal report cards.
            </p>
          </div>

          {currentSb.source === 'none' ? (
            <div className="mt-8 pt-6 border-t border-emerald-800/60 space-y-2 text-xs text-emerald-200">
              <p className="font-semibold text-white">Default Local Accounts (Quick Fill)</p>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => fillCredential('superadmin@akwaabasms.gh', 'SMD10011')}
                  className="w-full text-left px-3 py-2 rounded-lg bg-emerald-900/60 hover:bg-emerald-900 transition-colors"
                >
                  <span className="font-medium text-white block">Super Administrator</span>
                  <span className="font-mono text-[11px] text-emerald-200">superadmin@akwaabasms.gh</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillCredential('head@accraridgebasic.edu.gh', 'School@2026')}
                  className="w-full text-left px-3 py-2 rounded-lg bg-emerald-900/60 hover:bg-emerald-900 transition-colors"
                >
                  <span className="font-medium text-white block">School Administrator (Headteacher)</span>
                  <span className="font-mono text-[11px] text-emerald-200">head@accraridgebasic.edu.gh</span>
                </button>
                <button
                  type="button"
                  onClick={() => fillCredential('kofi.owusu@accraridgebasic.edu.gh', 'Teacher@2026')}
                  className="w-full text-left px-3 py-2 rounded-lg bg-emerald-900/60 hover:bg-emerald-900 transition-colors"
                >
                  <span className="font-medium text-white block">Basic 3 Class Teacher</span>
                  <span className="font-mono text-[11px] text-emerald-200">kofi.owusu@accraridgebasic.edu.gh</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-8 pt-6 border-t border-emerald-800/60 space-y-2.5 text-xs text-emerald-100">
              <p className="font-semibold text-white">Supabase Authentication Active</p>
              <p className="leading-relaxed text-emerald-200">
                Sign in with the email and password registered in your Supabase project under{' '}
                <span className="font-medium text-white">Authentication → Users</span>.
              </p>
              <p className="font-mono text-[11px] text-emerald-300 break-all">{currentSb.url}</p>
            </div>
          )}
        </div>

        {/* Right Sign-in Form */}
        <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-center">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 font-display">Sign in to your school portal</h2>
              <p className="text-sm text-slate-500 mt-1">
                {currentSb.source !== 'none'
                  ? 'Connected to Supabase PostgreSQL & Auth'
                  : 'Running with local relational database'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSbOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Supabase</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
            )}

            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@school.edu.gh"
                  className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800 focus:border-emerald-800"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email);
                    setResetOpen(true);
                  }}
                  className="text-xs font-medium text-emerald-900 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-800 focus:border-emerald-800"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-emerald-950 rounded-lg hover:bg-emerald-900 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>

      {/* Password Reset Modal */}
      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset Account Password"
        subtitle="Enter your registered school email to reset your password."
        maxWidth="md"
      >
        <form onSubmit={handleReset} className="space-y-4">
          {resetMsg && <div className="p-3 rounded-lg bg-slate-100 text-sm text-slate-800">{resetMsg}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              required
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          {currentSb.source === 'none' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Password (min. 6 characters)</label>
              <input
                type="password"
                minLength={6}
                required
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setResetOpen(false)}
              className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-700"
            >
              Close
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-emerald-950 text-white rounded-lg hover:bg-emerald-900"
            >
              Reset Password
            </button>
          </div>
        </form>
      </Modal>

      {/* Supabase Connection Configuration Modal */}
      <Modal
        open={sbOpen}
        onClose={() => setSbOpen(false)}
        title="Connect Supabase Project"
        subtitle="Provide your public Supabase URL and Anon Key (or configure VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in Vercel)."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveSupabase} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Supabase Project URL</label>
            <input
              type="url"
              value={sbUrl}
              onChange={(e) => setSbUrl(e.target.value)}
              placeholder="https://xyzcompany.supabase.co"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Supabase Public Anon Key</label>
            <textarea
              rows={3}
              value={sbKey}
              onChange={(e) => setSbKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <p className="text-xs text-slate-500">
            Leave both fields blank to revert to the built-in local relational SQLite database. Never enter a
            service-role key in browser configuration.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSbOpen(false)}
              className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-emerald-950 text-white rounded-lg hover:bg-emerald-900"
            >
              Save Connection
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
