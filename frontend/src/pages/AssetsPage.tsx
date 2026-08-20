import React, { useState, useEffect } from 'react';
import {
  Package, Plus, Wrench, Trash2, UserCheck, RotateCcw, X, Filter, Laptop, Smartphone,
  Radio, Cpu, Search, Send, CheckCircle2, Clock, XCircle, AlertCircle, MessageSquare
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export const AssetsPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const isHR = user?.role === 'Super Admin' || user?.role === 'HR Manager';

  const [assets, setAssets] = useState<any[]>([]);
  const [assetRequests, setAssetRequests] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');

  // Modal States - Add Asset
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submittingAsset, setSubmittingAsset] = useState(false);
  const [assetTag, setAssetTag] = useState('');
  const [assetCategory, setAssetCategory] = useState('laptop');
  const [assetModel, setAssetModel] = useState('');
  const [assetSerial, setAssetSerial] = useState('');

  // Modal States - Assign Asset
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);
  const [assignNotes, setAssignNotes] = useState('');
  const [submittingAssign, setSubmittingAssign] = useState(false);

  // Modal States - Request Asset (Replaces window.prompt)
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [targetAssetForRequest, setTargetAssetForRequest] = useState<any>(null);
  const [requestReasonNote, setRequestReasonNote] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Modal States - Reject Request (HR)
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [targetRequestForReject, setTargetRequestForReject] = useState<any>(null);
  const [rejectionReasonNote, setRejectionReasonNote] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // Modal States - Confirm Actions (Replaces window.confirm)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    variant?: 'danger' | 'warning' | 'teal';
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Refs for Backdrop / Clickaway Listeners
  const employeeComboboxRef = React.useRef<HTMLDivElement>(null);
  const addModalRef = React.useRef<HTMLDivElement>(null);
  const assignModalRef = React.useRef<HTMLDivElement>(null);
  const requestModalRef = React.useRef<HTMLDivElement>(null);
  const rejectModalRef = React.useRef<HTMLDivElement>(null);
  const confirmModalRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAssets();
    fetchAssetRequests();
    if (isHR) fetchEmployees();
  }, []);

  // Backdrop clickaway & Escape key handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (employeeComboboxRef.current && !employeeComboboxRef.current.contains(event.target as Node)) {
        setIsEmployeeDropdownOpen(false);
      }
      if (requestModalRef.current && !requestModalRef.current.contains(event.target as Node)) {
        setIsRequestModalOpen(false);
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
        setIsEmployeeDropdownOpen(false);
        setIsAddModalOpen(false);
        setIsAssignModalOpen(false);
        setIsRequestModalOpen(false);
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

  const fetchAssets = async () => {
    try {
      const res = await api.get('/assets');
      setAssets(res.data.assets || []);
    } catch (e) {
      console.error('Error fetching assets', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssetRequests = async () => {
    try {
      const res = await api.get('/assets/requests');
      setAssetRequests(res.data.requests || []);
    } catch (e) {
      console.error('Error fetching asset requests', e);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/employees');
      setEmployees(res.data.employees || []);
    } catch (e) {
      console.error('Error fetching employees', e);
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingAsset(true);
    try {
      await api.post('/assets', {
        asset_tag: assetTag,
        category: assetCategory,
        model: assetModel,
        serial_number: assetSerial
      });
      setIsAddModalOpen(false);
      setAssetTag('');
      setAssetModel('');
      setAssetSerial('');
      fetchAssets();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to create asset');
    } finally {
      setSubmittingAsset(false);
    }
  };

  const handleAssignAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset || !selectedEmployeeId) return;
    setSubmittingAssign(true);
    try {
      await api.post(`/assets/${selectedAsset.id}/assign`, {
        employee_id: selectedEmployeeId,
        notes: assignNotes
      });
      setIsAssignModalOpen(false);
      setSelectedAsset(null);
      setSelectedEmployeeId('');
      setAssignNotes('');
      fetchAssets();
      fetchAssetRequests();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to assign asset');
    } finally {
      setSubmittingAssign(false);
    }
  };

  const handleSubmitAssetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetAssetForRequest) return;
    setSubmittingRequest(true);
    try {
      await api.post(`/assets/${targetAssetForRequest.id}/request`, {
        reason: requestReasonNote
      });
      setIsRequestModalOpen(false);
      setTargetAssetForRequest(null);
      setRequestReasonNote('');
      fetchAssets();
      fetchAssetRequests();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to submit asset request');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleApproveRequest = async (requestId: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'APPROVE ASSET REQUEST',
      message: 'Are you sure you want to approve this request and automatically assign the asset to the requesting employee?',
      confirmText: 'APPROVE & ASSIGN',
      variant: 'teal',
      onConfirm: async () => {
        try {
          await api.post(`/assets/requests/${requestId}/approve`);
          fetchAssets();
          fetchAssetRequests();
        } catch (err: any) {
          alert(err.response?.data?.error?.message || 'Failed to approve asset request');
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleSubmitRejectRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetRequestForReject) return;
    setSubmittingReject(true);
    try {
      await api.post(`/assets/requests/${targetRequestForReject.id}/reject`, {
        rejection_reason: rejectionReasonNote
      });
      setIsRejectModalOpen(false);
      setTargetRequestForReject(null);
      setRejectionReasonNote('');
      fetchAssets();
      fetchAssetRequests();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to reject asset request');
    } finally {
      setSubmittingReject(false);
    }
  };

  const handleReturnAsset = (assetId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'RETURN ASSET TO STOCK',
      message: 'Are you sure you want to return this hardware asset to available stock inventory?',
      confirmText: 'RETURN TO STOCK',
      variant: 'warning',
      onConfirm: async () => {
        try {
          await api.post(`/assets/${assetId}/return`);
          fetchAssets();
          fetchAssetRequests();
        } catch (err: any) {
          alert(err.response?.data?.error?.message || 'Failed to return asset');
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const handleUpdateStatus = (assetId: string, status: string) => {
    const actionLabel = status === 'under_repair' ? 'mark under repair' : status === 'decommissioned' ? 'decommission' : 'mark available';
    setConfirmModal({
      isOpen: true,
      title: `CONFIRM STATUS CHANGE`,
      message: `Are you sure you want to ${actionLabel} this hardware asset?`,
      confirmText: status.toUpperCase(),
      variant: status === 'decommissioned' ? 'danger' : 'warning',
      onConfirm: async () => {
        try {
          await api.put(`/assets/${assetId}/status`, { status });
          fetchAssets();
          fetchAssetRequests();
        } catch (err: any) {
          alert(err.response?.data?.error?.message || 'Failed to update asset status');
        } finally {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        }
      }
    });
  };

  const filteredAssets = assets.filter((a) => {
    if (scopeFilter === 'mine') {
      if (a.assigned_to?.employee_id !== user?.employee?.id) return false;
    } else if (scopeFilter === 'available') {
      if (a.status !== 'available') return false;
    }

    if (categoryFilter === 'all') return true;
    const cat = (a.category || '').toLowerCase();
    if (categoryFilter === 'laptop') return cat.includes('laptop') || cat.includes('notebook');
    if (categoryFilter === 'mobile') return cat.includes('mobile') || cat.includes('phone') || cat.includes('tablet');
    if (categoryFilter === 'sim') return cat.includes('sim') || cat.includes('card');
    if (categoryFilter === 'workstation') return cat.includes('workstation') || cat.includes('desktop') || cat.includes('hardware');
    return cat === categoryFilter;
  });

  const getStatusBadge = (asset: any) => {
    if (asset.pending_request) {
      return (
        <span className="px-2.5 py-0.5 text-[10px] font-bold bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A] rounded uppercase flex items-center gap-1">
          <Clock className="w-3 h-3 text-[#D97706]" /> REQUEST PENDING
        </span>
      );
    }

    switch (asset.status) {
      case 'assigned':
        return <span className="px-2.5 py-0.5 text-[10px] font-bold bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4] rounded uppercase">ASSIGNED</span>;
      case 'available':
        return <span className="px-2.5 py-0.5 text-[10px] font-bold bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] rounded uppercase">AVAILABLE</span>;
      case 'under_repair':
        return <span className="px-2.5 py-0.5 text-[10px] font-bold bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A] rounded uppercase">UNDER REPAIR</span>;
      case 'decommissioned':
        return <span className="px-2.5 py-0.5 text-[10px] font-bold bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] rounded uppercase">DECOMMISSIONED</span>;
      default:
        return <span className="px-2.5 py-0.5 text-[10px] font-bold bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1] rounded uppercase">{asset.status}</span>;
    }
  };

  const isEmployee = user?.role === 'Employee';
  const isDeptManager = user?.role === 'Department Manager';

  const sortedAssets = [...filteredAssets].sort((a, b) =>
    (a.asset_tag || '').localeCompare(b.asset_tag || '', undefined, { numeric: true, sensitivity: 'base' })
  );

  const pendingRequestsList = assetRequests.filter((r) => r.status === 'PENDING');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 industrial-card p-6 bg-white border border-[#CBD5E1]">
        <div>
          <h1 className="text-lg font-bold text-[#0F172A] flex items-center gap-2 font-mono uppercase tracking-wider">
            <Package className="w-5 h-5 text-[#0D9488]" />
            {isEmployee
              ? 'HARDWARE CATALOG & MY ASSIGNED ASSETS'
              : isDeptManager
              ? 'DEPARTMENT ASSETS INVENTORY'
              : 'COMPANY ASSET INVENTORY & HARDWARE TRACKING'}
          </h1>
          <p className="text-xs text-[#64748B] mt-1 font-sans">
            {isEmployee
              ? 'View your assigned hardware or request available company devices'
              : isDeptManager
              ? 'Hardware & devices assigned to your department team members'
              : 'Laptops, Mobile Devices, SIM Cards & Workstation Hardware Assignment Registry'}
          </p>
        </div>

        {isHR && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="py-2.5 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-md uppercase tracking-wider shrink-0"
          >
            <Plus className="w-4 h-4 text-white" />
            ADD NEW ASSET
          </button>
        )}
      </div>

      {/* Admin Queue Panel: PENDING ASSET REQUESTS */}
      {isHR && pendingRequestsList.length > 0 && (
        <div className="industrial-card bg-white border border-[#CBD5E1] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-[#0F172A] font-mono uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#D97706]" />
              PENDING ASSET ASSIGNMENT REQUESTS
              <span className="px-2 py-0.5 text-[10px] bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A] rounded-full font-mono font-bold">
                {pendingRequestsList.length} PENDING
              </span>
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#0F172A]">
              <thead className="bg-[#1E293B] text-white font-mono font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-3">REQUESTED AT</th>
                  <th className="p-3">EMPLOYEE</th>
                  <th className="p-3">ASSET TAG / MODEL</th>
                  <th className="p-3">PURPOSE / NOTES</th>
                  <th className="p-3 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] font-mono">
                {pendingRequestsList.map((req) => (
                  <tr key={req.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="p-3 text-[#64748B] whitespace-nowrap">{req.requested_at}</td>
                    <td className="p-3 font-sans">
                      <div className="font-semibold text-[#0F172A]">{req.employee_name}</div>
                      <div className="text-[10px] text-[#64748B] font-mono">{req.employee_code}</div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-[#0D9488]">{req.asset_tag}</div>
                      <div className="text-[10px] text-[#334155] font-sans">{req.asset_model}</div>
                    </td>
                    <td className="p-3 font-sans text-[#475569]">{req.notes || '—'}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleApproveRequest(req.id)}
                          className="px-2.5 py-1 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1 shrink-0"
                          title="Approve request & assign asset"
                        >
                          <UserCheck className="w-3 h-3" /> APPROVE & ASSIGN
                        </button>
                        <button
                          onClick={() => {
                            setTargetRequestForReject(req);
                            setRejectionReasonNote('');
                            setIsRejectModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA] rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1 shrink-0"
                          title="Reject asset request"
                        >
                          <XCircle className="w-3 h-3" /> REJECT
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Scope & Category Filter Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 font-mono text-xs">
        {/* Scope Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-lg border border-[#CBD5E1]">
          {[
            { key: 'all', label: 'All Items' },
            { key: 'mine', label: 'My Assigned' },
            { key: 'available', label: 'Available Stock' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setScopeFilter(tab.key)}
              className={`px-3 py-1.5 rounded-md font-bold text-[11px] uppercase transition-all ${
                scopeFilter === tab.key
                  ? 'bg-white text-[#0F172A] shadow-xs border border-[#CBD5E1]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'all', label: 'All Categories', icon: Package },
            { key: 'laptop', label: 'Laptops', icon: Laptop },
            { key: 'mobile', label: 'Mobile Devices', icon: Smartphone },
            { key: 'sim', label: 'SIM Cards', icon: Radio },
            { key: 'workstation', label: 'Workstations', icon: Cpu }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = categoryFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setCategoryFilter(tab.key)}
                className={`px-3.5 py-1.5 rounded-lg border font-bold transition-all uppercase tracking-wider text-[11px] flex items-center gap-2 ${
                  isActive
                    ? 'bg-[#0D9488] text-white border-[#0D9488] shadow-xs'
                    : 'bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F8FAFC]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-[#0D9488]'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Asset Table */}
      <div className="industrial-card overflow-hidden bg-white border border-[#CBD5E1]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#0F172A]">
            <thead className="bg-[#0F172A] text-white font-mono font-bold uppercase tracking-wider">
              <tr>
                <th className="p-4">TAG ID</th>
                <th className="p-4">CATEGORY</th>
                <th className="p-4">MODEL / SPEC</th>
                <th className="p-4">SERIAL NUMBER</th>
                <th className="p-4">ASSIGNED TO</th>
                <th className="p-4">STATUS</th>
                <th className="p-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] font-mono">
              {sortedAssets.length > 0 ? (
                sortedAssets.map((a) => {
                  const isAssignedToCurrent = a.assigned_to?.employee_id === user?.employee?.id;
                  const hasPendingReq = Boolean(a.pending_request);
                  const isRequestedByMe = a.pending_request?.requested_by_me;

                  return (
                    <tr key={a.id} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="p-4 font-bold text-[#0D9488]">{a.asset_tag}</td>
                      <td className="p-4 uppercase text-[#334155]">{a.category}</td>
                      <td className="p-4 font-sans text-[#0F172A] font-medium">{a.model}</td>
                      <td className="p-4 text-[#64748B]">{a.serial_number || '—'}</td>
                      <td className="p-4 font-sans">
                        {a.assigned_to ? (
                          <div>
                            <div className="font-semibold text-[#0F172A]">
                              {a.assigned_to.employee_name}
                              {isAssignedToCurrent && (
                                <span className="ml-1 text-[10px] font-mono font-bold text-[#0D9488] bg-[#CCFBF1] px-1.5 py-0.5 rounded border border-[#99F6E4]">
                                  (YOU)
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-[#64748B]">Since {a.assigned_to.assigned_date}</div>
                          </div>
                        ) : hasPendingReq ? (
                          <div>
                            <div className="font-semibold text-[#D97706] text-xs">Requested by {a.pending_request.employee_name}</div>
                            <div className="text-[10px] font-mono text-[#64748B]">Submitted {a.pending_request.requested_at}</div>
                          </div>
                        ) : (
                          <span className="text-[#047857] bg-[#ECFDF5] px-2 py-0.5 rounded text-[10px] font-bold border border-[#A7F3D0] font-mono uppercase">
                            UNASSIGNED STOCK
                          </span>
                        )}
                      </td>
                      <td className="p-4">{getStatusBadge(a)}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isHR ? (
                            <>
                              {hasPendingReq ? (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleApproveRequest(a.pending_request.id)}
                                    className="px-2 py-1 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
                                    title="Approve request & assign asset"
                                  >
                                    <UserCheck className="w-3 h-3" /> APPROVE
                                  </button>
                                  <button
                                    onClick={() => {
                                      setTargetRequestForReject(a.pending_request);
                                      setRejectionReasonNote('');
                                      setIsRejectModalOpen(true);
                                    }}
                                    className="px-2 py-1 bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA] rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
                                    title="Reject request"
                                  >
                                    <XCircle className="w-3 h-3" /> REJECT
                                  </button>
                                </div>
                              ) : (
                                <>
                                  {a.status === 'available' && (
                                    <button
                                      onClick={() => {
                                        setSelectedAsset(a);
                                        setIsAssignModalOpen(true);
                                      }}
                                      className="px-2 py-1 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
                                      title="Assign to Employee"
                                    >
                                      <UserCheck className="w-3 h-3" /> ASSIGN
                                    </button>
                                  )}

                                  {a.status === 'assigned' && (
                                    <button
                                      onClick={() => handleReturnAsset(a.id)}
                                      className="px-2 py-1 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
                                      title="Return to Stock"
                                    >
                                      <RotateCcw className="w-3 h-3" /> RETURN
                                    </button>
                                  )}

                                  {a.status !== 'under_repair' && a.status !== 'decommissioned' && (
                                    <button
                                      onClick={() => handleUpdateStatus(a.id, 'under_repair')}
                                      className="px-2 py-1 bg-[#FFFBEB] hover:bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A] rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
                                      title="Mark Under Repair"
                                    >
                                      <Wrench className="w-3 h-3" /> REPAIR
                                    </button>
                                  )}

                                  {a.status !== 'decommissioned' && (
                                    <button
                                      onClick={() => handleUpdateStatus(a.id, 'decommissioned')}
                                      className="px-2 py-1 bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA] rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
                                      title="Decommission Hardware"
                                    >
                                      <Trash2 className="w-3 h-3" /> DECOMMISSION
                                    </button>
                                  )}

                                  {(a.status === 'under_repair' || a.status === 'decommissioned') && (
                                    <button
                                      onClick={() => handleUpdateStatus(a.id, 'available')}
                                      className="px-2 py-1 bg-[#ECFDF5] hover:bg-[#D1FAE5] text-[#047857] border border-[#A7F3D0] rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1"
                                      title="Make Available"
                                    >
                                      MAKE AVAILABLE
                                    </button>
                                  )}
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              {hasPendingReq ? (
                                <span className="px-2.5 py-1 bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] rounded text-[10px] font-bold uppercase flex items-center gap-1 font-mono">
                                  <Clock className="w-3 h-3 text-[#D97706]" /> {isRequestedByMe ? 'PENDING APPROVAL' : 'REQUEST PENDING'}
                                </span>
                              ) : a.status === 'available' ? (
                                <button
                                  onClick={() => {
                                    setTargetAssetForRequest(a);
                                    setRequestReasonNote('');
                                    setIsRequestModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded text-[10px] font-bold uppercase transition-colors flex items-center gap-1 shadow-xs shrink-0 font-mono"
                                  title="Submit Request for Asset Assignment"
                                >
                                  <Send className="w-3 h-3 text-white" /> REQUEST ASSET
                                </button>
                              ) : a.status === 'assigned' && isAssignedToCurrent ? (
                                <span className="text-[#0F766E] text-[10px] font-bold uppercase flex items-center gap-1 bg-[#F0FDFA] px-2 py-1 rounded border border-[#99F6E4]">
                                  <CheckCircle2 className="w-3 h-3 text-[#0D9488]" /> ASSIGNED TO YOU
                                </span>
                              ) : (
                                <span className="text-[#94A3B8] font-mono text-[10px]">—</span>
                              )}
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
                    {loading ? 'LOADING ASSETS...' : 'NO HARDWARE ASSETS MATCH FILTER.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Register New Asset */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (addModalRef.current && !addModalRef.current.contains(e.target as Node)) {
              setIsAddModalOpen(false);
            }
          }}
        >
          <div ref={addModalRef} className="bg-white border border-[#CBD5E1] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between font-mono">
              <h3 className="text-xs font-bold text-[#0F172A] uppercase flex items-center gap-2">
                <Package className="w-4 h-4 text-[#0D9488]" /> REGISTER NEW HARDWARE ASSET
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-[#64748B] hover:text-[#0F172A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAsset} className="p-5 space-y-4 font-mono text-xs">
              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Asset Tag ID *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AST-006"
                  value={assetTag}
                  onChange={(e) => setAssetTag(e.target.value)}
                  className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Asset Category *</label>
                <select
                  value={assetCategory}
                  onChange={(e) => setAssetCategory(e.target.value)}
                  className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1]"
                >
                  <option value="laptop">Laptop / Notebook</option>
                  <option value="mobile">Mobile Device / Tablet</option>
                  <option value="sim">SIM Card / Data Card</option>
                  <option value="workstation">Workstation / Monitor</option>
                  <option value="other">Other Hardware</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Model / Specification *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MacBook Pro M3 Max 36GB"
                  value={assetModel}
                  onChange={(e) => setAssetModel(e.target.value)}
                  className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] font-sans"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Serial Number</label>
                <input
                  type="text"
                  placeholder="e.g. C02G30X1MD6M"
                  value={assetSerial}
                  onChange={(e) => setAssetSerial(e.target.value)}
                  className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="py-2 px-4 rounded bg-[#F1F5F9] text-[#475569] font-bold hover:bg-[#E2E8F0]"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submittingAsset}
                  className="py-2 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold uppercase tracking-wider"
                >
                  {submittingAsset ? 'SAVING...' : 'REGISTER ASSET'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Assign Asset to Employee */}
      {isAssignModalOpen && selectedAsset && (
        <div
          className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (assignModalRef.current && !assignModalRef.current.contains(e.target as Node)) {
              setIsAssignModalOpen(false);
            }
          }}
        >
          <div ref={assignModalRef} className="bg-white border border-[#CBD5E1] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between font-mono">
              <h3 className="text-xs font-bold text-[#0F172A] uppercase flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#0D9488]" /> ASSIGN ASSET: {selectedAsset.asset_tag}
              </h3>
              <button onClick={() => setIsAssignModalOpen(false)} className="text-[#64748B] hover:text-[#0F172A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAssignAsset} className="p-5 space-y-4 font-mono text-xs">
              <div className="p-3 bg-[#F0FDFA] border border-[#99F6E4] rounded text-xs space-y-0.5">
                <div className="font-bold text-[#0F766E]">{selectedAsset.model}</div>
                <div className="text-[10px] text-[#0D9488]">{selectedAsset.category.toUpperCase()} • SN: {selectedAsset.serial_number || 'N/A'}</div>
              </div>

              <div className="relative" ref={employeeComboboxRef}>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">SELECT EMPLOYEE *</label>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#0D9488] absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    required={!selectedEmployeeId}
                    placeholder="Type name, code, or designation to search..."
                    value={
                      selectedEmployeeId && !isEmployeeDropdownOpen
                        ? (() => {
                          const emp = employees.find((e) => e.id === selectedEmployeeId);
                          return emp ? `${emp.first_name} ${emp.last_name} (${emp.employee_code}) — ${emp.designation}` : employeeSearchQuery;
                        })()
                        : employeeSearchQuery
                    }
                    onFocus={() => {
                      setIsEmployeeDropdownOpen(true);
                      if (selectedEmployeeId && !employeeSearchQuery) {
                        const emp = employees.find((e) => e.id === selectedEmployeeId);
                        if (emp) setEmployeeSearchQuery(`${emp.first_name} ${emp.last_name}`);
                      }
                    }}
                    onChange={(e) => {
                      setEmployeeSearchQuery(e.target.value);
                      setIsEmployeeDropdownOpen(true);
                      if (selectedEmployeeId) setSelectedEmployeeId('');
                    }}
                    className="w-full pl-9 pr-8 py-2.5 text-xs industrial-input bg-white border border-[#CBD5E1] rounded font-sans focus:border-[#0D9488]"
                  />

                  {(selectedEmployeeId || employeeSearchQuery) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEmployeeId('');
                        setEmployeeSearchQuery('');
                        setIsEmployeeDropdownOpen(true);
                      }}
                      className="absolute right-2.5 top-2.5 text-[#94A3B8] hover:text-[#0F172A]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {isEmployeeDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-[#CBD5E1] rounded-lg shadow-xl z-50 divide-y divide-[#F1F5F9] font-mono text-xs">
                    {employees
                      .filter((emp) => {
                        if (!employeeSearchQuery.trim()) return true;
                        const q = employeeSearchQuery.toLowerCase();
                        const name = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
                        const code = (emp.employee_code || '').toLowerCase();
                        const desig = (emp.designation || '').toLowerCase();
                        return name.includes(q) || code.includes(q) || desig.includes(q);
                      })
                      .map((emp) => {
                        const isSelected = selectedEmployeeId === emp.id;
                        return (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => {
                              setSelectedEmployeeId(emp.id);
                              setEmployeeSearchQuery('');
                              setIsEmployeeDropdownOpen(false);
                            }}
                            className={`w-full text-left p-2.5 flex items-center justify-between transition-colors ${isSelected
                              ? 'bg-[#CCFBF1] text-[#0F766E] font-bold'
                              : 'hover:bg-[#F0FDFA] text-[#0F172A]'
                              }`}
                          >
                            <div>
                              <div className="font-bold text-[#0F172A]">{emp.first_name} {emp.last_name}</div>
                              <div className="text-[10px] text-[#64748B] font-mono">{emp.employee_code} • {emp.designation}</div>
                            </div>
                            {isSelected ? (
                              <span className="text-[10px] font-bold text-[#0D9488]">SELECTED ✓</span>
                            ) : (
                              <span className="text-[10px] text-[#0D9488] font-bold">SELECT &rarr;</span>
                            )}
                          </button>
                        );
                      })}

                    {employees.filter((emp) => {
                      if (!employeeSearchQuery.trim()) return true;
                      const q = employeeSearchQuery.toLowerCase();
                      const name = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
                      const code = (emp.employee_code || '').toLowerCase();
                      return name.includes(q) || code.includes(q);
                    }).length === 0 && (
                        <div className="p-4 text-center text-[#64748B] text-xs font-sans">
                          No employee matching "{employeeSearchQuery}"
                        </div>
                      )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Assignment Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Issued for remote development work"
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] font-sans"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="py-2 px-4 rounded bg-[#F1F5F9] text-[#475569] font-bold hover:bg-[#E2E8F0]"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submittingAssign}
                  className="py-2 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold uppercase tracking-wider"
                >
                  {submittingAssign ? 'ASSIGNING...' : 'CONFIRM ASSIGNMENT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Custom Request Asset Modal (Replaces window.prompt) */}
      {isRequestModalOpen && targetAssetForRequest && (
        <div
          className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (requestModalRef.current && !requestModalRef.current.contains(e.target as Node)) {
              setIsRequestModalOpen(false);
            }
          }}
        >
          <div ref={requestModalRef} className="bg-white border border-[#CBD5E1] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
            <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between font-mono">
              <h3 className="text-xs font-bold text-[#0F172A] uppercase flex items-center gap-2">
                <Send className="w-4 h-4 text-[#0D9488]" /> REQUEST HARDWARE ASSIGNMENT
              </h3>
              <button onClick={() => setIsRequestModalOpen(false)} className="text-[#64748B] hover:text-[#0F172A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitAssetRequest} className="p-5 space-y-4 font-mono text-xs">
              <div className="p-3 bg-[#F0FDFA] border border-[#99F6E4] rounded text-xs space-y-1">
                <div className="text-[10px] font-bold text-[#0D9488] uppercase">Target Hardware Device</div>
                <div className="font-bold text-[#0F766E] text-sm">{targetAssetForRequest.model}</div>
                <div className="text-[11px] text-[#475569]">
                  TAG ID: <span className="font-bold text-[#0D9488]">{targetAssetForRequest.asset_tag}</span> • SN: {targetAssetForRequest.serial_number || 'N/A'}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">
                  Purpose / Notes for HR *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why you need this hardware asset (e.g. Required for development operations and QA testing)..."
                  value={requestReasonNote}
                  onChange={(e) => setRequestReasonNote(e.target.value)}
                  className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] font-sans resize-none rounded"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="py-2 px-4 rounded bg-[#F1F5F9] text-[#475569] font-bold hover:bg-[#E2E8F0] uppercase tracking-wider text-[11px]"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="py-2 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submittingRequest ? 'SUBMITTING...' : 'SUBMIT ASSET REQUEST'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Custom Reject Request Modal */}
      {isRejectModalOpen && targetRequestForReject && (
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
                <XCircle className="w-4 h-4 text-[#DC2626]" /> REJECT ASSET REQUEST #{targetRequestForReject.id}
              </h3>
              <button onClick={() => setIsRejectModalOpen(false)} className="text-[#64748B] hover:text-[#0F172A]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRejectRequest} className="p-5 space-y-4 font-mono text-xs">
              <div className="p-3 bg-[#FFF5F5] border border-[#FED7D7] rounded text-xs space-y-0.5">
                <div className="font-bold text-[#0F172A]">{targetRequestForReject.employee_name} ({targetRequestForReject.employee_code})</div>
                <div className="text-[11px] text-[#64748B]">Requested Device: <span className="font-bold text-[#0D9488]">{targetRequestForReject.asset_tag}</span> — {targetRequestForReject.asset_model}</div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">
                  Rejection Reason / Comments *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Provide reason for declining request (e.g. Asset reserved for onboarding lead developer)..."
                  value={rejectionReasonNote}
                  onChange={(e) => setRejectionReasonNote(e.target.value)}
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

      {/* Modal 5: Custom Confirmation Action Modal (Replaces window.confirm) */}
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
