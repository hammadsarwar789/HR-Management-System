import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Plus, Search, Filter, Calendar, FileText, CheckCircle2, AlertCircle, RefreshCw, X, ArrowUpRight, ArrowDownRight, Building, CreditCard, Download, ShieldCheck, Check
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export const RevenuePage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const isFinance = user?.role === 'Super Admin' || user?.role === 'HR Manager' || user?.role === 'Finance Admin';

  const [summary, setSummary] = useState<any>(null);
  const [revenues, setRevenues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Accounting Basis Toggle
  const [accountingBasis, setAccountingBasis] = useState<'CASH' | 'ACCRUAL'>('CASH');

  // Modals
  const [showLogModal, setShowLogModal] = useState(false);
  const [settlingRevenue, setSettlingRevenue] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittingSettle, setSubmittingSettle] = useState(false);

  // Filters
  const [sourceFilter, setSourceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Form State for Log Revenue Modal
  const [formData, setFormData] = useState({
    title: '',
    source_type: 'PROJECT',
    client_name: '',
    gross_amount: 500000,
    tax_deducted: 25000,
    fbr_withholding_rate: 5.0,
    currency: 'PKR',
    booked_rate: 1.0,
    settlement_rate: 1.0,
    accrual_date: new Date().toISOString().split('T')[0],
    received_date: new Date().toISOString().split('T')[0],
    payment_method: 'WIRE_TRANSFER',
    status: 'CLEARED',
    proof_document_url: ''
  });

  // Form State for Settle Modal
  const [settleFormData, setSettleFormData] = useState({
    settlement_rate: 1.0,
    settlement_date: new Date().toISOString().split('T')[0],
    payment_method: 'WIRE_TRANSFER'
  });

  useEffect(() => {
    fetchFinancialData();
  }, [sourceFilter, statusFilter]);

  const fetchFinancialData = async () => {
    setLoading(true);
    try {
      const summaryRes = await api.get('/finance/summary');
      setSummary(summaryRes.data.summary || null);

      let url = `/finance/revenues?search=${encodeURIComponent(searchQuery)}`;
      if (sourceFilter) url += `&source_type=${sourceFilter}`;
      if (statusFilter) url += `&status=${statusFilter}`;

      const revRes = await api.get(url);
      setRevenues(revRes.data.revenues || []);
    } catch (err: any) {
      console.error('Error fetching financial revenue data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogRevenueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.gross_amount <= 0) {
      alert('Gross amount must be strictly greater than 0.');
      return;
    }
    if (formData.tax_deducted > formData.gross_amount) {
      alert('Tax deducted cannot exceed gross amount.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/finance/revenues', formData);
      alert(`✓ Revenue Entry Logged Successfully!\n\nReference #: ${res.data.revenue.reference_no}\nSettled Realized: PKR ${res.data.revenue.settled_amount_pkr.toLocaleString()}`);
      setShowLogModal(false);
      setFormData({
        title: '',
        source_type: 'PROJECT',
        client_name: '',
        gross_amount: 500000,
        tax_deducted: 25000,
        fbr_withholding_rate: 5.0,
        currency: 'PKR',
        booked_rate: 1.0,
        settlement_rate: 1.0,
        accrual_date: new Date().toISOString().split('T')[0],
        received_date: new Date().toISOString().split('T')[0],
        payment_method: 'WIRE_TRANSFER',
        status: 'CLEARED',
        proof_document_url: ''
      });
      fetchFinancialData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to log revenue entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenSettleModal = (rev: any) => {
    setSettlingRevenue(rev);
    setSettleFormData({
      settlement_rate: rev.booked_rate || 1.0,
      settlement_date: new Date().toISOString().split('T')[0],
      payment_method: rev.payment_method || 'WIRE_TRANSFER'
    });
  };

  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingRevenue) return;

    setSubmittingSettle(true);
    try {
      const res = await api.patch(`/finance/revenues/${settlingRevenue.id}/settle`, settleFormData);
      alert(`✓ Invoice ${settlingRevenue.reference_no} Settled & Cleared!\n\nRealized FX Gain/Loss: PKR ${res.data.revenue.realized_fx_gain_loss.toLocaleString()}\nBank Realized Amount: PKR ${res.data.revenue.settled_amount_pkr.toLocaleString()}`);
      setSettlingRevenue(null);
      fetchFinancialData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to settle revenue entry');
    } finally {
      setSubmittingSettle(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await api.get('/finance/export/csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `financial_reconciliation_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      alert(`✓ Watermarked Financial Reconciliation CSV Downloaded!\nStamped with Security Watermark: CONFIDENTIAL - EXPORTED BY ${user?.email}`);
    } catch (err: any) {
      alert('Failed to export reconciliation report.');
    }
  };

  const handleGetSignedUrl = async (revId: string) => {
    try {
      const res = await api.get(`/finance/revenues/${revId}/attachment-signed-url`);
      window.open(res.data.signed_url, '_blank');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to generate signed document URL');
    }
  };

  const netAmountCalculated = Math.max(0, formData.gross_amount - formData.tax_deducted);
  const pkrBookedCalculated = netAmountCalculated * formData.booked_rate;

  const settleFxGainLossCalc = settlingRevenue
    ? settlingRevenue.net_amount * (settleFormData.settlement_rate - settlingRevenue.booked_rate)
    : 0.0;

  return (
    <div className="space-y-6 font-sans">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 industrial-card p-6 bg-white border border-[#CBD5E1]">
        <div>
          <h1 className="text-lg font-bold text-[#0F172A] flex items-center gap-2 font-mono uppercase tracking-wider">
            <TrendingUp className="w-5 h-5 text-[#0D9488]" />
            REVENUE & CASH FLOW ENGINE (ENTERPRISE CORE)
          </h1>
          <p className="text-xs text-[#64748B] mt-1 font-sans">
            Realized FX Gain/Loss, Accrual vs Cash Accounting, Double-Entry Ledger & Watermarked Compliance
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isFinance && (
            <>
              <button
                onClick={handleExportCSV}
                className="py-2.5 px-3 rounded bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#334155] border border-[#CBD5E1] font-mono font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer uppercase"
                title="Export Watermarked CSV"
              >
                <Download className="w-4 h-4 text-[#0D9488]" /> EXPORT RECONCILIATION
              </button>

              <button
                onClick={() => setShowLogModal(true)}
                className="py-2.5 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-mono font-bold text-xs transition-all flex items-center gap-2 shadow-sm uppercase tracking-wider cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                + LOG REVENUE INVOICE
              </button>
            </>
          )}
        </div>
      </div>

      {/* Accounting Basis Switcher & Executive Financial Metrics */}
      {summary && (
        <div className="space-y-3">
          <div className="flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-2 bg-[#F1F5F9] p-1 rounded-lg border border-[#CBD5E1]">
              <button
                onClick={() => setAccountingBasis('CASH')}
                className={`px-3 py-1 rounded font-bold text-[11px] uppercase transition-all cursor-pointer ${
                  accountingBasis === 'CASH' ? 'bg-[#0F172A] text-white shadow-xs' : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                💵 CASH BASIS (REALIZED INFLOW)
              </button>
              <button
                onClick={() => setAccountingBasis('ACCRUAL')}
                className={`px-3 py-1 rounded font-bold text-[11px] uppercase transition-all cursor-pointer ${
                  accountingBasis === 'ACCRUAL' ? 'bg-[#0F172A] text-white shadow-xs' : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                📜 ACCRUAL BASIS (BOOKED REVENUE)
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 bg-[#F0FDFA] border border-[#99F6E4] text-[#0F766E] rounded font-bold text-[11px]">
                FBR TAX WITHHELD: PKR {summary.total_tax_withheld_pkr.toLocaleString()}
              </span>
              <span className={`px-2.5 py-1 rounded font-bold text-[11px] border ${
                summary.total_fx_gain_loss_pkr >= 0 ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]' : 'bg-[#FEF2F2] text-[#DC2626] border-[#FCA5A5]'
              }`}>
                REALIZED FX {summary.total_fx_gain_loss_pkr >= 0 ? 'GAIN' : 'LOSS'}: PKR {summary.total_fx_gain_loss_pkr.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
            <div className="industrial-card p-5 bg-white border border-[#CBD5E1] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#64748B] uppercase font-bold">
                  {accountingBasis === 'CASH' ? 'REALIZED CASH INFLOW' : 'BOOKED ACCRUAL REVENUE'}
                </span>
                <span className="p-1 bg-[#CCFBF1] text-[#0F766E] rounded"><ArrowUpRight className="w-4 h-4" /></span>
              </div>
              <div className="text-xl font-extrabold text-[#0D9488]">
                PKR {(accountingBasis === 'CASH' ? summary.cash_realized_revenue_pkr : summary.accrual_booked_revenue_pkr).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-[#64748B] font-sans">
                Monthly Inflow: <span className="font-bold text-[#0F172A]">PKR {summary.monthly_inflow_pkr.toLocaleString()}</span>
              </div>
            </div>

            <div className="industrial-card p-5 bg-white border border-[#CBD5E1] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#64748B] uppercase font-bold">TOTAL OUTFLOW (PAYROLL + EXPENSES)</span>
                <span className="p-1 bg-[#FEF2F2] text-[#DC2626] rounded"><ArrowDownRight className="w-4 h-4" /></span>
              </div>
              <div className="text-xl font-extrabold text-[#DC2626]">
                PKR {summary.total_outflow_pkr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-[#64748B] font-sans">
                Payroll: <span className="font-bold">PKR {summary.monthly_payroll_outflow_pkr.toLocaleString()}</span> • Claims: <span className="font-bold">PKR {summary.total_expense_outflow_pkr.toLocaleString()}</span>
              </div>
            </div>

            <div className="industrial-card p-5 bg-white border border-[#CBD5E1] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#64748B] uppercase font-bold">PROJECT & SAAS INFLOW</span>
                <span className="p-1 bg-[#E0F2FE] text-[#0284C7] rounded"><Building className="w-4 h-4" /></span>
              </div>
              <div className="text-xl font-extrabold text-[#0284C7]">
                PKR {(summary.project_inflow_pkr + summary.saas_inflow_pkr).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-[#64748B] font-sans">
                Projects: <span className="font-bold">PKR {summary.project_inflow_pkr.toLocaleString()}</span> • SaaS: <span className="font-bold">PKR {summary.saas_inflow_pkr.toLocaleString()}</span>
              </div>
            </div>

            <div className={`industrial-card p-5 border space-y-2 ${
              (accountingBasis === 'CASH' ? summary.cash_net_margin_pkr : summary.accrual_net_margin_pkr) >= 0 ? 'bg-[#F0FDFA] border-[#99F6E4]' : 'bg-[#FEF2F2] border-[#FCA5A5]'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-[#0F766E]">
                  NET OPERATING MARGIN ({accountingBasis})
                </span>
                <span className="px-2 py-0.5 text-[9px] font-bold rounded uppercase bg-[#CCFBF1] text-[#0F766E]">
                  {summary.is_profitable ? 'PROFITABLE ✓' : 'DEFICIT ⚠'}
                </span>
              </div>
              <div className="text-xl font-extrabold text-[#0F766E]">
                PKR {(accountingBasis === 'CASH' ? summary.cash_net_margin_pkr : summary.accrual_net_margin_pkr).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] font-sans opacity-80">
                {accountingBasis === 'CASH' ? 'Realized Cash Inflow minus Outflow' : 'Accrued Booked Revenue minus Outflow'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reference # (INV-2026-001), title, or client..."
            className="w-full py-2.5 pl-10 pr-4 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
          />
        </div>

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="w-full sm:w-48 py-2.5 px-3 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
        >
          <option value="">ALL SOURCES</option>
          <option value="PROJECT">CLIENT PROJECTS</option>
          <option value="PRODUCT_SAAS">SAAS / PRODUCT</option>
          <option value="OTHER">OTHER INCOME</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-48 py-2.5 px-3 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
        >
          <option value="">ALL STATUSES</option>
          <option value="CLEARED">CLEARED</option>
          <option value="PENDING">PENDING</option>
          <option value="REFUNDED">REFUNDED</option>
        </select>

        <button
          onClick={fetchFinancialData}
          className="p-2.5 bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] rounded text-[#334155] cursor-pointer"
          title="Refresh Data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Itemized Revenue Table */}
      <div className="industrial-card overflow-hidden bg-white border border-[#CBD5E1]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#0F172A]">
            <thead className="bg-[#0F172A] text-white font-mono font-bold uppercase tracking-wider">
              <tr>
                <th className="p-4">REF #</th>
                <th className="p-4">SOURCE</th>
                <th className="p-4">TITLE & CLIENT</th>
                <th className="p-4">BOOKED AMOUNT</th>
                <th className="p-4">FX RATES</th>
                <th className="p-4">REALIZED (PKR)</th>
                <th className="p-4">FX GAIN/LOSS</th>
                <th className="p-4">STATUS</th>
                <th className="p-4 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] font-sans">
              {revenues.length > 0 ? (
                revenues.map((rev) => (
                  <tr key={rev.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="p-4 font-mono font-bold">
                      <span className="px-2 py-1 bg-[#CCFBF1] border border-[#99F6E4] rounded text-[#0F766E]">
                        {rev.reference_no}
                      </span>
                    </td>
                    <td className="p-4 font-mono">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                        rev.source_type === 'PROJECT' ? 'bg-[#E0F2FE] text-[#0284C7]' : rev.source_type === 'PRODUCT_SAAS' ? 'bg-[#F0FDFA] text-[#0D9488]' : 'bg-[#F1F5F9] text-[#475569]'
                      }`}>
                        {rev.source_type}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-[#0F172A]">{rev.title}</div>
                      <div className="text-[10px] text-[#64748B] font-mono">Client: {rev.client_name} • {rev.payment_method}</div>
                    </td>
                    <td className="p-4 font-mono text-[#334155]">
                      <div>{rev.currency} {rev.net_amount.toLocaleString()}</div>
                      <div className="text-[9px] text-[#64748B]">Booked PKR {rev.booked_amount_pkr.toLocaleString()}</div>
                    </td>
                    <td className="p-4 font-mono text-[10px]">
                      <div>Booked: <span className="font-bold">{rev.booked_rate}</span></div>
                      <div>Settled: <span className="font-bold text-[#0D9488]">{rev.settlement_rate || rev.booked_rate}</span></div>
                    </td>
                    <td className="p-4 font-mono font-extrabold text-[#0D9488]">
                      PKR {(rev.status === 'CLEARED' ? rev.settled_amount_pkr : rev.booked_amount_pkr).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 font-mono">
                      {rev.status === 'CLEARED' ? (
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                          rev.realized_fx_gain_loss >= 0 ? 'bg-[#ECFDF5] text-[#047857]' : 'bg-[#FEF2F2] text-[#DC2626]'
                        }`}>
                          {rev.realized_fx_gain_loss >= 0 ? '+' : ''}PKR {rev.realized_fx_gain_loss.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#94A3B8]">UNSETTLED</span>
                      )}
                    </td>
                    <td className="p-4 font-mono">
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                        rev.status === 'CLEARED' ? 'bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]' : rev.status === 'PENDING' ? 'bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]' : 'bg-[#FEF2F2] text-[#DC2626]'
                      }`}>
                        {rev.status}
                      </span>
                    </td>
                    <td className="p-4 text-right font-mono flex items-center justify-end gap-1.5">
                      {rev.proof_document_url && (
                        <button
                          onClick={() => handleGetSignedUrl(rev.id)}
                          className="px-2 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#334155] border border-[#CBD5E1] rounded text-[10px] font-bold uppercase transition-colors"
                          title="Get Time-Limited Signed Attachment URL"
                        >
                          📎 PROOF
                        </button>
                      )}

                      {isFinance && rev.status === 'PENDING' && (
                        <button
                          onClick={() => handleOpenSettleModal(rev)}
                          className="px-2.5 py-1 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded text-[10px] font-bold uppercase transition-colors"
                        >
                          SETTLE
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-[#64748B] font-mono">
                    {loading ? 'LOADING REVENUE RECORDS...' : 'NO REVENUE ENTRIES FOUND.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settle & Clear Invoice Modal */}
      {settlingRevenue && (
        <div className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="industrial-card-raised w-full max-w-lg p-6 relative border border-[#CBD5E1] bg-white text-[#0F172A] rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150 font-sans">
            <button onClick={() => setSettlingRevenue(null)} className="absolute top-4 right-4 text-[#64748B] hover:text-[#0F172A] cursor-pointer">
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-sm font-mono font-bold text-[#0F172A] mb-4 uppercase tracking-wider border-b border-[#E2E8F0] pb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#0D9488]" /> SETTLE & CLEAR INVOICE ({settlingRevenue.reference_no})
            </h2>

            <form onSubmit={handleSettleSubmit} className="space-y-4 text-xs font-mono">
              <div className="p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded space-y-1">
                <div className="text-[10px] text-[#64748B] uppercase">BOOKED INVOICE DETAILS</div>
                <div className="font-bold text-[#0F172A]">{settlingRevenue.title}</div>
                <div className="text-[11px] text-[#0D9488]">
                  Amount: {settlingRevenue.currency} {settlingRevenue.net_amount.toLocaleString()} • Booked Rate: {settlingRevenue.booked_rate}
                </div>
              </div>

              <div>
                <label className="block text-[#334155] text-[10px] mb-1 font-bold">SETTLEMENT FX CONVERSION RATE *</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={settleFormData.settlement_rate}
                  onChange={(e) => setSettleFormData({ ...settleFormData, settlement_rate: Number(e.target.value) })}
                  className="w-full p-2.5 rounded industrial-input font-bold text-[#0F172A]"
                />
              </div>

              <div>
                <label className="block text-[#334155] text-[10px] mb-1 font-bold">SETTLEMENT DATE *</label>
                <input
                  type="date"
                  required
                  value={settleFormData.settlement_date}
                  onChange={(e) => setSettleFormData({ ...settleFormData, settlement_date: e.target.value })}
                  className="w-full p-2.5 rounded industrial-input font-mono"
                />
              </div>

              <div className="p-3 bg-[#F0FDFA] border border-[#99F6E4] rounded space-y-1">
                <div className="text-[10px] font-bold text-[#0F766E] uppercase">REALTIME REALIZED FX GAIN / LOSS</div>
                <div className={`text-base font-extrabold ${settleFxGainLossCalc >= 0 ? 'text-[#047857]' : 'text-[#DC2626]'}`}>
                  {settleFxGainLossCalc >= 0 ? '+' : ''}PKR {settleFxGainLossCalc.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-[#134E4A] font-sans">
                  Automatically posts double-entry transaction to Financial Journal & logs audit trail.
                </div>
              </div>

              <div className="pt-2 flex gap-3 font-mono">
                <button
                  type="button"
                  onClick={() => setSettlingRevenue(null)}
                  className="w-1/2 py-2.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] hover:bg-[#E2E8F0] uppercase font-bold cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submittingSettle}
                  className="w-1/2 py-2.5 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold shadow uppercase transition-colors cursor-pointer"
                >
                  {submittingSettle ? 'SETTLING...' : 'CONFIRM SETTLEMENT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Incoming Revenue Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="industrial-card-raised w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto relative border border-[#CBD5E1] bg-white text-[#0F172A] rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150 font-sans">
            <button onClick={() => setShowLogModal(false)} className="absolute top-4 right-4 text-[#64748B] hover:text-[#0F172A] cursor-pointer">
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-sm font-mono font-bold text-[#0F172A] mb-4 uppercase tracking-wider border-b border-[#E2E8F0] pb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#0D9488]" /> LOG INCOMING REVENUE ENTRY
            </h2>

            <form onSubmit={handleLogRevenueSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">SOURCE TYPE *</label>
                  <select
                    value={formData.source_type}
                    onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                    className="w-full p-2.5 rounded industrial-input font-mono"
                  >
                    <option value="PROJECT">CLIENT PROJECT</option>
                    <option value="PRODUCT_SAAS">SAAS / PRODUCT</option>
                    <option value="OTHER">OTHER MISCELLANEOUS</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">PAYMENT METHOD</label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                    className="w-full p-2.5 rounded industrial-input font-mono"
                  >
                    <option value="WIRE_TRANSFER">BANK WIRE TRANSFER</option>
                    <option value="PAYONEER">PAYONEER</option>
                    <option value="STRIPE">STRIPE</option>
                    <option value="CASH">CASH / DIRECT</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">REVENUE TITLE / DESCRIPTION *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q3 Custom ERP Milestone 2 Clearance"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full p-2.5 rounded industrial-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">CLIENT / PAYER NAME</label>
                  <input
                    type="text"
                    placeholder="e.g. Apex Global Tech Solutions"
                    value={formData.client_name}
                    onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                    className="w-full p-2.5 rounded industrial-input"
                  />
                </div>

                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">ACCRUAL DATE *</label>
                  <input
                    type="date"
                    required
                    value={formData.accrual_date}
                    onChange={(e) => setFormData({ ...formData, accrual_date: e.target.value })}
                    className="w-full p-2.5 rounded industrial-input font-mono"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded space-y-3 font-mono">
                <div className="text-[10px] font-bold text-[#0D9488] uppercase">AMOUNT & FX CONVERSION RATES</div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[#334155] text-[10px] mb-1 font-bold">GROSS AMOUNT *</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      value={formData.gross_amount}
                      onChange={(e) => setFormData({ ...formData, gross_amount: Number(e.target.value) })}
                      className="w-full p-2 text-xs rounded industrial-input tabular-nums font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[#DC2626] text-[10px] mb-1 font-bold">TAX DEDUCTED</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.tax_deducted}
                      onChange={(e) => setFormData({ ...formData, tax_deducted: Number(e.target.value) })}
                      className="w-full p-2 text-xs rounded industrial-input tabular-nums font-bold text-[#DC2626]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#0F766E] text-[10px] mb-1 font-bold">NET AMOUNT</label>
                    <input
                      type="number"
                      readOnly
                      value={netAmountCalculated}
                      className="w-full p-2 text-xs rounded industrial-input font-bold bg-[#CCFBF1] text-[#0F766E] cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[#334155] text-[10px] mb-1 font-bold">CURRENCY</label>
                    <select
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      className="w-full p-2 text-xs rounded industrial-input font-mono"
                    >
                      <option value="PKR">PKR (Pakistani Rupee)</option>
                      <option value="USD">USD (US Dollar)</option>
                      <option value="EUR">EUR (Euro)</option>
                      <option value="GBP">GBP (British Pound)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#334155] text-[10px] mb-1 font-bold">BOOKED FX RATE TO PKR</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={formData.booked_rate}
                      onChange={(e) => setFormData({ ...formData, booked_rate: Number(e.target.value) })}
                      className="w-full p-2 text-xs rounded industrial-input font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="p-2 bg-[#F0FDFA] border border-[#99F6E4] rounded text-right text-xs">
                  <span className="text-[10px] text-[#64748B] uppercase block">TOTAL BOOKED PKR VALUE:</span>
                  <span className="font-extrabold text-[#0D9488] text-sm">PKR {pkrBookedCalculated.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="pt-2 flex gap-3 font-mono">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="w-1/2 py-2.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] hover:bg-[#E2E8F0] uppercase font-bold cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-1/2 py-2.5 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold shadow uppercase transition-colors cursor-pointer"
                >
                  {submitting ? 'LOGGING...' : 'LOG REVENUE INVOICE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
