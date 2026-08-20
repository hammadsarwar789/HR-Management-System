import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Play,
  Download,
  ShieldCheck,
  Calculator,
  Search,
  Eye,
  X,
  Clock,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  UserCheck,
  Calendar,
  Layers,
  FileText,
  Activity
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export const PayrollPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const isPayrollAdmin = user?.role === 'Super Admin' || user?.role === 'HR Manager';

  const [payrollRuns, setPayrollRuns] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [runningBatch, setRunningBatch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTrace, setShowTrace] = useState(true);

  // Payslip Modal State
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  const [dynamicPayslip, setDynamicPayslip] = useState<any | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalTab, setModalTab] = useState<'financial' | 'attendance_drilldown'>('financial');

  useEffect(() => {
    fetchPayrollRuns();
  }, []);

  const fetchPayrollRuns = async () => {
    try {
      const res = await api.get('/payroll/runs');
      setPayrollRuns(res.data.payroll_runs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPayslipModal = async (run: any) => {
    setSelectedRun(run);
    setModalTab('financial');
    setModalLoading(true);
    try {
      const res = await api.get(`/payroll/payslips/${run.employee_id || run.employee_code}`, {
        params: { period: run.month_year }
      });
      setDynamicPayslip(res.data);
    } catch (err) {
      console.error('Failed to load dynamic payslip drilldown', err);
      setDynamicPayslip(null);
    } finally {
      setModalLoading(false);
    }
  };

  const handleTriggerBatch = async () => {
    setRunningBatch(true);
    try {
      const today = new Date();
      const res = await api.post('/payroll/runs', {
        year: today.getFullYear(),
        month: today.getMonth() + 1
      });
      alert(`Payroll batch completed! ${res.data.message}`);
      fetchPayrollRuns();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || err.response?.data?.error || 'Error processing payroll run');
    } finally {
      setRunningBatch(false);
    }
  };

  const handleDownloadPayslip = async (runId: string, empCode: string) => {
    try {
      const response = await api.get(`/payroll/runs/${runId}/payslip-pdf`, {
        responseType: 'blob'
      });
      const contentDisposition = response.headers['content-disposition'];
      let filename = `Payslip_${empCode || 'Record'}.pdf`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename=(?:"([^"]+)"|([^;]+))/);
        if (match && (match[1] || match[2])) {
          filename = match[1] || match[2];
        }
      }
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      alert('Failed to download payslip PDF');
    }
  };

  // Filter payroll runs based on search input
  const filteredRuns = payrollRuns.filter((run) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (run.employee_name && run.employee_name.toLowerCase().includes(q)) ||
      (run.employee_code && run.employee_code.toLowerCase().includes(q)) ||
      (run.month_year && run.month_year.toLowerCase().includes(q))
    );
  });

  const summary = dynamicPayslip?.summary || selectedRun?.attendance_summary || {};
  const scheduledDays = summary.scheduled_days || 22;
  const paidDays = summary.paid_days !== undefined ? summary.paid_days : scheduledDays;
  const missedAbsentDays = summary.missed_absent_days || (summary.unpaid_absent_days || 0) + ((summary.half_days || 0) * 0.5);
  const otHours = summary.approved_ot_hours || 0;
  const missedPunchDed = summary.missed_punch_deduction || selectedRun?.unpaid_leave_deductions || 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-16">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 industrial-card p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl text-slate-100">
        <div>
          <div className="flex items-center gap-2.5 font-mono">
            <CreditCard className="w-6 h-6 text-teal-400" />
            <h1 className="text-lg font-bold text-slate-100 uppercase tracking-wider">
              ENTERPRISE PAYROLL & ATTENDANCE DEDUCTIONS
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-teal-950/80 text-teal-300 border border-teal-500/30 rounded uppercase">
              ESCROW & DEDUCTIONS ACTIVE
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 font-sans">
            Automated monthly batch processing, missed punch deductions, extreme lateness penalization & 5.0% security escrow holdback.
          </p>
        </div>

        {isPayrollAdmin && (
          <button
            onClick={handleTriggerBatch}
            disabled={runningBatch}
            className="py-2.5 px-5 rounded-xl bg-teal-600 hover:bg-teal-500 text-slate-950 font-mono font-bold text-xs transition-all flex items-center gap-2 shadow-md disabled:opacity-50 uppercase tracking-wider shrink-0"
          >
            <Play className="w-4 h-4 fill-slate-950" />
            {runningBatch ? 'CALCULATING ATTENDANCE & PAYROLL...' : 'RUN BATCH PAYROLL'}
          </button>
        )}
      </div>

      {/* 5% Holdback Policy & Missed Punch Deduction Alert Block */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl flex items-start gap-3 shadow-xs">
          <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
          <div className="text-xs font-mono">
            <h4 className="font-bold text-teal-900 uppercase tracking-wider">5% SECURITY HOLDBACK (ESCROWED)</h4>
            <p className="text-teal-800 mt-0.5 font-sans leading-relaxed">
              5.0% of basic salary is held in corporate escrow each month. Net pay is disbursed after tax & security holdback.
            </p>
          </div>
        </div>

        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 shadow-xs">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs font-mono">
            <h4 className="font-bold text-rose-900 uppercase tracking-wider">MISSED PUNCH & ATTENDANCE PENALTIES</h4>
            <p className="text-rose-800 mt-0.5 font-sans leading-relaxed">
              Unregularized missed punch-outs (0.0h) deduct 1.0 day rate. Shifts under 7.5h or extreme lateness (&gt;120m) deduct 0.5 day rate.
            </p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code (EMP-001), name, or period (2026-08)..."
            className="w-full py-2.5 pl-10 pr-4 text-xs font-mono bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-teal-500 text-slate-900"
          />
        </div>
      </div>

      {/* Calculation Trace Panel */}
      {showTrace && (
        <div className="industrial-card p-4 space-y-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-teal-700 font-bold flex items-center gap-2">
              <Calculator className="w-4 h-4" /> CALCULATION TRACE & DEDUCTION FORMULAS
            </span>
            <button onClick={() => setShowTrace(false)} className="text-slate-500 hover:text-slate-800 text-[10px]">
              HIDE TRACE
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px] text-slate-700">
            <div>• <strong className="text-teal-800">Daily Rate</strong> = Basic Salary ÷ Working Days</div>
            <div>• <strong className="text-rose-700">Absence Deduction</strong> = (Unpaid Days × Daily Rate) + (Half Days × 0.5 × Daily Rate)</div>
            <div>• <strong className="text-teal-800">Approved OT Pay</strong> = OT Hours × Hourly Rate × 1.5</div>
            <div>• <strong className="text-emerald-700">Net Payable</strong> = Gross + Reimbursements − (Tax + Security + Absence Deductions)</div>
          </div>
        </div>
      )}

      {/* Payroll Runs History Table */}
      <div className="industrial-card overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-900">
            <thead className="bg-slate-900 text-white font-mono font-bold uppercase tracking-wider">
              <tr>
                <th className="p-4">EMPLOYEE</th>
                <th className="p-4">PERIOD</th>
                <th className="p-4">BASIC PAY</th>
                <th className="p-4 text-teal-400">ATTENDANCE / PAID DAYS</th>
                <th className="p-4 text-rose-300">MISSED PUNCH DEDUCTION</th>
                <th className="p-4 text-teal-300">APPROVED OT</th>
                <th className="p-4">5% HOLDBACK</th>
                <th className="p-4 text-emerald-400">NET PAYABLE</th>
                <th className="p-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {filteredRuns.length > 0 ? (
                filteredRuns.map((run) => {
                  const att = run.attendance_summary || {};
                  const totalDays = att.total_working_days || 22;
                  const paidDaysCount = att.paid_days !== undefined ? att.paid_days : totalDays;
                  const unpaidDed = run.unpaid_leave_deductions || att.unpaid_deduction_amount || 0;
                  const otHoursVal = att.approved_ot_hours || 0;

                  return (
                    <tr key={run.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-sans font-medium text-slate-900">
                        <div className="font-bold">{run.employee_name}</div>
                        <div className="text-[10px] font-mono text-teal-600 font-bold">{run.employee_code}</div>
                      </td>
                      <td className="p-4 text-slate-600 font-bold">{run.month_year}</td>
                      <td className="p-4 text-slate-700 font-bold">PKR {run.basic_salary.toLocaleString()}</td>

                      {/* Attendance Breakdown Column */}
                      <td className="p-4 font-mono">
                        <div className="flex items-center gap-1.5 font-bold text-teal-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                          <span>{paidDaysCount} / {totalDays} Days Paid</span>
                        </div>
                        {(att.unpaid_absent_days > 0 || att.half_days > 0) && (
                          <div className="text-[10px] text-rose-600 font-semibold">
                            {att.unpaid_absent_days > 0 && `${att.unpaid_absent_days} Absent `}
                            {att.half_days > 0 && `${att.half_days} Half-Days`}
                          </div>
                        )}
                      </td>

                      {/* Missed Punch / Absence Deductions */}
                      <td className="p-4 font-mono">
                        {unpaidDed > 0 ? (
                          <span className="text-rose-600 font-bold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[11px]">
                            -PKR {Number(unpaidDed).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-slate-400">PKR 0.00</span>
                        )}
                      </td>

                      {/* Approved Overtime Pay */}
                      <td className="p-4 font-mono">
                        {run.overtime_pay > 0 ? (
                          <div>
                            <span className="text-teal-700 font-bold">+PKR {Number(run.overtime_pay).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            {otHoursVal > 0 && <span className="text-[10px] text-slate-400 block">({otHoursVal}h OT)</span>}
                          </div>
                        ) : (
                          <span className="text-slate-400">PKR 0.00</span>
                        )}
                      </td>

                      {/* 5% Escrow Holdback */}
                      <td className="p-4 text-teal-900 font-bold bg-teal-50/60">
                        PKR {run.security_deduction.toLocaleString()}
                      </td>

                      {/* Net Payable Salary (Highlighted) */}
                      <td className="p-4 text-emerald-800 font-extrabold text-sm bg-emerald-50/50">
                        PKR {run.net_salary.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>

                      {/* Action Buttons: View Breakdown & Download PDF */}
                      <td className="p-4 text-right font-sans">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenPayslipModal(run)}
                            className="py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-mono font-bold flex items-center gap-1 transition border border-slate-300"
                            title="Inspect complete line-item breakdown & daily audit"
                          >
                            <Eye className="w-3.5 h-3.5 text-teal-600" />
                            VIEW
                          </button>
                          <button
                            onClick={() => handleDownloadPayslip(run.id, run.employee_code)}
                            className="py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-xs uppercase tracking-wider"
                          >
                            <Download className="w-3.5 h-3.5 text-teal-400" />
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500 font-mono">
                    {loading ? 'LOADING PAYROLL RECORDS...' : 'NO MATCHING PAYROLL RECORDS FOUND.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── DYNAMIC ATTENDANCE-BACKED PAYSLIP INSPECTION & AUDIT MODAL ─── */}
      {selectedRun && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col p-6 shadow-2xl text-slate-100 font-mono text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-5 h-5 text-teal-400" />
                <h3 className="font-bold text-base text-slate-100">
                  Payslip Statement & Attendance Audit • {selectedRun.month_year}
                </h3>
              </div>
              <button onClick={() => setSelectedRun(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Provisional Estimate Amber Top Banner */}
            {dynamicPayslip?.is_provisional_preview && (
              <div className="bg-amber-950/70 border border-amber-500/40 p-3 rounded-xl flex items-start gap-2.5 text-amber-200 mt-3 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong className="text-amber-300 font-bold block uppercase tracking-wider">
                    PROVISIONAL MID-MONTH ESTIMATE
                  </strong>
                  This billing period is currently in-progress. Working hours, overtime, and absence deductions are calculated up to today. Final official disbursement numbers lock after month-end on{' '}
                  <span className="font-bold text-amber-100">{dynamicPayslip?.available_after || 'the 1st of next month'}</span>.
                </div>
              </div>
            )}

            {/* Employee Banner */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mt-3">
              <div>
                <span className="font-bold text-slate-100 text-sm block">{selectedRun.employee_name}</span>
                <span className="text-teal-400 font-bold">{selectedRun.employee_code} • {dynamicPayslip?.department || 'General'}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-slate-400 block uppercase text-[9px]">Pay Period</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-200">{selectedRun.month_year}</span>
                    {dynamicPayslip?.is_provisional_preview ? (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-500/40 rounded uppercase">
                        PROVISIONAL
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/40 rounded uppercase">
                        OFFICIAL CLOSED
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[9px] text-slate-400 block uppercase font-bold">SCHEDULED DAYS</span>
                <span className="font-bold text-slate-200 text-sm">{scheduledDays} Days</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[9px] text-slate-400 block uppercase font-bold">PAID DAYS</span>
                <span className="font-bold text-teal-400 text-sm">{paidDays} Days</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[9px] text-slate-400 block uppercase font-bold">MISSED / ABSENT</span>
                <span className="font-bold text-rose-400 text-sm">{missedAbsentDays} Days</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
                <span className="text-[9px] text-slate-400 block uppercase font-bold">APPROVED OT</span>
                <span className="font-bold text-amber-400 text-sm">+{otHours} Hours</span>
              </div>
            </div>

            {/* Modal Sub-Tabs */}
            <div className="flex items-center space-x-2 border-b border-slate-800 pt-3 pb-2">
              <button
                onClick={() => setModalTab('financial')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  modalTab === 'financial'
                    ? 'bg-teal-600 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Financial Ledger Breakdown</span>
              </button>

              <button
                onClick={() => setModalTab('attendance_drilldown')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  modalTab === 'attendance_drilldown'
                    ? 'bg-teal-600 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>
                  Daily Attendance Audit Drilldown ({dynamicPayslip?.daily_attendance_breakdown?.length || 0} Days)
                </span>
              </button>
            </div>

            {/* Tab 1: Financial Ledger Breakdown */}
            {modalTab === 'financial' && (
              <div className="space-y-4 overflow-y-auto pr-1 py-1 flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Earnings */}
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                    <span className="text-[10px] text-teal-400 uppercase font-bold block border-b border-slate-800 pb-1">
                      Gross Earnings Items
                    </span>
                    <div className="flex justify-between text-slate-300">
                      <span>Contract Basic Salary:</span>
                      <span className="text-slate-400">PKR {selectedRun.basic_salary.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-100 font-bold bg-teal-950/30 px-2 py-1 rounded border border-teal-500/20">
                      <span>Earned Basic ({paidDays}d / {scheduledDays}d):</span>
                      <span className="text-teal-300">
                        PKR {(summary.earned_basic_salary !== undefined ? summary.earned_basic_salary : selectedRun.basic_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Total Allowances:</span>
                      <span>PKR {selectedRun.total_allowances.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-teal-300 font-bold">
                      <span>Approved Overtime Pay:</span>
                      <span>+PKR {(summary.ot_pay || selectedRun.overtime_pay || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Performance Bonus:</span>
                      <span>PKR {(selectedRun.bonus || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Deductions */}
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                    <span className="text-[10px] text-rose-400 uppercase font-bold block border-b border-slate-800 pb-1">
                      Deductions & Escrow (Pro-Rated)
                    </span>
                    <div className="flex justify-between text-slate-300">
                      <span>Income Tax (on Earned Gross):</span>
                      <span>-PKR {(summary.tax_deduction || selectedRun.tax_deducted || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-teal-300 font-bold">
                      <span>Pro-Rated 5% Security Escrow:</span>
                      <span>-PKR {(summary.escrow_deduction || selectedRun.security_deduction || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-rose-400 font-bold">
                      <span>Missed Punch & Absence Deduction:</span>
                      <span>-PKR {Number(missedPunchDed).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Other Miscellaneous Deductions:</span>
                      <span>-PKR {(selectedRun.other_deductions || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Non-Taxable Reimbursements */}
                {(selectedRun.reimbursements_total || 0) > 0 && (
                  <div className="bg-teal-950/40 p-3 rounded-xl border border-teal-500/30 flex justify-between items-center text-teal-300 font-bold">
                    <span>Non-Taxable Expense Reimbursements:</span>
                    <span>+PKR {Number(selectedRun.reimbursements_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                {/* Zero-Floor Arrears Debt Banner */}
                {(summary.carried_forward_arrears > 0 || selectedRun.status === 'ZERO_DISBURSEMENT_ARREARS') && (
                  <div className="bg-rose-950/80 border border-rose-500/50 p-3 rounded-xl flex items-center justify-between text-rose-200">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="text-[11px] font-bold">
                        ZERO-FLOOR SAFEGUARD ACTIVE • Deductions exceeded earned pay.
                      </span>
                    </div>
                    <span className="text-xs font-bold text-rose-300 bg-rose-900/60 px-2 py-0.5 rounded border border-rose-500/40">
                      Carried Arrears: -PKR {Number(summary.carried_forward_arrears || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {/* Net Salary Highlight */}
                <div className={`p-4 rounded-xl border flex justify-between items-center font-bold text-sm ${
                  (summary.net_payable || selectedRun.net_salary) > 0
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-950 border-slate-700 text-slate-400'
                }`}>
                  <span className="uppercase tracking-wider">NET SALARY DISBURSED:</span>
                  <span className={`text-base font-extrabold ${
                    (summary.net_payable || selectedRun.net_salary) > 0 ? 'text-emerald-200' : 'text-slate-300'
                  }`}>
                    PKR {(summary.net_payable !== undefined ? summary.net_payable : selectedRun.net_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}

            {/* Tab 2: Daily Attendance Audit Drilldown Table */}
            {modalTab === 'attendance_drilldown' && (
              <div className="overflow-y-auto pr-1 py-1 flex-1">
                {modalLoading ? (
                  <div className="p-8 text-center text-slate-400">
                    Aggregating dynamic attendance records...
                  </div>
                ) : dynamicPayslip?.daily_attendance_breakdown?.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-800 rounded-xl">
                    <table className="w-full text-left text-xs text-slate-200">
                      <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-mono font-bold tracking-wider">
                        <tr>
                          <th className="p-2.5">DATE</th>
                          <th className="p-2.5">DAY</th>
                          <th className="p-2.5">PUNCH IN</th>
                          <th className="p-2.5">PUNCH OUT</th>
                          <th className="p-2.5 text-teal-400">DURATION</th>
                          <th className="p-2.5">LATE</th>
                          <th className="p-2.5 text-amber-400">OT</th>
                          <th className="p-2.5">STATUS</th>
                          <th className="p-2.5 text-right">PAYABLE IMPACT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                        {dynamicPayslip.daily_attendance_breakdown.map((row: any) => (
                          <tr key={row.date} className="hover:bg-slate-800/40 transition">
                            <td className="p-2.5 font-bold text-slate-100">{row.date}</td>
                            <td className="p-2.5 text-slate-400">{row.day}</td>
                            <td className="p-2.5 text-emerald-400 font-bold">{row.time_in || '—'}</td>
                            <td className="p-2.5 text-slate-300">{row.time_out || '—'}</td>
                            <td className="p-2.5 font-bold text-teal-300">{row.work_hours}</td>
                            <td className="p-2.5">
                              {row.late_minutes > 0 ? (
                                <span className="text-amber-400 font-bold">{row.late_deviation}</span>
                              ) : (
                                <span className="text-slate-500">{row.late_deviation}</span>
                              )}
                            </td>
                            <td className="p-2.5">
                              {row.approved_ot_hours > 0 ? (
                                <span className="text-amber-400 font-bold">+{row.approved_ot_hours}h</span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="p-2.5">
                              {row.day_status === 'PRESENT' && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-teal-950 text-teal-300 border border-teal-500/30">
                                  PRESENT
                                </span>
                              )}
                              {row.day_status === 'LATE_PRESENT' && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-500/30">
                                  LATE PRESENT
                                </span>
                              )}
                              {(row.day_status === 'HALF_DAY' || row.day_status === 'INCOMPLETE') && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-500/30">
                                  HALF DAY
                                </span>
                              )}
                              {row.day_status === 'MISSED_OUT' && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-950 text-rose-300 border border-rose-500/30">
                                  MISSED OUT
                                </span>
                              )}
                              {row.day_status === 'ABSENT' && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-950 text-rose-300 border border-rose-500/30">
                                  ABSENT
                                </span>
                              )}
                              {row.day_status === 'IN_SHIFT' && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-teal-950 text-teal-300 border border-teal-500/30 animate-pulse">
                                  IN SHIFT
                                </span>
                              )}
                              {row.day_status === 'ON_BREAK' && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-500/30 animate-pulse">
                                  ON BREAK
                                </span>
                              )}
                              {row.day_status === 'HOLIDAY' && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-purple-950 text-purple-300 border border-purple-500/30">
                                  HOLIDAY
                                </span>
                              )}
                              {row.day_status === 'APPROVED_LEAVE' && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-sky-950 text-sky-300 border border-sky-500/30">
                                  ON LEAVE
                                </span>
                              )}
                              {row.day_status === 'WEEKEND' && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-400">
                                  WEEKEND
                                </span>
                              )}
                              {row.day_status === 'WEEKEND_OT' && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-500/30">
                                  WEEKEND OT
                                </span>
                              )}
                              {row.day_status === 'REGULARIZED' && (
                                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-500/30">
                                  REGULARIZED
                                </span>
                              )}
                              {row.day_status === 'FUTURE' && (
                                <span className="text-slate-600 text-[10px]">—</span>
                              )}
                            </td>
                            <td className="p-2.5 text-right font-bold">
                              {row.payable_ratio === 1.0 ? (
                                <span className="text-teal-400">{row.payable_status}</span>
                              ) : row.payable_ratio === 0.5 ? (
                                <span className="text-amber-400">{row.payable_status}</span>
                              ) : row.day_status === 'FUTURE' || row.day_status === 'WEEKEND' ? (
                                <span className="text-slate-500">{row.payable_status}</span>
                              ) : (
                                <span className="text-rose-400">{row.payable_status}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-500">
                    No attendance records found for this period.
                  </div>
                )}
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setSelectedRun(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
              >
                Close
              </button>
              <button
                onClick={() => handleDownloadPayslip(selectedRun.id, selectedRun.employee_code)}
                className={`px-4 py-2 rounded-xl font-bold text-xs uppercase flex items-center gap-1.5 shadow-md transition ${
                  dynamicPayslip?.is_provisional_preview
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    : 'bg-teal-600 hover:bg-teal-500 text-slate-950'
                }`}
              >
                <Download className="w-4 h-4" />
                {dynamicPayslip?.is_provisional_preview ? 'DOWNLOAD PROVISIONAL PDF PREVIEW' : 'DOWNLOAD OFFICIAL PDF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
