import React, { useState, useEffect, useRef } from 'react';
import {
  Receipt, Plus, CheckCircle, XCircle, CreditCard, Eye, X, Upload, Calendar,
  DollarSign, FileText, Search, Filter, AlertCircle, CheckCircle2, Clock, Edit3, Lock, RefreshCw
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export const ExpensesPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const isHR = user?.role === 'Super Admin' || user?.role === 'HR Manager';

  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Modal 1: Create / Edit Claim Modal State
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);
  const [editingClaimStatus, setEditingClaimStatus] = useState<string>('pending');
  const [claimCategory, setClaimCategory] = useState('Travel');
  const [claimAmount, setClaimAmount] = useState('');
  const [claimDescription, setClaimDescription] = useState('');
  const [claimDate, setClaimDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptBase64, setReceiptBase64] = useState<string>('');
  const [existingReceiptName, setExistingReceiptName] = useState<string | null>(null);
  const [submittingClaim, setSubmittingClaim] = useState(false);

  // Modal 2: Read-Only Claim Details Modal State
  const [selectedClaim, setSelectedClaim] = useState<any>(null);

  // Modal 3: Reject Claim Modal State (HR)
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectClaimId, setRejectClaimId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // Modal 4: Custom Confirm Action Modal (Replaces window.confirm)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    variant?: 'danger' | 'warning' | 'teal' | 'cyan';
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Container Refs for Backdrop Clickaway Listeners
  const fileModalRef = useRef<HTMLDivElement>(null);
  const detailsModalRef = useRef<HTMLDivElement>(null);
  const rejectModalRef = useRef<HTMLDivElement>(null);
  const confirmModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchExpenses();
  }, []);

  // Clickaway & Escape Key Handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fileModalRef.current && !fileModalRef.current.contains(event.target as Node)) {
        setIsFileModalOpen(false);
      }
      if (detailsModalRef.current && !detailsModalRef.current.contains(event.target as Node)) {
        setSelectedClaim(null);
      }
      if (rejectModalRef.current && !rejectModalRef.current.contains(event.target as Node)) {
        setIsRejectModalOpen(false);
      }
      if (confirmModalRef.current && !confirmModalRef.current.contains(event.target as Node)) {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsFileModalOpen(false);
        setSelectedClaim(null);
        setIsRejectModalOpen(false);
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const fetchExpenses = async () => {
    try {
      const res = await api.get('/expenses');
      setExpenses(res.data.expenses || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingClaimId(null);
    setEditingClaimStatus('pending');
    setClaimCategory('Travel');
    setClaimAmount('');
    setClaimDescription('');
    setClaimDate(new Date().toISOString().split('T')[0]);
    setReceiptFile(null);
    setReceiptBase64('');
    setExistingReceiptName(null);
    setIsFileModalOpen(true);
  };

  const handleOpenEditModal = (claim: any) => {
    // State Lifecycle Guard: Do not allow editing if claim is approved or reimbursed
    const s = claim.status.toLowerCase();
    if (s === 'approved' || s === 'reimbursed') {
      setSelectedClaim(claim);
      return;
    }

    setEditingClaimId(claim.id);
    setEditingClaimStatus(s);
    setClaimCategory(claim.category || 'Travel');
    setClaimAmount(claim.amount ? String(claim.amount) : '');
    setClaimDescription(claim.description || '');
    setClaimDate(claim.claim_date || new Date().toISOString().split('T')[0]);
    setReceiptFile(null);
    setReceiptBase64('');
    setExistingReceiptName(claim.receipt_filename || null);
    setIsFileModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds 5MB limit');
        return;
      }
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimAmount || parseFloat(claimAmount) <= 0) {
      alert('Please enter a valid expense amount');
      return;
    }
    setSubmittingClaim(true);
    try {
      const payload = {
        category: claimCategory,
        amount: parseFloat(claimAmount),
        description: claimDescription,
        claim_date: claimDate,
        receipt_filename: receiptFile?.name || existingReceiptName || null,
        receipt_data: receiptBase64 || null
      };

      if (editingClaimId) {
        // Resubmit / Update workflow: PUT /expenses/<id>
        await api.put(`/expenses/${editingClaimId}`, payload);
      } else {
        // Create workflow: POST /expenses
        await api.post('/expenses', payload);
      }

      setIsFileModalOpen(false);
      setEditingClaimId(null);
      setClaimAmount('');
      setClaimDescription('');
      setReceiptFile(null);
      setReceiptBase64('');
      fetchExpenses();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to submit expense claim');
    } finally {
      setSubmittingClaim(false);
    }
  };

  const handleApprove = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'APPROVE EXPENSE CLAIM',
      message: 'Are you sure you want to approve this expense claim for reimbursement?',
      confirmText: 'APPROVE CLAIM',
      variant: 'teal',
      onConfirm: async () => {
        try {
          await api.put(`/expenses/${id}/approve`);
          fetchExpenses();
        } catch (e: any) {
          alert(e.response?.data?.error?.message || 'Approval failed');
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectClaimId) return;
    setSubmittingReject(true);
    try {
      await api.put(`/expenses/${rejectClaimId}/reject`, { reason: rejectionReason });
      setIsRejectModalOpen(false);
      setRejectClaimId(null);
      setRejectionReason('');
      fetchExpenses();
    } catch (e: any) {
      alert(e.response?.data?.error?.message || 'Rejection failed');
    } finally {
      setSubmittingReject(false);
    }
  };



  const filteredExpenses = expenses.filter((e) => {
    if (statusFilter !== 'all' && e.status.toLowerCase() !== statusFilter.toLowerCase()) {
      return false;
    }
    if (categoryFilter !== 'all' && e.category.toLowerCase() !== categoryFilter.toLowerCase()) {
      return false;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case 'approved':
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-bold bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] rounded uppercase flex items-center gap-1 w-max">
            <CheckCircle2 className="w-3 h-3 text-[#047857]" /> APPROVED
          </span>
        );
      case 'reimbursed':
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-bold bg-[#ECFEFF] text-[#0891B2] border border-[#A5F3FC] rounded uppercase flex items-center gap-1 w-max">
            <CreditCard className="w-3 h-3 text-[#0891B2]" /> REIMBURSED
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-bold bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] rounded uppercase flex items-center gap-1 w-max">
            <XCircle className="w-3 h-3 text-[#DC2626]" /> REJECTED
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-bold bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A] rounded uppercase flex items-center gap-1 w-max">
            <Clock className="w-3 h-3 text-[#D97706]" /> PENDING
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 industrial-card p-6 bg-white border border-[#CBD5E1]">
        <div>
          <h1 className="text-lg font-bold text-[#0F172A] flex items-center gap-2 font-mono uppercase tracking-wider">
            <Receipt className="w-5 h-5 text-[#0D9488]" />
            EXPENSE CLAIMS & REIMBURSEMENTS
          </h1>
          <p className="text-xs text-[#64748B] mt-1 font-sans">
            Travel, equipment procurement, client entertainment & utility reimbursement claims
          </p>
        </div>

        {/* Primary CTA Button - Visible to both Employees and Admins */}
        <button
          onClick={handleOpenCreateModal}
          className="py-2.5 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-md uppercase tracking-wider shrink-0"
        >
          <Plus className="w-4 h-4 text-white" />
          FILE EXPENSE CLAIM
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 font-mono text-xs">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg border border-[#CBD5E1]">
          {[
            { key: 'all', label: 'All Claims' },
            { key: 'pending', label: 'Pending Approval' },
            { key: 'approved', label: 'Approved' },
            { key: 'reimbursed', label: 'Reimbursed' },
            { key: 'rejected', label: 'Rejected' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md font-bold text-[11px] uppercase transition-all ${
                statusFilter === tab.key
                  ? 'bg-white text-[#0F172A] shadow-xs border border-[#CBD5E1]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: 'all', label: 'All Categories' },
            { key: 'Travel', label: 'Travel' },
            { key: 'Equipment Procurement', label: 'Equipment' },
            { key: 'Office Supplies', label: 'Supplies' },
            { key: 'Internet / Utility', label: 'Utility' }
          ].map((cat) => (
            <button
              key={cat.key}
              onClick={() => setCategoryFilter(cat.key)}
              className={`px-2.5 py-1 rounded border text-[10px] font-bold uppercase transition-all ${
                categoryFilter === cat.key
                  ? 'bg-[#0D9488] text-white border-[#0D9488]'
                  : 'bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F8FAFC]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Expense Claims Table */}
      <div className="industrial-card overflow-hidden bg-white border border-[#CBD5E1]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#0F172A]">
            <thead className="bg-[#0F172A] text-white font-mono font-bold uppercase tracking-wider">
              <tr>
                <th className="p-4">CLAIMANT</th>
                <th className="p-4">CATEGORY</th>
                <th className="p-4">AMOUNT (PKR)</th>
                <th className="p-4">CLAIM DATE</th>
                <th className="p-4">DESCRIPTION</th>
                <th className="p-4">STATUS</th>
                <th className="p-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] font-mono">
              {filteredExpenses.length > 0 ? (
                filteredExpenses.map((e) => {
                  const s = (e.status || '').toLowerCase();
                  const isLocked = s === 'approved' || s === 'reimbursed';
                  const isOwner = e.employee_id === user?.employee?.id;

                  return (
                    <tr key={e.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="p-4 font-sans font-medium text-[#0F172A]">
                        <div>{e.employee_name}</div>
                        <div className="text-[10px] font-mono text-[#64748B]">{e.employee_code}</div>
                      </td>
                      <td className="p-4 text-[#0D9488] font-bold uppercase">{e.category}</td>
                      <td className="p-4 font-extrabold tabular-nums text-[#0F172A] text-sm">
                        PKR {e.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-[#64748B]">{e.claim_date}</td>
                      <td className="p-4 font-sans text-[#334155] max-w-xs truncate">{e.description || '—'}</td>
                      <td className="p-4">{getStatusBadge(e.status)}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* DETAILS Button - Opens Read-Only Modal View */}
                          <button
                            onClick={() => setSelectedClaim(e)}
                            className="px-2 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#334155] rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1 border border-[#CBD5E1]"
                            title="View Read-Only Claim Details & Logs"
                          >
                            <Eye className="w-3 h-3" /> DETAILS
                          </button>

                          {/* EDIT / RESUBMIT Button - Only allowed for PENDING or REJECTED claims for claim owner */}
                          {!isLocked && (isOwner || !isHR) && (
                            <button
                              onClick={() => handleOpenEditModal(e)}
                              className="px-2 py-1 bg-[#F0FDFA] hover:bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4] rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
                              title={s === 'rejected' ? 'Edit details & resubmit for HR evaluation' : 'Update claim details'}
                            >
                              {s === 'rejected' ? <RefreshCw className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
                              {s === 'rejected' ? 'RESUBMIT' : 'EDIT'}
                            </button>
                          )}

                          {/* HR Administrative Actions - Only Approve and Reject */}
                          {isHR && s === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(e.id)}
                                className="px-2 py-1 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
                                title="Approve Expense Claim for Monthly Payroll Reimbursement"
                              >
                                <CheckCircle className="w-3 h-3" /> APPROVE
                              </button>
                              <button
                                onClick={() => {
                                  setRejectClaimId(e.id);
                                  setRejectionReason('');
                                  setIsRejectModalOpen(true);
                                }}
                                className="px-2 py-1 bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA] rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
                                title="Reject Claim with Reason"
                              >
                                <XCircle className="w-3 h-3" /> REJECT
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-[#64748B] font-mono">
                    {loading ? 'LOADING CLAIMS...' : 'NO EXPENSE CLAIMS FOUND MATCHING FILTERS.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Create / Edit Expense Claim Modal */}
      {isFileModalOpen && (
        <div
          className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (fileModalRef.current && !fileModalRef.current.contains(e.target as Node)) {
              setIsFileModalOpen(false);
            }
          }}
        >
          <div ref={fileModalRef} className="bg-white border border-[#CBD5E1] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between font-mono">
              <h3 className="text-xs font-bold text-[#0F172A] uppercase flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#0D9488]" />
                {editingClaimId
                  ? editingClaimStatus === 'rejected'
                    ? 'EDIT & RESUBMIT REJECTED EXPENSE CLAIM'
                    : 'UPDATE EXPENSE CLAIM DETAILS'
                  : 'FILE NEW EXPENSE CLAIM'}
              </h3>
              <button onClick={() => setIsFileModalOpen(false)} className="text-[#64748B] hover:text-[#0F172A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitClaim} className="p-5 space-y-4 font-mono text-xs">
              {editingClaimStatus === 'rejected' && (
                <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs space-y-1">
                  <div className="font-bold text-[#DC2626] uppercase flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> CLAIM WAS PREVIOUSLY REJECTED
                  </div>
                  <div className="text-[11px] text-[#991B1B] font-sans">
                    Updating and submitting this claim will transition its status back to <b>PENDING</b> for HR re-evaluation.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Expense Category *</label>
                  <select
                    value={claimCategory}
                    onChange={(e) => setClaimCategory(e.target.value)}
                    className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] rounded"
                  >
                    <option value="Travel">Travel & Lodging</option>
                    <option value="Equipment Procurement">Equipment Procurement</option>
                    <option value="Client Entertainment">Client Entertainment</option>
                    <option value="Office Supplies">Office Supplies</option>
                    <option value="Internet / Utility">Internet / Utility</option>
                    <option value="Other">Other Business Expense</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Claim Date *</label>
                  <input
                    type="date"
                    required
                    value={claimDate}
                    onChange={(e) => setClaimDate(e.target.value)}
                    className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] rounded font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Amount (PKR) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-[#64748B] font-bold text-xs">PKR</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={claimAmount}
                    onChange={(e) => setClaimAmount(e.target.value)}
                    className="w-full pl-12 pr-4 py-2.5 industrial-input bg-white border border-[#CBD5E1] rounded font-mono font-bold text-sm text-[#0F172A]"
                  />
                </div>
                {claimAmount && !isNaN(parseFloat(claimAmount)) && (
                  <div className="mt-1 text-[11px] text-[#0D9488] font-mono font-semibold">
                    Formatted: PKR {parseFloat(claimAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Business Justification / Notes</label>
                <textarea
                  rows={3}
                  placeholder="Describe purpose of expense, client name, or project scope..."
                  value={claimDescription}
                  onChange={(e) => setClaimDescription(e.target.value)}
                  className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] font-sans resize-none rounded"
                />
              </div>

              {/* Receipt File Drag and Drop Dropzone */}
              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Receipt Attachment (PDF / PNG / JPG max 5MB)</label>
                <div className="border-2 border-dashed border-[#CBD5E1] hover:border-[#0D9488] rounded-lg p-4 text-center bg-[#F8FAFC] transition-colors relative cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className="w-5 h-5 text-[#0D9488] mx-auto mb-1" />
                  {receiptFile ? (
                    <div className="text-xs font-bold text-[#0D9488] flex items-center justify-center gap-1 font-mono">
                      <span>✓ {receiptFile.name}</span>
                      <span className="text-[10px] text-[#64748B]">({(receiptFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  ) : existingReceiptName ? (
                    <div className="text-xs font-bold text-[#0D9488] font-mono">
                      <span>📎 Current: {existingReceiptName}</span>
                      <div className="text-[10px] text-[#64748B]">Click or drag to replace attachment</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-[#64748B]">
                      Drag & drop receipt here, or <span className="text-[#0D9488] font-bold underline">browse files</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsFileModalOpen(false)}
                  className="py-2 px-4 rounded bg-[#F1F5F9] text-[#475569] font-bold hover:bg-[#E2E8F0] uppercase tracking-wider text-[11px]"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submittingClaim}
                  className="py-2 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5"
                >
                  {editingClaimId && editingClaimStatus === 'rejected' ? <RefreshCw className="w-3.5 h-3.5" /> : null}
                  {submittingClaim
                    ? 'PROCESSING...'
                    : editingClaimId
                    ? editingClaimStatus === 'rejected'
                      ? 'RESUBMIT CLAIM FOR EVALUATION'
                      : 'SAVE CHANGES'
                    : 'SUBMIT CLAIM'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Strictly Read-Only Claim Details & Disbursement Logs Modal */}
      {selectedClaim && (
        <div
          className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (detailsModalRef.current && !detailsModalRef.current.contains(e.target as Node)) {
              setSelectedClaim(null);
            }
          }}
        >
          <div ref={detailsModalRef} className="bg-white border border-[#CBD5E1] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between font-mono">
              <h3 className="text-xs font-bold text-[#0F172A] uppercase flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#0D9488]" /> READ-ONLY CLAIM RECORD #{selectedClaim.id.substring(0, 8)}
              </h3>
              <button onClick={() => setSelectedClaim(null)} className="text-[#64748B] hover:text-[#0F172A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 font-mono text-xs">
              {/* Dynamic State Lifecycle Guard Banner */}
              {selectedClaim.status.toLowerCase() === 'reimbursed' ? (
                <div className="p-3 bg-[#ECFEFF] border border-[#A5F3FC] rounded text-xs space-y-0.5">
                  <div className="font-bold text-[#0891B2] uppercase flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> FINALIZED & PAID (READ-ONLY)
                  </div>
                  <div className="text-[11px] text-[#0E7490] font-sans">
                    This claim has been processed in monthly payroll and disbursed to the employee. No further edits permitted.
                  </div>
                </div>
              ) : selectedClaim.status.toLowerCase() === 'approved' ? (
                <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded text-xs space-y-0.5">
                  <div className="font-bold text-[#047857] uppercase flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" /> APPROVED FOR PAYROLL (READ-ONLY)
                  </div>
                  <div className="text-[11px] text-[#065F46] font-sans">
                    This claim has been approved by HR/Finance and locked for the upcoming payroll run.
                  </div>
                </div>
              ) : selectedClaim.status.toLowerCase() === 'rejected' ? (
                <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded text-xs space-y-0.5">
                  <div className="font-bold text-[#DC2626] uppercase flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> REJECTED CLAIM
                  </div>
                  <div className="text-[11px] text-[#991B1B] font-sans">
                    Reason: <b>{selectedClaim.rejection_reason || 'Declined by HR'}</b>. Click RESUBMIT to update receipt or details.
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded text-xs space-y-0.5">
                  <div className="font-bold text-[#D97706] uppercase flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> PENDING EVALUATION
                  </div>
                  <div className="text-[11px] text-[#B45309] font-sans">
                    This claim is awaiting HR / Finance approval.
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded">
                <div>
                  <div className="text-[10px] text-[#0D9488] font-bold uppercase">Claim Amount</div>
                  <div className="text-lg font-extrabold text-[#0F172A]">
                    PKR {selectedClaim.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>{getStatusBadge(selectedClaim.status)}</div>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div><span className="text-[#64748B] uppercase font-bold">Claimant:</span> <span className="font-sans font-semibold text-[#0F172A]">{selectedClaim.employee_name} ({selectedClaim.employee_code})</span></div>
                <div><span className="text-[#64748B] uppercase font-bold">Category:</span> <span className="text-[#0D9488] font-bold">{selectedClaim.category}</span></div>
                <div><span className="text-[#64748B] uppercase font-bold">Claim Date:</span> <span>{selectedClaim.claim_date}</span></div>
                <div><span className="text-[#64748B] uppercase font-bold">Description:</span> <p className="font-sans text-[#334155] mt-0.5 bg-[#F8FAFC] p-2 rounded border border-[#E2E8F0]">{selectedClaim.description || 'No description provided.'}</p></div>
                {selectedClaim.receipt_filename && (
                  <div><span className="text-[#64748B] uppercase font-bold">Receipt Attachment:</span> <span className="text-[#0D9488] font-bold">📎 {selectedClaim.receipt_filename}</span></div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                {selectedClaim.status.toLowerCase() === 'rejected' && (selectedClaim.employee_id === user?.employee?.id || !isHR) && (
                  <button
                    type="button"
                    onClick={() => {
                      const claimToEdit = selectedClaim;
                      setSelectedClaim(null);
                      handleOpenEditModal(claimToEdit);
                    }}
                    className="py-2 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold uppercase tracking-wider text-[11px] flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> RESUBMIT CLAIM
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedClaim(null)}
                  className="py-2 px-4 rounded bg-[#F1F5F9] text-[#475569] font-bold hover:bg-[#E2E8F0] uppercase text-[11px]"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Reject Expense Modal (HR Only) */}
      {isRejectModalOpen && rejectClaimId && (
        <div
          className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (rejectModalRef.current && !rejectModalRef.current.contains(e.target as Node)) {
              setIsRejectModalOpen(false);
            }
          }}
        >
          <div ref={rejectModalRef} className="bg-white border border-[#CBD5E1] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="p-4 bg-[#FEF2F2] border-b border-[#FECACA] flex items-center justify-between font-mono">
              <h3 className="text-xs font-bold text-[#DC2626] uppercase flex items-center gap-2">
                <XCircle className="w-4 h-4 text-[#DC2626]" /> REJECT EXPENSE CLAIM
              </h3>
              <button onClick={() => setIsRejectModalOpen(false)} className="text-[#64748B] hover:text-[#0F172A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRejectSubmit} className="p-5 space-y-4 font-mono text-xs">
              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">
                  Rejection Reason / Justification *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Provide reason for declining claim (e.g. Missing valid receipt document or non-compliant category)..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] font-sans resize-none rounded"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsRejectModalOpen(false)}
                  className="py-2 px-4 rounded bg-[#F1F5F9] text-[#475569] font-bold hover:bg-[#E2E8F0] uppercase tracking-wider text-[11px]"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submittingReject}
                  className="py-2 px-4 rounded bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold uppercase tracking-wider text-[11px]"
                >
                  {submittingReject ? 'REJECTING...' : 'CONFIRM REJECTION'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Custom Confirm Modal */}
      {confirmModal.isOpen && (
        <div
          className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (confirmModalRef.current && !confirmModalRef.current.contains(e.target as Node)) {
              setConfirmModal((prev) => ({ ...prev, isOpen: false }));
            }
          }}
        >
          <div ref={confirmModalRef} className="bg-white border border-[#CBD5E1] rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between font-mono">
              <h3 className="text-xs font-bold text-[#0F172A] uppercase flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#D97706]" /> {confirmModal.title}
              </h3>
              <button onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))} className="text-[#64748B] hover:text-[#0F172A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 font-mono text-xs">
              <p className="text-[#334155] font-sans text-xs">{confirmModal.message}</p>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                  className="py-2 px-4 rounded bg-[#F1F5F9] text-[#475569] font-bold hover:bg-[#E2E8F0] uppercase tracking-wider text-[11px]"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={confirmModal.onConfirm}
                  className={`py-2 px-4 rounded text-white font-bold uppercase tracking-wider text-[11px] ${
                    confirmModal.variant === 'danger'
                      ? 'bg-[#DC2626] hover:bg-[#B91C1C]'
                      : confirmModal.variant === 'warning'
                      ? 'bg-[#D97706] hover:bg-[#B45309]'
                      : confirmModal.variant === 'cyan'
                      ? 'bg-[#0891B2] hover:bg-[#0E7490]'
                      : 'bg-[#0D9488] hover:bg-[#0F766E]'
                  }`}
                >
                  {confirmModal.confirmText || 'CONFIRM'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
