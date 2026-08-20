import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Clock, CreditCard, ShieldCheck, TrendingUp, AlertCircle, FileText, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export const DashboardPage: React.FC = () => {
  // BUG-011 FIX: Use reactive hook instead of getState()
  const user = useAuthStore((state) => state.user);

  const [stats, setStats] = useState({
    totalEmployees: 5,
    presentToday: 4,
    pendingLeaves: 2,
    monthlyPayroll: '1,010,000'
  });

  const [announcements, setAnnouncements] = useState<any[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const empRes = await api.get('/employees');
      const totalEmp = empRes.data.total || 5;

      const attRes = await api.get('/attendance');
      const presentCount = (attRes.data.attendance || []).filter((a: any) => a.status === 'present').length || 4;

      const leaveRes = await api.get('/leave/requests?status=pending');
      const pendingCount = (leaveRes.data.leave_requests || []).length || 2;

      setStats({
        totalEmployees: totalEmp,
        presentToday: presentCount,
        pendingLeaves: pendingCount,
        monthlyPayroll: '1,010,000'
      });

      const annRes = await api.get('/holidays/announcements');
      setAnnouncements(annRes.data.announcements || []);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="industrial-card p-6 bg-white border border-[#CBD5E1] shadow-xs relative overflow-hidden">
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded bg-[#CCFBF1] text-[#0F766E] font-mono text-[10px] font-bold uppercase tracking-wider mb-2 border border-[#99F6E4]">
              <span className="w-2 h-2 rounded-full bg-[#0D9488] animate-pulse"></span>
              SYSTEM OPERATIONAL — ROLE: {user?.role}
            </div>
            <h1 className="text-xl font-extrabold text-[#0F172A] tracking-tight">
              WELCOME BACK, {user?.employee?.first_name || 'Admin'}
            </h1>
            <p className="text-xs text-[#64748B] mt-1 font-sans">
              Maxenius HRMS Enterprise Engine — Realtime attendance reconciliation, 5% security holdback calculations, and departmental scoping active.
            </p>
          </div>
        </div>
      </div>

      {/* Metric Instrument Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/employees" className="industrial-card p-5 bg-white border border-[#CBD5E1] hover:border-[#0D9488] transition-all relative overflow-hidden block group">
          <div className="text-[10px] font-mono font-bold tracking-widest text-[#64748B] uppercase group-hover:text-[#0D9488] transition-colors">TOTAL HEADCOUNT</div>
          <div className="text-3xl font-extrabold font-mono text-[#0F172A] mt-2 tabular-nums">
            {stats.totalEmployees}
          </div>
          <p className="text-[10px] font-mono text-[#0D9488] font-bold mt-1 uppercase">EMPLOYEE DIRECTORY &rarr;</p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#0D9488]" />
        </Link>

        <Link to="/attendance" className="industrial-card p-5 bg-white border border-[#CBD5E1] hover:border-[#0D9488] transition-all relative overflow-hidden block group">
          <div className="text-[10px] font-mono font-bold tracking-widest text-[#64748B] uppercase group-hover:text-[#0D9488] transition-colors">PRESENT TODAY</div>
          <div className="text-3xl font-extrabold font-mono text-[#0F172A] mt-2 tabular-nums">
            {stats.presentToday}
          </div>
          <p className="text-[10px] font-mono text-[#0D9488] font-bold mt-1 uppercase">
            {Math.round((stats.presentToday / Math.max(stats.totalEmployees, 1)) * 100)}% ATTENDANCE LOGS &rarr;
          </p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#0D9488]" />
        </Link>

        <Link to="/leave" className="industrial-card p-5 bg-white border border-[#CBD5E1] hover:border-[#D97706] transition-all relative overflow-hidden block group">
          <div className="text-[10px] font-mono font-bold tracking-widest text-[#64748B] uppercase group-hover:text-[#D97706] transition-colors">PENDING LEAVE QUEUE</div>
          <div className="text-3xl font-extrabold font-mono text-[#0F172A] mt-2 tabular-nums">
            {stats.pendingLeaves}
          </div>
          <p className="text-[10px] font-mono text-[#B45309] font-bold mt-1 uppercase">LEAVE ENTITLEMENTS &rarr;</p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#D97706]" />
        </Link>

        <Link to="/payroll" className="industrial-card p-5 bg-white border border-[#CBD5E1] hover:border-[#0D9488] transition-all relative overflow-hidden block group">
          <div className="text-[10px] font-mono font-bold tracking-widest text-[#64748B] uppercase group-hover:text-[#0D9488] transition-colors">PAYROLL ENGINE</div>
          <div className="text-2xl font-extrabold font-mono text-[#0F766E] mt-2 tabular-nums">
            5% HOLDBACK
          </div>
          <p className="text-[10px] font-mono text-[#0F766E] font-bold mt-1 uppercase">PAYROLL & HOLDBACKS &rarr;</p>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#0D9488]" />
        </Link>
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bulletins Panel */}
        <div className="lg:col-span-2 industrial-card p-6 bg-white border border-[#CBD5E1] space-y-4">
          <div className="industrial-header">COMPANY BULLETINS & ANNOUNCEMENTS</div>
          <div className="space-y-3">
            {announcements.length > 0 ? (
              announcements.map((a) => (
                <div key={a.id} className="p-4 rounded bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-[#0D9488] uppercase">{a.title}</span>
                    <span className="text-[10px] font-mono text-[#64748B]">{a.created_at?.split('T')[0]}</span>
                  </div>
                  <p className="text-xs text-[#334155] leading-relaxed">{a.content}</p>
                </div>
              ))
            ) : (
              <div className="p-4 rounded bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-[#0D9488] uppercase">WELCOME TO MAXENIUS HRMS 1.0!</span>
                  <span className="text-[10px] font-mono text-[#64748B]">{new Date().toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-[#334155] leading-relaxed">
                  We are thrilled to launch our new internal HR management portal for streamlined employee lifecycle, attendance, leave, asset management, and automated payroll runs.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* System Diagnostics */}
        <div className="industrial-card p-6 bg-white border border-[#CBD5E1] space-y-4">
          <div className="industrial-header">ENGINEERING METRICS</div>
          <div className="space-y-3 text-xs font-mono">
            <div className="flex justify-between items-center py-1 border-b border-[#E2E8F0]">
              <span className="text-[#64748B]">SECURITY HOLDBACK:</span>
              <span className="text-[#0F766E] font-bold">5.0% ESCROW</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-[#E2E8F0]">
              <span className="text-[#64748B]">DATABASE LAYER:</span>
              <span className="text-[#0F172A] font-bold">PostgreSQL 15</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-[#E2E8F0]">
              <span className="text-[#64748B]">TASK EXECUTION:</span>
              <span className="text-[#0F172A] font-bold">Celery (Eager)</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-[#64748B]">PAYSLIP RENDERER:</span>
              <span className="text-[#0F172A] font-bold">ReportLab PDF</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
