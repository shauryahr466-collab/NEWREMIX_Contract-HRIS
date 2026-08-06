import React, { useState } from 'react';
import { LogIn, Shield, CheckCircle2, ArrowRight, Github, Mail, Lock, Key, Loader2, Info } from 'lucide-react';
import { signInWithGoogle as googleSignInFn, emailSignIn } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useNavigate, Link } from 'react-router-dom';
import { useAppStore } from '../store';
import { Button, Input, Card, Badge } from '../components/ui';

type LoginStep = 'credentials' | 'otp';

const ADMIN_EMAILS = ['hr.sandiprajak466@gmail.com', 'shauryahr466@gmail.com'];

export function Login() {
  const { setIsOtpVerified } = useAppStore();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const isUserAdmin = (emailAddress: string) => {
    return ADMIN_EMAILS.some(adminEmail => emailAddress.toLowerCase() === adminEmail.toLowerCase());
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const result = await googleSignInFn();
      if (result) {
        if (isUserAdmin(result.user.email || '')) {
          setIsOtpVerified(true);
          toast.success('Admin access granted');
          return;
        }
        await sendOtp(result.user.email!);
      }
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/network-request-failed') {
        toast.error('Network error. Check connection and Firebase authorization.', {
          duration: 5000,
        });
      } else {
        toast.error(error.message || "Google Sign-In failed");
      }
      setIsLoading(false);
    }
  };

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await emailSignIn(email, password);
      if (isUserAdmin(email)) {
        setIsOtpVerified(true);
        toast.success('Admin access granted');
        return;
      }
      await sendOtp(email);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/operation-not-allowed') {
        toast.error('Email login not enabled in Firebase.');
      } else {
        toast.error(error.message || "Invalid credentials");
      }
      setIsLoading(false);
    }
  };

  const sendOtp = async (targetEmail: string) => {
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await response.json();
      if (response.ok) {
        setEmail(targetEmail);
        setStep('otp');
        toast.success('Verification code sent');
        if (data.debugOtp) {
          console.log(`[DEBUG] OTP: ${data.debugOtp}`);
          toast.info(`Debug OTP (Console): ${data.debugOtp}`);
        }
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      });
      if (response.ok) {
        setIsOtpVerified(true);
        toast.success('Access granted');
      } else {
        const data = await response.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast.error(error.message || 'Invalid code');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
        
        {/* Left Side: Professional Branding */}
        <div className="hidden md:flex flex-col justify-between p-12 bg-primary text-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-white rounded-full blur-[100px]" />
          </div>
          
          <div className="relative z-10 space-y-8">
            <div className="flex items-center gap-2">
              <Shield size={24} className="text-white" />
              <span className="text-lg font-bold tracking-tight uppercase">Workforce One</span>
            </div>
            
            <div className="space-y-4">
              <h2 className="text-3xl font-bold leading-tight tracking-tight">
                Enterprise Workforce <br /> Management.
              </h2>
              <p className="text-primary-foreground/80 text-base leading-relaxed">
                Streamline operations with precision attendance tracking and automated workforce insights.
              </p>
            </div>

            <div className="space-y-4 pt-4">
              {[
                "Real-time attendance processing",
                "Automated overtime validation",
                "Shift management & visualization",
                "Advanced audit trails"
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3 text-sm font-medium">
                  <CheckCircle2 size={16} className="text-primary-foreground/60" />
                  {feature}
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 pt-8 border-t border-white/10 flex items-center justify-between">
             <div className="flex -space-x-2">
               {[1,2,3,4].map(i => (
                 <div key={i} className="w-8 h-8 rounded-full border-2 border-primary bg-slate-200 overflow-hidden">
                   <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=user${i}`} alt="user" />
                 </div>
               ))}
             </div>
             <p className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground/60">Trusted Infrastructure</p>
          </div>
        </div>

        {/* Right Side: Auth Forms */}
        <div className="p-8 md:p-12 flex flex-col justify-center bg-white dark:bg-slate-900">
          <AnimatePresence mode="wait">
            {step === 'credentials' ? (
              <motion.div 
                key="credentials"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-sm mx-auto w-full space-y-8"
              >
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Sign In</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Access your enterprise portal</p>
                </div>

                <form onSubmit={handleCredentialsLogin} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Work Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input 
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 h-11"
                        placeholder="john.doe@company.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Password</label>
                      <button type="button" className="text-[10px] font-bold text-primary hover:underline uppercase">Forgot?</button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input 
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 h-11"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                  </div>

                  <Button 
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-11 text-sm font-bold shadow-lg shadow-primary/10"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}
                  </Button>
                </form>

                <div className="relative flex items-center py-2">
                  <div className="flex-grow border-t border-slate-100 dark:border-slate-800"></div>
                  <span className="flex-shrink mx-4 text-[10px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest">Enterprise Access</span>
                  <div className="flex-grow border-t border-slate-100 dark:border-slate-800"></div>
                </div>

                <Button 
                  variant="outline"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full h-11 gap-3 dark:bg-slate-800/50"
                >
                  <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
                  Continue with Google
                </Button>

                <div className="text-center pt-2">
                  <p className="text-xs font-medium text-slate-500">
                    No account? <Link to="/signup" className="text-primary font-bold hover:underline">Register your organization</Link>
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="otp"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-sm mx-auto w-full space-y-8"
              >
                <div className="space-y-4 text-center">
                  <div className="w-12 h-12 bg-primary/5 rounded-xl flex items-center justify-center mx-auto">
                    <Key className="w-6 h-6 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Verify Account</h3>
                    <p className="text-slate-500 text-sm font-medium">Enter the security code sent to <br /><span className="text-slate-900 dark:text-white font-bold">{email}</span></p>
                  </div>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center block mb-4">6-Digit Verification Code</label>
                    <input 
                      type="text"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      className="w-full px-4 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl text-2xl font-bold text-center tracking-[0.4em] focus:ring-2 focus:ring-primary outline-none transition-all dark:text-white"
                      placeholder="000000"
                      required
                    />
                  </div>

                  <Button 
                    type="submit"
                    disabled={isLoading || otp.length !== 6}
                    className="w-full h-11 text-sm font-bold"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify Access'}
                  </Button>

                  <Button 
                    type="button"
                    variant="ghost"
                    onClick={() => setStep('credentials')}
                    className="w-full text-xs font-bold text-slate-400"
                  >
                    Return to login
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pt-8 mt-12 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex items-center gap-1.5">
                <Shield size={10} className="text-primary" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em]">Restricted Access Area</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 w-full">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1 text-center">Authorized Administrators</p>
                <p className="text-[9px] text-primary font-bold break-all">
                  {ADMIN_EMAILS.join(' • ')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

