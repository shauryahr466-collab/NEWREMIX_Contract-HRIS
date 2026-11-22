import React, { useEffect, useState } from 'react';
import { Shield, CheckCircle2, Mail, Lock, Loader2, Eye, EyeOff, KeyRound, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { setInMemorySession } from '../lib/authSession';
import { Button, Input } from '../components/ui';

type BootstrapStatus = {
  setupRequired: boolean;
  envOverrideActive: boolean;
  hasOwnerPassword: boolean;
  ownerHint?: string;
};

export function Login() {
  const { setIsOtpVerified, setUser, setIsAdmin, setCurrentUserProfile } = useAppStore();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/api/auth/bootstrap-status')
      .then(res => (res.ok ? res.json() : null))
      .then((data: BootstrapStatus | null) => {
        if (!mounted || !data) return;
        setBootstrapStatus(data);
        if (data.setupRequired) {
          setMode('setup');
        }
      })
      .catch(() => {
        // Ignore transient status fetch issues; user can still attempt login
      });
    return () => {
      mounted = false;
    };
  }, []);

  const completeSignIn = (userPayload: any, sessionToken: string) => {
    setInMemorySession(sessionToken, userPayload);
    const sessionUser = {
      uid: userPayload.id,
      email: userPayload.email,
      displayName: userPayload.username,
      role: userPayload.role
    };
    setCurrentUserProfile(userPayload);
    setIsAdmin(userPayload.role === 'Super Admin');
    setIsOtpVerified(true);
    setUser(sessionUser);
    toast.success(`Signed in as ${userPayload.username} (${userPayload.role})`);
    navigate('/', { replace: true });
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanId = identifier.trim();
    if (!cleanId || !password) {
      setErrorMsg('Enter your provisioned Work Email / Login ID and Password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: cleanId, password })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.success && data?.user && data?.sessionToken) {
        completeSignIn(data.user, data.sessionToken);
        return;
      }

      if (data?.setupRequired) {
        setBootstrapStatus(prev => ({
          setupRequired: true,
          envOverrideActive: Boolean(prev?.envOverrideActive),
          hasOwnerPassword: false,
          ownerHint: prev?.ownerHint
        }));
        setMode('setup');
        setConfirmPassword('');
      }

      const message = data?.error || 'Access Denied: Invalid credentials or unauthorized account.';
      setErrorMsg(message);
      toast.error(message);
    } catch {
      const message = 'Unable to reach authentication service. Verify server connectivity.';
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOwnerSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleanEmail = identifier.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMsg('Enter the company owner email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Owner password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/setup-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data?.success && data?.user && data?.sessionToken) {
        toast.success('Owner password configured and locked.');
        completeSignIn(data.user, data.sessionToken);
        return;
      }

      const message = data?.error || 'Owner setup failed.';
      setErrorMsg(message);
      toast.error(message);
    } catch {
      const message = 'Unable to reach server during owner setup.';
      setErrorMsg(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800">
        {/* Left Side: Enterprise Branding */}
        <div className="hidden md:flex flex-col justify-between p-10 lg:p-12 bg-slate-900 text-white border-r border-slate-800">
          <div className="space-y-8">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
                <Shield size={18} className="text-white" />
              </div>
              <div>
                <span className="text-sm font-bold tracking-tight uppercase block">Contractor HRIS</span>
                <span className="text-[11px] text-slate-400">Company Network Portal</span>
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white">
                Enterprise Workforce &amp; Biometric Attendance
              </h1>
              <p className="text-slate-300 text-sm leading-relaxed">
                Authorized company access only. Attendance logs, ZKTeco hardware sync, overtime approvals, and payroll run directly on your local server.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {[
                'Role-scoped department & section visibility',
                'Automated ZKTeco biometric punch sync',
                'Public holiday validation & ISO reporting',
                'Signed company network sessions'
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-2.5 text-sm text-slate-200">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>Provisioned Accounts Only</span>
            <span>SQLite Local Core</span>
          </div>
        </div>

        {/* Right Side: Sign In or First-Time Owner Setup */}
        <div className="p-8 md:p-10 lg:p-12 flex flex-col justify-center bg-white dark:bg-slate-900">
          <div className="max-w-sm mx-auto w-full space-y-6">
            <div className="space-y-1.5">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                {mode === 'setup' ? 'First-Time Owner Setup' : 'Sign In'}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                {mode === 'setup'
                  ? 'Set the permanent Super Admin password to lock system access.'
                  : 'Enter your provisioned Work Email or Login ID and Password.'}
              </p>
            </div>

            {bootstrapStatus?.setupRequired && (
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-2">
                <KeyRound size={15} className="shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <span className="font-semibold block">Owner Password Not Set Yet</span>
                  <span className="text-indigo-700 dark:text-indigo-300">
                    Claim owner access once ({bootstrapStatus.ownerHint || 'owner account'}). Setup locks automatically once saved.
                  </span>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {mode === 'setup' ? (
              <form onSubmit={handleOwnerSetupSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Owner Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type="email"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      className="pl-10 h-10"
                      placeholder="owner@company.com"
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Create Owner Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-10"
                      placeholder="Minimum 6 characters"
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="pl-10 h-10"
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" disabled={isLoading} className="w-full h-10 text-sm font-semibold">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Owner Password & Enter'}
                </Button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg(null);
                  }}
                  className="w-full text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors py-1"
                >
                  Already configured? Return to Sign In
                </button>
              </form>
            ) : (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Work Email or Login ID
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type="text"
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      className="pl-10 h-10"
                      placeholder="email@company.com or user ID"
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="pl-10 pr-10 h-10"
                      placeholder="Enter password"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" disabled={isLoading} className="w-full h-10 text-sm font-semibold">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
                </Button>

                {bootstrapStatus?.setupRequired && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('setup');
                      setErrorMsg(null);
                    }}
                    className="w-full text-xs font-medium text-primary hover:underline py-1"
                  >
                    First-time owner setup required? Set password now
                  </button>
                )}
              </form>
            )}

            <div className="pt-5 border-t border-slate-200 dark:border-slate-800 text-center space-y-1">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
                <Shield size={12} className="text-slate-400" />
                Restricted Company Portal
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Access is restricted to provisioned accounts. Unlisted users are denied. Contact your System Administrator for credentials.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


