import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, ArrowRight, ShieldAlert, KeyRound, ShieldCheck, ArrowLeft, Eye, EyeOff, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);

  const [email, setEmail] = useState('admin@maxenius.com');
  const [password, setPassword] = useState('Admin@123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 2FA Step State
  const [step2FA, setStep2FA] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [timer, setTimer] = useState(300); // 5-minute challenge timer

  useEffect(() => {
    let interval: any = null;
    if (step2FA && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else if (timer === 0) {
      setError('2FA challenge token expired. Please enter your email and password again.');
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [step2FA, timer]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { email, password });
      
      // Step 2FA Guard Check
      if (res.data.requires_2fa || res.data.requires2FA) {
        setStep2FA(true);
        setTempToken(res.data.temp_token || res.data.tempToken);
        setTotpCode('');
        setTimer(300);
        return;
      }

      const { access_token, user } = res.data;
      setUser(user, access_token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpCode || totpCode.trim().length < 6) {
      setError('Please enter a valid 6-digit TOTP code or 8-character backup recovery code.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/auth/2fa/verify-login', {
        temp_token: tempToken,
        code: totpCode.trim().toUpperCase()
      });

      const { access_token, user } = res.data;
      setUser(user, access_token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || '2FA verification failed. Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] blueprint-grid flex items-center justify-center p-4 relative overflow-hidden text-[#0F172A] font-sans">
      <div className="w-full max-w-md industrial-card p-8 relative z-10 border border-[#CBD5E1] bg-white shadow-xl rounded-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-[#0D9488] rounded mx-auto mb-3 flex items-center justify-center text-white font-black text-xl shadow-md font-mono">
            M
          </div>
          <h1 className="text-lg font-black text-[#0F172A] tracking-widest uppercase font-mono">MAXENIUS HRMS</h1>
          <p className="text-[10px] font-mono text-[#0D9488] font-bold tracking-wider uppercase mt-1">
            {step2FA ? 'TWO-FACTOR VERIFICATION REQUIRED' : 'ENTERPRISE SYSTEM ACCESS'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {!step2FA ? (
          /* Step 1 Form: Email + Password */
          <form id="login-form" onSubmit={handleLogin} className="space-y-4 font-mono text-xs">
            <div>
              <label className="block text-[11px] font-bold text-[#334155] uppercase tracking-wider mb-1">WORK EMAIL</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#64748B] absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@maxenius.com"
                  className="w-full py-2.5 pl-9 pr-4 text-xs industrial-input bg-white border border-[#CBD5E1]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#334155] uppercase tracking-wider mb-1">SYSTEM PASSWORD</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#64748B] absolute left-3 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full py-2.5 pl-9 pr-10 text-xs industrial-input bg-white border border-[#CBD5E1]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-[#64748B] hover:text-[#0F172A] p-0.5 transition-colors cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between font-mono text-[11px] pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-[#475569] hover:text-[#0F172A]">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-[#CBD5E1] text-[#0D9488] focus:ring-[#0D9488]"
                />
                <span>REMEMBER ME</span>
              </label>
              <button
                type="button"
                onClick={() => alert('Please contact your HR Administrator or IT Helpdesk to reset your password.')}
                className="text-[#0D9488] hover:text-[#0F766E] font-bold cursor-pointer hover:underline"
              >
                FORGOT PASSWORD?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded bg-[#0D9488] text-white font-bold text-xs hover:bg-[#0F766E] transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 uppercase tracking-wider cursor-pointer"
            >
              {loading ? 'AUTHENTICATING...' : 'AUTHENTICATE SESSION'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          /* Step 2 Form: TOTP / Recovery Code */
          <form onSubmit={handleVerify2FASubmit} className="space-y-4 font-mono text-xs">
            <div className="p-3.5 bg-[#F0FDFA] border border-[#99F6E4] rounded-lg text-center space-y-1">
              <ShieldCheck className="w-6 h-6 text-[#0D9488] mx-auto" />
              <div className="font-bold text-[#0F766E] text-xs uppercase tracking-wider">ENTER 2FA AUTHENTICATOR CODE</div>
              <div className="text-[10px] text-[#134E4A] font-sans">
                Open Google Authenticator or Authy on your phone to get your 6-digit security PIN.
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-[#64748B] bg-[#F8FAFC] p-2 rounded border border-[#E2E8F0]">
              <span>CHALLENGE EXPIRES IN:</span>
              <span className="font-extrabold text-[#D97706] bg-[#FEF3C7] px-2 py-0.5 rounded border border-[#FDE68A] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-bold text-[#334155] uppercase tracking-wider">
                  {useBackupCode ? 'BACKUP RECOVERY CODE (8-CHAR)' : '6-DIGIT TOTP AUTHENTICATOR PIN'}
                </label>
                <button
                  type="button"
                  onClick={() => { setUseBackupCode(!useBackupCode); setTotpCode(''); }}
                  className="text-[10px] text-[#0D9488] font-bold hover:underline cursor-pointer"
                >
                  {useBackupCode ? 'Use 6-digit TOTP' : 'Use Backup Recovery Code'}
                </button>
              </div>

              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#64748B] absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={useBackupCode ? 8 : 6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.toUpperCase())}
                  placeholder={useBackupCode ? 'e.g. A7X9K2M4' : 'e.g. 123456'}
                  className="w-full py-2.5 pl-9 pr-4 text-base industrial-input bg-white border border-[#CBD5E1] tracking-widest font-mono font-extrabold text-center uppercase"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || timer === 0}
              className="w-full py-3 px-4 rounded bg-[#0D9488] text-white font-bold text-xs hover:bg-[#0F766E] transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 uppercase tracking-wider cursor-pointer"
            >
              {loading ? 'VERIFYING PIN...' : 'VERIFY 2FA CODE'}
              <ShieldCheck className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => { setStep2FA(false); setTempToken(null); setError(null); }}
              className="w-full py-2 text-[11px] text-[#64748B] hover:text-[#0F172A] flex items-center justify-center gap-1 cursor-pointer uppercase font-bold"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
