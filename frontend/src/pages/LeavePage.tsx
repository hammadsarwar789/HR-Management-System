import React, { useState, useEffect } from 'react';
import { CalendarDays, Plus, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export const LeavePage: React.FC = () => {
  // BUG-011 FIX: Use reactive hook instead of getState()
  const user = useAuthStore((state) => state.user);
  const isApprover = user?.role === 'Super Admin' || user?.role === 'HR Manager' || user?.role === 'Department Manager';

  const [balances, setBalances] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [showApplyModal, setShowApplyModal] = useState(false);
  // BUG-018 FIX: Track which request to reject and show styled modal instead of window.prompt()
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [formData, setFormData] = useState({
    leave_type_id: 1,
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    is_half_day: false,
    reason: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      if (user?.employee) {
        const balRes = await api.get(`/leave/balances/${user.employee.id}`);
        setBalances(balRes.data.balances || []);
      }
      const reqRes = await api.get('/leave/requests');
      setLeaveRequests(reqRes.data.leave_requests || []);
      const typeRes = await api.get('/leave/types');
      setLeaveTypes(typeRes.data.leave_types || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/leave/requests', formData);
      setShowApplyModal(false);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Error submitting leave request');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.put(`/leave/requests/${id}/approve`);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Error approving leave');
    }
  };

  const handleReject = async (id: string) => {
    setRejectTarget(id);
    setRejectReason('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 industrial-card p-6 bg-white border border-[#CBD5E1]">
        <div>
          <h1 className="text-lg font-bold text-[#0F172A] flex items-center gap-2 font-mono uppercase tracking-wider">
            <CalendarDays className="w-5 h-5 text-[#0D9488]" />
            LEAVE ENTITLEMENT METERS & REQUEST QUEUE
          </h1>
          <p className="text-xs text-[#64748B] mt-1 font-sans">
            Realtime balance deduction upon approval & multi-tier approval workflow
          </p>
        </div>

        <button
          onClick={() => setShowApplyModal(true)}
          className="py-2 px-4 rounded bg-[#0D9488] text-white font-mono font-bold text-xs hover:bg-[#0F766E] transition-all flex items-center gap-2 uppercase tracking-wider shadow-sm"
        >
          <Plus className="w-4 h-4" />
          SUBMIT LEAVE REQUEST
        </button>
      </div>

      {/* Segmented Entitlement Meters */}
      {balances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {balances.map((b) => (
            <div key={b.id} className="industrial-card p-5 space-y-3 bg-white border border-[#CBD5E1]">
              <div className="text-[10px] font-mono font-bold tracking-widest text-[#64748B] uppercase">
                {b.leave_type_name}
              </div>
              <div className="flex items-baseline gap-2 font-mono">
                <h3 className="text-3xl font-extrabold text-[#0D9488] tabular-nums">{b.remaining_days}</h3>
                <span className="text-xs text-[#64748B]">/ {b.allocated_days} DAYS REMAINING</span>
              </div>
              {/* Progress meter */}
              <div className="w-full h-1.5 bg-[#F1F5F9] rounded overflow-hidden border border-[#E2E8F0]">
                <div
                  className="h-full bg-[#0D9488] transition-all duration-300"
                  style={{ width: `${Math.min(100, (b.used_days / b.allocated_days) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] font-mono text-[#64748B]">USED THIS YEAR: {b.used_days} DAYS</p>
            </div>
          ))}
        </div>
      )}

      {/* Requests Table */}
      <div className="industrial-card overflow-hidden bg-white border border-[#CBD5E1]">
        <div className="p-4 border-b border-[#E2E8F0] font-mono font-bold text-xs text-[#0F172A] uppercase tracking-wider bg-[#F8FAFC]">
          LEAVE APPLICATION RECORDS
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#0F172A]">
            <thead className="bg-[#0F172A] text-white font-mono font-bold uppercase tracking-wider">
              <tr>
                <th className="p-4">APPLICANT</th>
                <th className="p-4">LEAVE TYPE</th>
                <th className="p-4">DATES</th>
                <th className="p-4">TOTAL DAYS</th>
                <th className="p-4">REASON</th>
                <th className="p-4">STATUS</th>
                {isApprover && <th className="p-4 text-right">ACTIONS</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {leaveRequests.length > 0 ? (
                leaveRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="p-4 font-medium text-[#0F172A]">{req.employee_name}</td>
                    <td className="p-4 font-mono text-[#0D9488] font-bold">{req.leave_type_name}</td>
                    <td className="p-4 font-mono text-[#475569]">{req.start_date} to {req.end_date}</td>
                    <td className="p-4 font-mono font-extrabold text-[#0F172A] tabular-nums">
                      {req.total_days} {req.is_half_day ? <span className="px-1.5 py-0.5 text-[9px] bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4] rounded uppercase font-bold">HALF DAY</span> : 'DAY(S)'}
                    </td>
                    <td className="p-4 text-[#334155] max-w-xs truncate">{req.reason || '—'}</td>
                    <td className="p-4 font-mono">
                      <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded uppercase ${
                        req.status === 'approved' ? 'chip-approved' : req.status === 'rejected' ? 'chip-rejected' : 'chip-pending'
                      }`}>
                        {req.status}
                      </span>
                    </td>
                    {isApprover && (
                      <td className="p-4 text-right font-mono">
                        {req.status === 'pending' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApprove(req.id)}
                              className="px-2.5 py-1 rounded bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] hover:bg-[#D1FAE5] text-[10px] font-bold uppercase"
                            >
                              APPROVE
                            </button>
                            <button
                              onClick={() => handleReject(req.id)}
                              className="px-2.5 py-1 rounded bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] hover:bg-[#FEE2E2] text-[10px] font-bold uppercase"
                            >
                              REJECT
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-[#64748B] font-mono">
                    NO LEAVE APPLICATIONS LOGGED.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Apply Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="industrial-card-raised w-full max-w-md p-6 relative border border-[#CBD5E1] bg-white text-[#0F172A]">
            <button onClick={() => setShowApplyModal(false)} className="absolute top-4 right-4 text-[#64748B] hover:text-[#0F172A]">
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-sm font-mono font-bold text-[#0F172A] mb-4 uppercase tracking-wider border-b border-[#E2E8F0] pb-2">
              SUBMIT LEAVE APPLICATION
            </h2>

            <form onSubmit={handleApplyLeave} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#334155] font-mono text-[11px] mb-1">LEAVE CATEGORY</label>
                <select
                  value={formData.leave_type_id}
                  onChange={(e) => setFormData({ ...formData, leave_type_id: Number(e.target.value) })}
                  className="w-full p-2.5 rounded industrial-input font-mono bg-white"
                >
                  {leaveTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.allowed_days_per_year} days/yr)</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 p-2 bg-[#F0FDFA] border border-[#99F6E4] rounded">
                <input
                  type="checkbox"
                  id="is_half_day"
                  checked={formData.is_half_day}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormData((prev) => ({
                      ...prev,
                      is_half_day: checked,
                      end_date: checked ? prev.start_date : prev.end_date
                    }));
                  }}
                  className="w-4 h-4 text-[#0D9488] focus:ring-[#0D9488] rounded cursor-pointer"
                />
                <label htmlFor="is_half_day" className="font-mono text-xs font-bold text-[#0F766E] cursor-pointer">
                  HALF-DAY LEAVE REQUEST (0.5 DAY DEDUCTION)
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono">
                <div>
                  <label className="block text-[#334155] text-[11px] mb-1">START DATE</label>
                  <input
                    type="date"
                    required
                    value={formData.start_date}
                    onChange={(e) => setFormData((prev) => ({
                      ...prev,
                      start_date: e.target.value,
                      end_date: prev.is_half_day ? e.target.value : prev.end_date
                    }))}
                    className="w-full p-2.5 rounded industrial-input"
                  />
                </div>
                <div>
                  <label className="block text-[#334155] text-[11px] mb-1">END DATE</label>
                  <input
                    type="date"
                    required
                    disabled={formData.is_half_day}
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className={`w-full p-2.5 rounded industrial-input ${formData.is_half_day ? 'bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#334155] font-mono text-[11px] mb-1">REASON / JUSTIFICATION</label>
                <textarea
                  rows={3}
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="State reason for absence..."
                  className="w-full p-2.5 rounded industrial-input"
                />
              </div>

              <div className="pt-2 flex gap-3 font-mono">
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  className="w-1/2 py-2.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] hover:bg-[#E2E8F0] uppercase"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded bg-[#0D9488] text-white font-bold hover:bg-[#0F766E] shadow uppercase"
                >
                  SUBMIT REQUEST
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BUG-018 FIX: Styled Rejection Reason Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="industrial-card-raised w-full max-w-sm p-6 border border-rose-300 bg-white text-[#0F172A] relative">
            <h2 className="text-sm font-mono font-bold text-[#B91C1C] mb-4 uppercase tracking-wider border-b border-rose-100 pb-2">
              REJECT LEAVE APPLICATION
            </h2>
            <label className="block text-[#334155] font-mono text-[11px] mb-2">REJECTION REASON</label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="State reason for rejection..."
              className="w-full p-2.5 rounded industrial-input text-xs mb-4"
              autoFocus
            />
            <div className="flex gap-3 font-mono">
              <button
                onClick={() => setRejectTarget(null)}
                className="w-1/2 py-2.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] hover:bg-[#E2E8F0] text-xs uppercase"
              >
                CANCEL
              </button>
              <button
                onClick={async () => {
                  try {
                    await api.put(`/leave/requests/${rejectTarget}/reject`, { rejection_reason: rejectReason });
                    setRejectTarget(null);
                    fetchData();
                  } catch (err: any) {
                    alert(err.response?.data?.error?.message || 'Error rejecting leave');
                  }
                }}
                className="w-1/2 py-2.5 rounded bg-[#DC2626] text-white font-bold hover:bg-[#B91C1C] text-xs uppercase shadow"
              >
                CONFIRM REJECT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
