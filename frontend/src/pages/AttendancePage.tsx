import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Cpu,
  Download,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  RotateCcw,
  ShieldCheck,
  Send,
  UserCheck,
  Building2,
  Calendar as CalendarIcon,
  Search,
  Filter,
  Plus,
  X,
  FileText,
  Briefcase,
  Layers,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Coffee,
  Activity,
  Home,
  Laptop,
  MapPin,
  Eye,
  Sliders,
  History,
  Check,
  Users,
  Sun,
  Palmtree,
  CalendarX
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { connectSocket } from '../services/socket';
import {
  attendanceApi,
  AttendanceRecord,
  TodayAttendance,
  OvertimeClaim,
  PunchCorrectionRequest,
  LivePresenceUser,
  AttendanceAuditEvent,
  AttendancePolicy,
  AttendanceShift
} from '../services/attendanceApi';

/* ─── Format decimal hours → "4h 55m" ─── */
function formatHours(h: number | undefined | null): string {
  if (!h || h <= 0) return '—';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

/* ─── Format seconds → "HH:MM:SS" or "MM:SS" ─── */
function formatTimer(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const AttendancePage: React.FC = () => {
  const { user } = useAuthStore();
  const roleName = user?.role || 'Employee';
  const isManagerOrAdmin =
    roleName === 'Super Admin' ||
    roleName === 'HR Manager' ||
    roleName === 'Admin' ||
    roleName === 'Department Manager';

  // Active Main View Tab
  const [activeMainTab, setActiveMainTab] = useState<'my_attendance' | 'team_vault'>('my_attendance');

  // Live Today Status
  const [todayData, setTodayData] = useState<TodayAttendance | null>(null);
  const [todayLoading, setTodayLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedWorkMode, setSelectedWorkMode] = useState<string>('OFFICE');

  // Live Timer Counters
  const [liveShiftSeconds, setLiveShiftSeconds] = useState<number>(0);
  const [liveBreakSeconds, setLiveBreakSeconds] = useState<number>(0);

  // Personal Sub Tabs
  const [personalSubTab, setPersonalSubTab] = useState<'logs' | 'calendar' | 'my_claims' | 'my_resumes'>('logs');
  const [myLogs, setMyLogs] = useState<AttendanceRecord[]>([]);
  const [myClaims, setMyClaims] = useState<OvertimeClaim[]>([]);
  const [myCorrections, setMyCorrections] = useState<PunchCorrectionRequest[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
  const [myLogsLoading, setMyLogsLoading] = useState(true);

  // Calendar View State
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(new Date());
  const [selectedDayRecord, setSelectedDayRecord] = useState<AttendanceRecord | null>(null);

  // Team Vault State
  const [teamVaultTab, setTeamVaultTab] = useState<'presence' | 'grid' | 'ot_queue' | 'reg_queue' | 'audit_trail' | 'policies'>('presence');
  const [teamLogs, setTeamLogs] = useState<AttendanceRecord[]>([]);
  const [livePresence, setLivePresence] = useState<LivePresenceUser[]>([]);
  const [pendingOTClaims, setPendingOTClaims] = useState<OvertimeClaim[]>([]);
  const [pendingCorrections, setPendingCorrections] = useState<PunchCorrectionRequest[]>([]);
  const [auditEvents, setAuditEvents] = useState<AttendanceAuditEvent[]>([]);
  const [policies, setPolicies] = useState<AttendancePolicy[]>([]);
  const [shifts, setShifts] = useState<AttendanceShift[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  // Team Filter Inputs
  const [teamSearch, setTeamSearch] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [teamStatusFilter, setTeamStatusFilter] = useState<string>('');
  const [teamDateFrom, setTeamDateFrom] = useState('');
  const [teamDateTo, setTeamDateTo] = useState('');
  const [departments, setDepartments] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  // Modals
  const [showOTClaimModal, setShowOTClaimModal] = useState(false);
  const [claimTargetAttendance, setClaimTargetAttendance] = useState<AttendanceRecord | null>(null);
  const [claimHours, setClaimHours] = useState<number>(1);
  const [claimProjectId, setClaimProjectId] = useState<string>('');
  const [claimSummary, setClaimSummary] = useState<string>('');
  const [claimSubmitting, setClaimSubmitting] = useState(false);

  // Regularization Modal
  const [showRegModal, setShowRegModal] = useState(false);
  const [regTargetDate, setRegTargetDate] = useState<string>('');
  const [regAttendanceId, setRegAttendanceId] = useState<number | undefined>(undefined);
  const [regType, setRegType] = useState<string>('ACCIDENTAL_PUNCH_OUT');
  const [regReason, setRegReason] = useState('');
  const [regReqIn, setRegReqIn] = useState('');
  const [regReqOut, setRegReqOut] = useState('');
  const [regSubmitting, setRegSubmitting] = useState(false);

  // Review Reject Remarks Modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [targetClaimId, setTargetClaimId] = useState<string | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // Break Type Selector Popover
  const [showBreakSelector, setShowBreakSelector] = useState(false);

  // Biometric Ingest Loading
  const [ingesting, setIngesting] = useState(false);

  // Load Personal Data
  const loadInitialData = useCallback(async () => {
    try {
      setTodayLoading(true);
      const [todayRes, myLogsRes, myClaimsRes, myCorrRes, holRes, leaveRes] = await Promise.all([
        attendanceApi.getTodayAttendance(),
        attendanceApi.getMyLogs(),
        attendanceApi.getMyOvertimeClaims(),
        attendanceApi.getMyRegularizations(),
        attendanceApi.getHolidays(),
        attendanceApi.getLeaveRequests()
      ]);
      setTodayData(todayRes);
      setMyLogs(myLogsRes);
      setMyClaims(myClaimsRes);
      setMyCorrections(myCorrRes);
      setHolidays(holRes);
      setLeaveRequests(leaveRes);
      if (todayRes.work_mode) setSelectedWorkMode(todayRes.work_mode);
    } catch (err) {
      console.error('Failed to load personal attendance data', err);
    } finally {
      setTodayLoading(false);
      setMyLogsLoading(false);
    }
  }, []);

  // Load Team Vault Data
  const loadTeamData = useCallback(async () => {
    if (!isManagerOrAdmin) return;
    setTeamLoading(true);
    try {
      const [teamRes, presenceRes, otRes, corrRes, auditRes, policiesRes, shiftsRes, deptRes, projRes] = await Promise.all([
        attendanceApi.getTeamLogs({
          search: teamSearch,
          department_id: selectedDeptId ? parseInt(selectedDeptId) : undefined,
          status: teamStatusFilter || undefined,
          from: teamDateFrom || undefined,
          to: teamDateTo || undefined
        }),
        attendanceApi.getPresenceStream(selectedDeptId ? parseInt(selectedDeptId) : undefined),
        attendanceApi.getPendingOvertimeClaims(),
        attendanceApi.getPendingRegularizations(),
        attendanceApi.getAuditEvents(),
        attendanceApi.getPolicies(),
        attendanceApi.getShifts(),
        attendanceApi.getDepartments(),
        attendanceApi.getProjects()
      ]);
      setTeamLogs(teamRes.attendance);
      setLivePresence(presenceRes);
      setPendingOTClaims(otRes.claims);
      setPendingCorrections(corrRes);
      setAuditEvents(auditRes);
      setPolicies(policiesRes);
      setShifts(shiftsRes);
      setDepartments(deptRes);
      setProjects(projRes);
    } catch (err) {
      console.error('Failed to load team attendance vault', err);
    } finally {
      setTeamLoading(false);
    }
  }, [isManagerOrAdmin, teamSearch, selectedDeptId, teamStatusFilter, teamDateFrom, teamDateTo]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (activeMainTab === 'team_vault' && isManagerOrAdmin) {
      loadTeamData();
    }
  }, [activeMainTab, isManagerOrAdmin, loadTeamData]);

  // Live Timer Interval Effect (Only for today!)
  useEffect(() => {
    const timer = setInterval(() => {
      if (todayData?.is_checked_in && todayData?.check_in) {
        const [h, m, s] = todayData.check_in.split(':').map(Number);
        const checkInDate = new Date();
        checkInDate.setHours(h, m, s || 0, 0);
        const now = new Date();
        const diff = Math.max(0, Math.floor((now.getTime() - checkInDate.getTime()) / 1000));
        setLiveShiftSeconds(diff);
      }
      if (todayData?.is_on_break && todayData?.active_break?.started_at) {
        const started = new Date(todayData.active_break.started_at);
        const now = new Date();
        const diff = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
        setLiveBreakSeconds(diff);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [todayData]);

  // Real-Time Socket.IO Listener for Presence Changes
  useEffect(() => {
    if (!user) return;
    const socket = connectSocket({
      id: user.id,
      role: user.role,
      department_id: user.employee?.department_id
    });

    const handlePresenceChanged = (payload: any) => {
      setLivePresence(prev =>
        prev.map(p =>
          p.employee_id === payload.user_id
            ? { ...p, presence_status: payload.status, work_mode: payload.work_mode || p.work_mode }
            : p
        )
      );
      if (payload.user_id === user.id) {
        loadInitialData();
      }
    };

    socket.on('attendance:presence_changed', handlePresenceChanged);

    return () => {
      socket.off('attendance:presence_changed', handlePresenceChanged);
    };
  }, [user, loadInitialData]);

  // Check In Handler
  const handleCheckIn = async () => {
    setActionLoading(true);
    try {
      await attendanceApi.checkIn(selectedWorkMode);
      await loadInitialData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Check-in failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Check Out Handler
  const handleCheckOut = async () => {
    if (!window.confirm('Are you sure you want to end your workday and punch out?')) return;
    setActionLoading(true);
    try {
      await attendanceApi.checkOut();
      await loadInitialData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Check-out failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Start Break Handler
  const handleStartBreak = async (type: string) => {
    setShowBreakSelector(false);
    setActionLoading(true);
    try {
      await attendanceApi.startBreak(type);
      await loadInitialData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to start break');
    } finally {
      setActionLoading(false);
    }
  };

  // End Break Handler
  const handleEndBreak = async () => {
    setActionLoading(true);
    try {
      await attendanceApi.endBreak();
      await loadInitialData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to end break');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Overtime Claim Handler
  const handleOpenOTModal = (attRecord: AttendanceRecord) => {
    setClaimTargetAttendance(attRecord);
    setClaimHours(attRecord.unapproved_ot_hours > 0 ? Number(attRecord.unapproved_ot_hours) : 1);
    setClaimSummary('');
    setClaimProjectId('');
    setShowOTClaimModal(true);
  };

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimTargetAttendance || !claimSummary.trim()) return;

    setClaimSubmitting(true);
    try {
      await attendanceApi.submitOvertimeClaim({
        attendance_id: claimTargetAttendance.id,
        project_id: claimProjectId || undefined,
        claimed_hours: claimHours,
        task_summary: claimSummary
      });
      setShowOTClaimModal(false);
      await loadInitialData();
      alert('Overtime claim submitted to your Department Manager!');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to submit overtime claim');
    } finally {
      setClaimSubmitting(false);
    }
  };

  // Regularization Request Handler (supports prefilling from calendar click)
  const handleOpenRegularizationModal = (preset?: { date?: string; attendanceId?: number; defaultType?: string }) => {
    setRegTargetDate(preset?.date || new Date().toISOString().slice(0, 10));
    setRegAttendanceId(preset?.attendanceId || todayData?.id);
    setRegType(preset?.defaultType || 'ACCIDENTAL_PUNCH_OUT');
    setRegReason('');
    setRegReqIn('');
    setRegReqOut('');
    setShowRegModal(true);
  };

  const handleSubmitRegularization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regReason.trim()) return;

    setRegSubmitting(true);
    try {
      await attendanceApi.submitRegularization({
        attendance_id: regAttendanceId,
        correction_type: regType,
        requested_in_time: regReqIn || undefined,
        requested_out_time: regReqOut || undefined,
        reason: regReason
      });
      setShowRegModal(false);
      setRegReason('');
      await loadInitialData();
      alert('Regularization request submitted to your manager/HR!');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to submit regularization');
    } finally {
      setRegSubmitting(false);
    }
  };

  // Review Overtime Claim (Manager / HR)
  const handleReviewClaim = async (claimId: string, action: 'APPROVE' | 'REJECT', remarks?: string) => {
    try {
      await attendanceApi.reviewOvertimeClaim(claimId, { action, remarks });
      await loadTeamData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to review claim');
    }
  };

  const handleOpenRejectModal = (claimId: string) => {
    setTargetClaimId(claimId);
    setRejectRemarks('');
    setShowRejectModal(true);
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetClaimId || !rejectRemarks.trim()) return;
    setRejectSubmitting(true);
    try {
      await handleReviewClaim(targetClaimId, 'REJECT', rejectRemarks);
      setShowRejectModal(false);
      setTargetClaimId(null);
    } finally {
      setRejectSubmitting(false);
    }
  };

  // Review Regularization
  const handleReviewRegularization = async (reqId: string, action: 'APPROVE' | 'REJECT') => {
    const note = prompt(
      action === 'APPROVE'
        ? 'Approval Note (Optional):'
        : 'Reason for Rejection (Mandatory):'
    );
    if (action === 'REJECT' && !note) return;

    try {
      await attendanceApi.reviewRegularization(reqId, { action, audit_note: note || undefined });
      await loadTeamData();
      alert(`Request ${action.toLowerCase()}d successfully.`);
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to review regularization');
    }
  };

  // Hardware Simulation
  const handleSimulateBiometric = async () => {
    setIngesting(true);
    try {
      await attendanceApi.simulateBiometric();
      await loadInitialData();
      if (activeMainTab === 'team_vault') await loadTeamData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Biometric simulation failed');
    } finally {
      setIngesting(false);
    }
  };

  // CSV Export for Team Logs
  const handleExportCSV = () => {
    const headers = [
      'Employee Name',
      'Code',
      'Department',
      'Date',
      'Check-In',
      'Check-Out',
      'Work Mode',
      'Late Mins',
      'Work Hours',
      'Break Hours',
      'Unapproved OT',
      'Approved OT',
      'Source',
      'Status'
    ];
    const rows = teamLogs.map(l => [
      `"${l.employee_name}"`,
      l.employee_code,
      `"${l.department_name || ''}"`,
      l.date,
      l.check_in || '',
      l.check_out || '',
      l.work_mode,
      l.late_minutes,
      l.working_hours.toFixed(2),
      l.break_duration_hours.toFixed(2),
      l.unapproved_ot_hours.toFixed(2),
      l.overtime_hours.toFixed(2),
      l.source_type,
      l.status
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team_attendance_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render Status Badge with accurate duration threshold rules
  const renderStatusBadge = (status: string, isResumed?: boolean, calculatedStatus?: string, recordDate?: string, workingHours?: number) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const isToday = recordDate === todayStr;

    // Rule 1: Prevent Zombie "IN SHIFT" on past days with missing checkout
    if (!isToday && status === 'incomplete_absent' && calculatedStatus === 'MISSED_PUNCH_OUT') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-rose-500/20 text-rose-600 border border-rose-300 rounded uppercase">
          <AlertCircle className="w-3 h-3 text-rose-500" /> MISSED OUT
        </span>
      );
    }

    if (calculatedStatus === 'ON_BREAK' && isToday) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 rounded uppercase animate-pulse">
          <Coffee className="w-3 h-3" /> ON BREAK
        </span>
      );
    }
    if (calculatedStatus === 'IN_SHIFT' && isToday) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-teal-100 text-teal-800 border border-teal-300 rounded uppercase">
          <Activity className="w-3 h-3 text-teal-600 animate-pulse" /> IN SHIFT
        </span>
      );
    }
    if (calculatedStatus === 'OVERTIME') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-400 rounded uppercase font-mono">
          <TrendingUp className="w-3 h-3 text-amber-600" /> OVERTIME
        </span>
      );
    }
    if (calculatedStatus === 'REGULARIZED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-300 rounded uppercase font-mono">
          <ShieldCheck className="w-3 h-3" /> REGULARIZED
        </span>
      );
    }

    // Rule 3: Accurate work duration threshold (under 4.0h is HALF DAY, never green present)
    if (workingHours !== undefined && workingHours > 0 && workingHours < 4.0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74] rounded uppercase">
          <Timer className="w-3 h-3" /> HALF DAY ({workingHours.toFixed(1)}h)
        </span>
      );
    }

    switch (status) {
      case 'present':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] rounded uppercase">
            <CheckCircle2 className="w-3 h-3" /> PRESENT {isResumed && '• RESUMED'}
          </span>
        );
      case 'late_present':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] rounded uppercase">
            <AlertTriangle className="w-3 h-3" /> LATE PRESENT {isResumed && '• RESUMED'}
          </span>
        );
      case 'half_day':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74] rounded uppercase">
            <Timer className="w-3 h-3" /> HALF DAY
          </span>
        );
      case 'incomplete_absent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-bold bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] rounded uppercase">
            <XCircle className="w-3 h-3" /> INCOMPLETE
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 text-[10px] font-bold bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1] rounded uppercase">
            {status || 'UNKNOWN'}
          </span>
        );
    }
  };

  // Render Work Mode Icon
  const renderWorkModeBadge = (mode: string) => {
    switch (mode) {
      case 'REMOTE':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
            <Home className="w-3 h-3" /> Remote
          </span>
        );
      case 'HYBRID':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
            <Laptop className="w-3 h-3" /> Hybrid
          </span>
        );
      case 'FIELD':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
            <MapPin className="w-3 h-3" /> Field
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
            <Building2 className="w-3 h-3" /> Office
          </span>
        );
    }
  };

  // Render Claim Status Pill
  const renderClaimStatusPill = (status: string) => {
    switch (status) {
      case 'PENDING_MANAGER':
        return <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-300 rounded">PENDING MGR</span>;
      case 'PENDING_HR':
        return <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-300 rounded">PENDING HR</span>;
      case 'APPROVED':
        return <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-teal-50 text-teal-700 border border-teal-300 rounded">APPROVED</span>;
      case 'REJECTED':
        return <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-300 rounded">REJECTED</span>;
      default:
        return null;
    }
  };

  // ─── CALENDAR STATUS CLASSIFICATION ENGINE ───
  const getCalendarDays = () => {
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const record = myLogs.find(l => l.date === dateStr);
      const dayDate = new Date(year, month, d);
      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6; // Sun or Sat
      const isFuture = dateStr > todayStr;
      const isToday = dateStr === todayStr;

      // Check Holiday
      const matchingHoliday = holidays.find(h => h.date === dateStr);
      // Check Approved Leave
      const matchingLeave = leaveRequests.find(
        l => l.status === 'approved' && dateStr >= l.start_date && dateStr <= l.end_date
      );

      let classification: 'FUTURE' | 'WEEKEND' | 'WEEKEND_WORKED' | 'HOLIDAY' | 'ON_LEAVE' | 'ABSENT' | 'MISSED_OUT' | 'HALF_DAY' | 'PRESENT' | 'LATE' | 'TODAY_ACTIVE' = 'ABSENT';
      let badge = <span className="text-[9px] font-mono text-slate-400">—</span>;
      let cardBg = 'bg-white border-slate-200 text-slate-700';

      if (isFuture) {
        classification = 'FUTURE';
        badge = <span className="text-[10px] font-mono text-slate-300">—</span>;
        cardBg = 'bg-slate-50/50 border-slate-100 text-slate-400 cursor-default';
      } else if (isToday) {
        classification = 'TODAY_ACTIVE';
        if (todayData?.is_on_break) {
          badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300 rounded uppercase animate-pulse">ON BREAK</span>;
          cardBg = 'bg-amber-50/80 border-amber-300 text-amber-900';
        } else if (todayData?.is_checked_in) {
          badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-teal-100 text-teal-800 border border-teal-300 rounded uppercase"><Activity className="w-2.5 h-2.5 inline mr-0.5 animate-pulse" /> IN SHIFT</span>;
          cardBg = 'bg-teal-50/80 border-teal-300 text-teal-900';
        } else if (todayData?.is_checked_out) {
          if ((todayData.working_hours || 0) < 4.0) {
            badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300 rounded uppercase">HALF DAY</span>;
            cardBg = 'bg-amber-50 border-amber-200 text-amber-900';
          } else {
            badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 rounded uppercase"><CheckCircle2 className="w-2.5 h-2.5 inline mr-0.5" /> PRESENT</span>;
            cardBg = 'bg-emerald-50 border-emerald-200 text-emerald-900';
          }
        } else {
          badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-300 rounded uppercase">TODAY</span>;
          cardBg = 'bg-white border-teal-400 text-slate-800';
        }
      } else if (isWeekend) {
        if (record && (record.working_hours > 0 || record.check_in)) {
          classification = 'WEEKEND_WORKED';
          badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 rounded uppercase font-mono">WEEKEND OT</span>;
          cardBg = 'bg-amber-50/70 border-amber-200 text-amber-900';
        } else {
          classification = 'WEEKEND';
          badge = <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-slate-100 text-slate-400 rounded">WEEKEND</span>;
          cardBg = 'bg-slate-50 border-slate-200 text-slate-400 cursor-default';
        }
      } else {
        // Past Weekdays (Mon-Fri)
        if (record && record.check_in) {
          if (!record.check_out) {
            classification = 'MISSED_OUT';
            badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-rose-500/20 text-rose-600 border border-rose-300 rounded uppercase font-mono">MISSED OUT</span>;
            cardBg = 'bg-rose-50/80 border-rose-300 text-rose-900';
          } else if (record.working_hours < 4.0) {
            classification = 'HALF_DAY';
            badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300 rounded uppercase">HALF DAY ({record.working_hours.toFixed(1)}h)</span>;
            cardBg = 'bg-amber-50 border-amber-200 text-amber-900';
          } else if (record.working_hours < 7.5) {
            classification = 'HALF_DAY';
            badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200 rounded uppercase">HALF DAY</span>;
            cardBg = 'bg-amber-50/60 border-amber-200 text-amber-900';
          } else if (record.late_minutes > 0) {
            classification = 'LATE';
            badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-300 rounded uppercase">LATE PRESENT</span>;
            cardBg = 'bg-amber-50/80 border-amber-200 text-amber-900';
          } else {
            classification = 'PRESENT';
            badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 rounded uppercase"><CheckCircle2 className="w-2.5 h-2.5 inline mr-0.5" /> PRESENT</span>;
            cardBg = 'bg-emerald-50 border-emerald-200 text-emerald-900';
          }
        } else {
          // No record on past weekday
          if (matchingHoliday) {
            classification = 'HOLIDAY';
            badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200 rounded uppercase font-mono">HOLIDAY</span>;
            cardBg = 'bg-purple-50 border-purple-200 text-purple-900';
          } else if (matchingLeave) {
            classification = 'ON_LEAVE';
            badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-sky-100 text-sky-800 border border-sky-200 rounded uppercase font-mono">ON LEAVE</span>;
            cardBg = 'bg-sky-50 border-sky-200 text-sky-900';
          } else {
            classification = 'ABSENT';
            badge = <span className="px-1.5 py-0.5 text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-300 rounded uppercase font-mono">ABSENT</span>;
            cardBg = 'bg-rose-50 border-rose-200 text-rose-900';
          }
        }
      }

      days.push({
        dayNumber: d,
        dateStr,
        record,
        classification,
        badge,
        cardBg,
        holidayName: matchingHoliday?.name,
        leaveReason: matchingLeave?.reason
      });
    }

    return days;
  };

  // Calendar Day Click Action Handler
  const handleCalendarDayClick = (day: any) => {
    if (day.classification === 'FUTURE' || day.classification === 'WEEKEND') return;

    if (day.classification === 'MISSED_OUT') {
      handleOpenRegularizationModal({
        date: day.dateStr,
        attendanceId: day.record?.id,
        defaultType: 'MISSING_PUNCH_OUT'
      });
      return;
    }

    if (day.classification === 'ABSENT') {
      handleOpenRegularizationModal({
        date: day.dateStr,
        attendanceId: day.record?.id,
        defaultType: 'MISSING_PUNCH_IN'
      });
      return;
    }

    if (day.record) {
      setSelectedDayRecord(day.record);
    }
  };

  // Calculate Team Overview Metrics
  const activeInShiftCount = livePresence.filter(p => p.presence_status === 'IN_SHIFT').length;
  const onBreakCount = livePresence.filter(p => p.presence_status === 'ON_BREAK').length;
  const punchedOutCount = livePresence.filter(p => p.presence_status === 'PUNCHED_OUT').length;
  const attendanceRate = livePresence.length > 0 ? Math.round(((activeInShiftCount + onBreakCount + punchedOutCount) / livePresence.length) * 100) : 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-16">
      {/* ── TOP HEADER WITH CORPORATE POLICY LEGEND ── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl text-slate-100">
        <div>
          <div className="flex items-center space-x-3">
            <Clock className="w-8 h-8 text-teal-400 shrink-0" />
            <div>
              <h1 className="text-xl font-bold text-slate-100 tracking-wide font-mono uppercase">
                Enterprise Attendance Operations & Presence Engine
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 font-sans">
                Dynamic Shift Policies • Break Lifecycle • Regularization Audit Trail • Real-Time Presence WebSockets
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 mt-3.5 font-mono text-[10px]">
            <span className="px-2.5 py-1 bg-teal-950/60 border border-teal-500/30 text-teal-300 rounded-lg font-bold">
              👩 FEMALE SHIFT: 10:30 AM – 07:30 PM (Grace to 10:45)
            </span>
            <span className="px-2.5 py-1 bg-slate-800/80 border border-slate-700 text-slate-300 rounded-lg font-bold">
              👨 MALE SHIFT: 11:30 AM – 08:30 PM (Grace to 11:45)
            </span>
            <span className="px-2.5 py-1 bg-indigo-950/60 border border-indigo-500/30 text-indigo-300 rounded-lg font-bold">
              🕌 FRIDAY JUMMA EXEMPTION: 13:00 – 14:30
            </span>
            <span className="px-2.5 py-1 bg-amber-950/60 border border-amber-500/30 text-amber-300 rounded-lg font-bold">
              ⏱️ OVERTIME THRESHOLD: &gt;8.0h Work
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleSimulateBiometric}
            disabled={ingesting}
            className="py-2 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono font-bold text-xs transition flex items-center gap-2"
            title="Simulates hardware punch from BIOMETRIC-GATE-01"
          >
            <Cpu className="w-4 h-4 text-teal-400" />
            {ingesting ? 'INGESTING...' : 'SIMULATE BIOMETRIC PUNCH'}
          </button>
        </div>
      </div>

      {/* ── LIVE INTERACTIVE CONTROL BAR (PERSONAL WORKSPACE) ── */}
      <div className="bg-white border border-[#CBD5E1] rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-3 h-3 rounded-full ${
                  todayData?.is_on_break
                    ? 'bg-amber-500 animate-pulse'
                    : todayData?.is_checked_in
                    ? 'bg-teal-500 animate-pulse'
                    : 'bg-slate-300'
                }`}
              />
              <h2 className="text-sm font-bold text-[#0F172A] uppercase font-mono tracking-wider">
                TODAY'S WORK SESSION •{' '}
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </h2>
              {todayData?.is_on_break && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  ON BREAK ({formatTimer(liveBreakSeconds)})
                </span>
              )}
            </div>
            <p className="text-xs text-[#64748B] flex items-center gap-3">
              <span>
                Assigned Shift: <strong className="text-[#0F172A] font-mono">{todayData?.shift_name || 'Standard 8.0h'}</strong>
              </span>
              <span>•</span>
              <span>
                Work Mode: <strong>{todayData?.work_mode || selectedWorkMode}</strong>
              </span>
            </p>
          </div>

          {/* Interactive Action Center */}
          <div className="flex items-center gap-3 flex-wrap">
            {todayLoading ? (
              <span className="text-xs font-mono text-slate-400">Synchronizing presence...</span>
            ) : !todayData?.is_checked_in && !todayData?.is_checked_out ? (
              /* State 1: Inactive (Punch In) */
              <div className="flex items-center gap-2.5">
                <select
                  value={selectedWorkMode}
                  onChange={e => setSelectedWorkMode(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 font-mono focus:outline-none focus:border-teal-500"
                >
                  <option value="OFFICE">🏢 Office</option>
                  <option value="REMOTE">🏠 Remote</option>
                  <option value="HYBRID">💼 Hybrid</option>
                  <option value="FIELD">📍 Field</option>
                </select>
                <button
                  onClick={handleCheckIn}
                  disabled={actionLoading}
                  className="py-2.5 px-5 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white font-mono font-bold text-xs tracking-wider uppercase transition shadow-md flex items-center gap-2"
                >
                  <Clock className="w-4 h-4" />
                  {actionLoading ? 'PUNCHING IN...' : 'PUNCH IN (START SHIFT)'}
                </button>
              </div>
            ) : todayData?.is_checked_in ? (
              /* State 2: Active In Shift or On Break */
              <div className="flex items-center gap-2.5 relative">
                {todayData.is_on_break ? (
                  <button
                    onClick={handleEndBreak}
                    disabled={actionLoading}
                    className="py-2.5 px-4 rounded-xl bg-[#0D9488] hover:bg-[#0F766E] text-white font-mono font-bold text-xs tracking-wider uppercase transition shadow-md flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    RESUME WORK ({formatTimer(liveBreakSeconds)})
                  </button>
                ) : (
                  <>
                    <div className="relative">
                      <button
                        onClick={() => setShowBreakSelector(v => !v)}
                        disabled={actionLoading}
                        className="py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-mono font-bold text-xs tracking-wider uppercase transition shadow-md flex items-center gap-1.5"
                      >
                        <Coffee className="w-4 h-4" />
                        START BREAK
                      </button>
                      {showBreakSelector && (
                        <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-1 font-mono text-xs animate-in fade-in">
                          {[
                            { type: 'LUNCH', label: '🍱 Lunch Break' },
                            { type: 'TEA', label: '☕ Tea Break' },
                            { type: 'PRAYER', label: '🕌 Prayer Break' },
                            { type: 'PERSONAL', label: '🚶 Personal Break' }
                          ].map(b => (
                            <button
                              key={b.type}
                              onClick={() => handleStartBreak(b.type)}
                              className="w-full text-left px-3 py-2 hover:bg-slate-100 rounded-lg transition text-slate-800 font-semibold"
                            >
                              {b.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleCheckOut}
                      disabled={actionLoading}
                      className="py-2.5 px-4 rounded-xl bg-[#E11D48] hover:bg-[#BE123C] text-white font-mono font-bold text-xs tracking-wider uppercase transition shadow-md flex items-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      PUNCH OUT
                    </button>
                  </>
                )}
              </div>
            ) : (
              /* State 3: Punched Out Completed */
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-800 font-mono text-xs font-bold border border-slate-200">
                  SHIFT COMPLETED FOR TODAY
                </span>
                <button
                  onClick={() => handleOpenRegularizationModal()}
                  className="py-2 px-3.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-mono font-bold text-xs transition flex items-center gap-1.5 shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  REQUEST REGULARIZATION / RESUME
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Live Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-5 pt-5 border-t border-[#E2E8F0] font-mono text-xs">
          <div>
            <span className="text-[10px] text-[#64748B] uppercase font-bold block">Check-In Timestamp</span>
            <span className="text-sm font-bold text-[#047857]">{todayData?.check_in || '—'}</span>
          </div>
          <div>
            <span className="text-[10px] text-[#64748B] uppercase font-bold block">Check-Out Timestamp</span>
            <span className="text-sm font-bold text-[#334155]">{todayData?.check_out || (todayData?.is_checked_in ? 'In Progress…' : '—')}</span>
          </div>
          <div>
            <span className="text-[10px] text-[#64748B] uppercase font-bold block">Late Deviation</span>
            <span className={`text-sm font-bold ${todayData && todayData.late_minutes > 0 ? 'text-[#B45309]' : 'text-[#64748B]'}`}>
              {todayData && todayData.late_minutes > 0 ? `+${todayData.late_minutes}m Late` : 'On Time'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#64748B] uppercase font-bold block">Break Duration</span>
            <span className="text-sm font-bold text-slate-700">
              {todayData?.is_on_break ? (
                <span className="text-amber-600 font-bold">{formatTimer(liveBreakSeconds)}</span>
              ) : todayData?.break_duration_hours ? (
                `${(todayData.break_duration_hours * 60).toFixed(0)}m`
              ) : (
                '0m'
              )}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#64748B] uppercase font-bold block">Live Working Time</span>
            <span className="text-sm font-bold text-[#0F172A] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#0D9488]" />
              {todayData?.is_checked_in ? (
                <span className="text-teal-700">{formatTimer(liveShiftSeconds)} (Live)</span>
              ) : todayData?.working_hours ? (
                formatHours(todayData.working_hours)
              ) : (
                '0h'
              )}
            </span>
          </div>
        </div>

        {/* Unclaimed Overtime Alert Strip */}
        {todayData && todayData.unapproved_ot_hours > 0 && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Unclaimed Overtime Available:</strong> You worked{' '}
                <strong className="font-mono text-amber-800">+{todayData.unapproved_ot_hours.toFixed(2)}h</strong> beyond standard threshold today.
              </span>
            </div>
            {todayData.id && (
              <button
                onClick={() =>
                  handleOpenOTModal({
                    id: todayData.id!,
                    employee_id: '',
                    employee_name: 'Me',
                    employee_code: '',
                    gender: todayData.gender,
                    date: new Date().toISOString().slice(0, 10),
                    check_in: todayData.check_in,
                    check_out: todayData.check_out,
                    status: todayData.status,
                    calculated_status: todayData.calculated_status,
                    work_mode: todayData.work_mode,
                    late_minutes: todayData.late_minutes,
                    early_leaving_minutes: todayData.early_leaving_minutes,
                    working_hours: todayData.working_hours,
                    regular_hours: todayData.regular_hours,
                    break_duration_hours: todayData.break_duration_hours,
                    unapproved_ot_hours: todayData.unapproved_ot_hours,
                    approved_ot_hours: 0,
                    overtime_hours: todayData.overtime_hours,
                    ot_category: 'NORMAL_OT',
                    is_resumed: todayData.is_resumed,
                    device_id: todayData.device_id,
                    source_type: todayData.source_type
                  })
                }
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-xs uppercase shadow-xs shrink-0 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> CLAIM OVERTIME
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── ROLE-BASED MAIN TABS ── */}
      {isManagerOrAdmin && (
        <div className="flex items-center space-x-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveMainTab('my_attendance')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition font-mono ${
              activeMainTab === 'my_attendance'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4 text-teal-400" />
            <span>MY PERSONAL ATTENDANCE</span>
          </button>

          <button
            onClick={() => setActiveMainTab('team_vault')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition font-mono ${
              activeMainTab === 'team_vault'
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4 text-teal-400" />
            <span>DEPARTMENT & ORGANIZATION ATTENDANCE VAULT</span>
            {(pendingOTClaims.length > 0 || pendingCorrections.length > 0) && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-rose-500 text-white font-bold">
                {pendingOTClaims.length + pendingCorrections.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* CONTAINER 1: MY PERSONAL ATTENDANCE VAULT (Visible to everyone)        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'my_attendance' && (
        <div className="space-y-5">
          {/* Sub Navigation */}
          <div className="flex items-center space-x-2">
            {[
              { id: 'logs', label: 'Punch Logs Table', icon: FileText, count: myLogs.length },
              { id: 'calendar', label: 'Monthly Visual Calendar', icon: CalendarIcon, count: null },
              { id: 'my_claims', label: 'My Overtime Claims', icon: Briefcase, count: myClaims.length },
              { id: 'my_resumes', label: 'My Regularizations', icon: RotateCcw, count: myCorrections.length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setPersonalSubTab(tab.id as any)}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition font-mono border ${
                  personalSubTab === tab.id
                    ? 'bg-[#0D9488] text-white border-transparent'
                    : 'bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F8FAFC]'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span className={`px-1.5 py-0.2 rounded text-[10px] ${personalSubTab === tab.id ? 'bg-teal-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Sub-view 1: Logs Table */}
          {personalSubTab === 'logs' && (
            <div className="industrial-card overflow-hidden bg-white border border-[#CBD5E1] rounded-2xl shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#0F172A]">
                  <thead className="bg-[#0F172A] text-white font-mono font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-4">DATE</th>
                      <th className="p-4">CHECK-IN</th>
                      <th className="p-4">CHECK-OUT</th>
                      <th className="p-4">WORK MODE</th>
                      <th className="p-4">LATE</th>
                      <th className="p-4 text-teal-400">WORK HOURS</th>
                      <th className="p-4">BREAKS</th>
                      <th className="p-4">RAW OT</th>
                      <th className="p-4 text-teal-300">APPROVED OT</th>
                      <th className="p-4">STATUS</th>
                      <th className="p-4 text-right">OVERTIME ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] font-mono">
                    {myLogsLoading ? (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-[#64748B]">
                          LOADING YOUR PUNCH HISTORY...
                        </td>
                      </tr>
                    ) : myLogs.length > 0 ? (
                      myLogs.map(log => (
                        <tr key={log.id} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="p-4 font-bold text-[#0F172A]">{log.date}</td>
                          <td className="p-4 text-[#047857] font-bold">{log.check_in || '—'}</td>
                          <td className="p-4 text-[#334155]">{log.check_out || '—'}</td>
                          <td className="p-4">{renderWorkModeBadge(log.work_mode)}</td>
                          <td className="p-4">
                            {log.late_minutes > 0 ? (
                              <span className="text-[#B45309] font-bold">+{log.late_minutes}m</span>
                            ) : (
                              <span className="text-[#94A3B8]">0m</span>
                            )}
                          </td>
                          <td className="p-4 font-bold text-[#0F172A]">
                            {log.working_hours > 0 ? (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-[#0D9488]" />
                                {formatHours(log.working_hours)}
                              </span>
                            ) : (
                              <span className="text-[#94A3B8]">—</span>
                            )}
                          </td>
                          <td className="p-4 text-slate-600 font-bold">
                            {log.break_duration_hours > 0 ? `${(log.break_duration_hours * 60).toFixed(0)}m` : '0m'}
                          </td>
                          <td className="p-4">
                            {log.unapproved_ot_hours > 0 ? (
                              <span className="text-amber-700 font-bold">+{log.unapproved_ot_hours.toFixed(1)}h</span>
                            ) : (
                              <span className="text-[#94A3B8]">0.0h</span>
                            )}
                          </td>
                          <td className="p-4">
                            {log.overtime_hours > 0 ? (
                              <span className="text-teal-700 font-bold">+{log.overtime_hours.toFixed(1)}h</span>
                            ) : (
                              <span className="text-[#94A3B8]">0.0h</span>
                            )}
                          </td>
                          <td className="p-4">{renderStatusBadge(log.status, log.is_resumed, log.calculated_status, log.date, log.working_hours)}</td>
                          <td className="p-4 text-right">
                            {log.claim ? (
                              renderClaimStatusPill(log.claim.status)
                            ) : log.unapproved_ot_hours > 0 ? (
                              <button
                                onClick={() => handleOpenOTModal(log)}
                                className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-[10px] uppercase shadow-xs transition"
                              >
                                CLAIM OT ({log.unapproved_ot_hours.toFixed(1)}h)
                              </button>
                            ) : (
                              <span className="text-[#CBD5E1] text-[10px]">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-[#64748B]">
                          No personal attendance records found for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-view 2: Visual Monthly Calendar Grid (Classification Engine) */}
          {personalSubTab === 'calendar' && (
            <div className="industrial-card p-6 bg-white border border-[#CBD5E1] rounded-2xl shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[#E2E8F0]">
                <div className="flex items-center space-x-2">
                  <CalendarIcon className="w-5 h-5 text-teal-600" />
                  <h3 className="font-mono font-bold text-sm text-[#0F172A] uppercase">
                    {currentCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </h3>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-3 flex-wrap text-[10px] font-mono font-bold text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Present (&gt;=7.5h)</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Half Day / Late (&lt;7.5h)</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Missed Out / Absent</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> Holiday</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-500" /> On Leave</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> Weekend</span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentCalendarMonth(new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() - 1, 1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentCalendarMonth(new Date())}
                    className="px-2.5 py-1 text-[11px] font-mono font-bold border border-slate-200 hover:bg-slate-100 rounded-lg"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => setCurrentCalendarMonth(new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + 1, 1))}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Day Name Headers */}
              <div className="grid grid-cols-7 gap-2 text-center font-mono font-bold text-xs text-slate-400 py-1">
                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                  <div key={d}>{d}</div>
                ))}
              </div>

              {/* Calendar Days Matrix */}
              <div className="grid grid-cols-7 gap-2">
                {getCalendarDays().map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} className="h-24 bg-slate-50/50 rounded-xl border border-transparent" />;

                  const rec = day.record;
                  return (
                    <div
                      key={day.dateStr}
                      onClick={() => handleCalendarDayClick(day)}
                      className={`h-24 p-2.5 rounded-xl border flex flex-col justify-between transition cursor-pointer hover:shadow-md ${day.cardBg}`}
                      title={
                        day.classification === 'MISSED_OUT'
                          ? 'Click to request Punch-Out Regularization'
                          : day.classification === 'ABSENT'
                          ? 'Click to request Missing Punch In / Attendance Regularization'
                          : undefined
                      }
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-mono font-bold text-xs">{day.dayNumber}</span>
                        {day.badge}
                      </div>

                      {/* Content details inside cell */}
                      <div className="font-mono text-[10px] space-y-0.5">
                        {rec && rec.check_in ? (
                          <>
                            <div className="truncate text-teal-700 font-bold">
                              {rec.check_in} → {rec.check_out || '—'}
                            </div>
                            <div className="text-slate-600 font-semibold flex items-center justify-between">
                              <span>{formatHours(rec.working_hours)}</span>
                              {rec.unapproved_ot_hours > 0 && (
                                <span className="text-amber-700 font-bold">+{rec.unapproved_ot_hours}h OT</span>
                              )}
                            </div>
                          </>
                        ) : day.holidayName ? (
                          <div className="text-purple-700 font-bold truncate">{day.holidayName}</div>
                        ) : day.leaveReason ? (
                          <div className="text-sky-700 font-bold truncate">Leave: {day.leaveReason}</div>
                        ) : day.classification === 'ABSENT' ? (
                          <div className="text-rose-600 font-semibold text-[9px] italic">Click to Regularize</div>
                        ) : day.classification === 'MISSED_OUT' ? (
                          <div className="text-rose-600 font-semibold text-[9px] italic">Unclosed Punch • Fix</div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sub-view 3: My Claims */}
          {personalSubTab === 'my_claims' && (
            <div className="industrial-card overflow-hidden bg-white border border-[#CBD5E1] rounded-2xl shadow-sm">
              <div className="p-4 bg-[#F8FAFC] border-b border-[#CBD5E1] flex items-center justify-between">
                <span className="font-mono font-bold text-xs text-[#0F172A] uppercase">
                  SUBMITTED OVERTIME CLAIMS ({myClaims.length})
                </span>
              </div>
              <div className="divide-y divide-[#E2E8F0]">
                {myClaims.length > 0 ? (
                  myClaims.map(c => (
                    <div key={c.id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-[#F8FAFC]">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 font-mono text-xs">
                          <span className="font-bold text-[#0F172A]">{c.attendance_date}</span>
                          <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-700 font-bold border border-teal-200">
                            +{c.claimed_hours}h Claimed
                          </span>
                          <span className="text-slate-500 font-sans">{c.project_name}</span>
                        </div>
                        <p className="text-xs text-slate-700 font-sans italic">"{c.task_summary}"</p>
                        {c.manager_remarks && (
                          <p className="text-[11px] text-indigo-700 font-sans">
                            <strong>Manager Note ({c.manager_name}):</strong> {c.manager_remarks}
                          </p>
                        )}
                        {c.hr_remarks && (
                          <p className="text-[11px] text-teal-700 font-sans">
                            <strong>HR Note ({c.hr_name}):</strong> {c.hr_remarks}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">{renderClaimStatusPill(c.status)}</div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-slate-500 text-xs font-mono">
                    You have not submitted any overtime claims yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sub-view 4: My Regularizations */}
          {personalSubTab === 'my_resumes' && (
            <div className="industrial-card overflow-hidden bg-white border border-[#CBD5E1] rounded-2xl shadow-sm">
              <div className="p-4 bg-[#F8FAFC] border-b border-[#CBD5E1]">
                <span className="font-mono font-bold text-xs text-[#0F172A] uppercase">
                  REGULARIZATION & RESUMPTION REQUESTS ({myCorrections.length})
                </span>
              </div>
              <div className="divide-y divide-[#E2E8F0]">
                {myCorrections.length > 0 ? (
                  myCorrections.map(req => (
                    <div key={req.id} className="p-4 flex items-center justify-between gap-4 hover:bg-[#F8FAFC]">
                      <div className="space-y-1 font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#0F172A]">{req.attendance_date}</span>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-800 font-bold rounded">
                            {req.correction_type.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 font-sans italic">"{req.reason}"</p>
                        {req.audit_note && (
                          <p className="text-[11px] text-indigo-700 font-sans">
                            <strong>Review Note:</strong> {req.audit_note}
                          </p>
                        )}
                      </div>
                      <div>
                        {req.status === 'APPROVED' ? (
                          <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-100 text-teal-800">
                            APPROVED
                          </span>
                        ) : req.status === 'REJECTED' ? (
                          <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800">
                            REJECTED
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-800">
                            PENDING REVIEW
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-slate-500 text-xs font-mono">
                    No regularization requests submitted.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* CONTAINER 2: DEPARTMENT & ORGANIZATION ATTENDANCE VAULT (Managers)     */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeMainTab === 'team_vault' && isManagerOrAdmin && (
        <div className="space-y-6">
          {/* Department Analytics Header Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
            {[
              { label: 'ATTENDANCE RATE', value: `${attendanceRate}%`, icon: TrendingUp, color: 'text-teal-600' },
              { label: 'ACTIVE IN SHIFT', value: activeInShiftCount, icon: Activity, color: 'text-emerald-600' },
              { label: 'ON BREAK', value: onBreakCount, icon: Coffee, color: 'text-amber-600' },
              { label: 'PENDING OT CLAIMS', value: pendingOTClaims.length, icon: Briefcase, color: 'text-indigo-600' },
              { label: 'PENDING REGULARIZATIONS', value: pendingCorrections.length, icon: RotateCcw, color: 'text-rose-600' }
            ].map(m => (
              <div key={m.label} className="bg-white border border-[#CBD5E1] p-4 rounded-xl shadow-xs font-mono">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase">
                  <span>{m.label}</span>
                  <m.icon className={`w-4 h-4 ${m.color}`} />
                </div>
                <div className="text-xl font-bold text-slate-900 mt-1">{m.value}</div>
              </div>
            ))}
          </div>

          {/* Sub Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center space-x-2 flex-wrap gap-y-2">
              <button
                onClick={() => setTeamVaultTab('presence')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition font-mono border ${
                  teamVaultTab === 'presence'
                    ? 'bg-[#0D9488] text-white border-transparent'
                    : 'bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F8FAFC]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Live Presence Stream</span>
              </button>

              <button
                onClick={() => setTeamVaultTab('grid')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition font-mono border ${
                  teamVaultTab === 'grid'
                    ? 'bg-[#0D9488] text-white border-transparent'
                    : 'bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F8FAFC]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Team Logs Grid</span>
              </button>

              <button
                onClick={() => setTeamVaultTab('ot_queue')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition font-mono border ${
                  teamVaultTab === 'ot_queue'
                    ? 'bg-[#0D9488] text-white border-transparent'
                    : 'bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F8FAFC]'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span>Overtime Approvals</span>
                {pendingOTClaims.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                    {pendingOTClaims.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setTeamVaultTab('reg_queue')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition font-mono border ${
                  teamVaultTab === 'reg_queue'
                    ? 'bg-[#0D9488] text-white border-transparent'
                    : 'bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F8FAFC]'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Regularizations</span>
                {pendingCorrections.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                    {pendingCorrections.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setTeamVaultTab('audit_trail')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition font-mono border ${
                  teamVaultTab === 'audit_trail'
                    ? 'bg-[#0D9488] text-white border-transparent'
                    : 'bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F8FAFC]'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Audit Trail</span>
              </button>

              <button
                onClick={() => setTeamVaultTab('policies')}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition font-mono border ${
                  teamVaultTab === 'policies'
                    ? 'bg-[#0D9488] text-white border-transparent'
                    : 'bg-white text-[#475569] border-[#CBD5E1] hover:bg-[#F8FAFC]'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Shifts & Policies</span>
              </button>
            </div>

            {teamVaultTab === 'grid' && (
              <button
                onClick={handleExportCSV}
                className="py-1.5 px-3 rounded-lg bg-[#F1F5F9] text-[#334155] font-mono font-bold text-xs hover:bg-[#E2E8F0] transition flex items-center gap-1.5 border border-[#CBD5E1] shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-[#0D9488]" />
                EXPORT CSV
              </button>
            )}
          </div>

          {/* TAB 1: LIVE PRESENCE STREAM */}
          {teamVaultTab === 'presence' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {livePresence.map(p => (
                  <div
                    key={p.employee_id}
                    className="bg-white border border-[#CBD5E1] p-4 rounded-xl shadow-xs space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-bold text-sm text-[#0F172A] block">{p.employee_name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{p.employee_code} • {p.department_name}</span>
                        </div>
                        {p.presence_status === 'IN_SHIFT' && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-teal-100 text-teal-800 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-600 animate-pulse" /> IN SHIFT
                          </span>
                        )}
                        {p.presence_status === 'ON_BREAK' && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-100 text-amber-800 flex items-center gap-1 animate-pulse">
                            <Coffee className="w-3 h-3" /> BREAK
                          </span>
                        )}
                        {p.presence_status === 'PUNCHED_OUT' && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-slate-100 text-slate-600">
                            PUNCHED OUT
                          </span>
                        )}
                        {p.presence_status === 'NOT_STARTED' && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-rose-50 text-rose-600">
                            NOT STARTED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{p.designation}</p>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs font-mono flex items-center justify-between">
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">Check In</span>
                        <span className="font-bold text-slate-800">{p.check_in || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">Duration</span>
                        <span className="font-bold text-teal-700">{formatHours(p.working_hours)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block uppercase">Mode</span>
                        <span>{renderWorkModeBadge(p.work_mode)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: TEAM LOGS GRID */}
          {teamVaultTab === 'grid' && (
            <div className="space-y-4">
              <div className="bg-white border border-[#CBD5E1] p-4 rounded-xl shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 font-mono text-xs">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={teamSearch}
                    onChange={e => setTeamSearch(e.target.value)}
                    placeholder="Search name / code..."
                    className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <select
                  value={selectedDeptId}
                  onChange={e => setSelectedDeptId(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:border-teal-500 font-bold"
                >
                  <option value="">All Departments</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>

                <select
                  value={teamStatusFilter}
                  onChange={e => setTeamStatusFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:border-teal-500 font-bold"
                >
                  <option value="">All Statuses</option>
                  <option value="present">Present</option>
                  <option value="late_present">Late Present</option>
                  <option value="half_day">Half Day</option>
                  <option value="incomplete_absent">Incomplete / Absent</option>
                </select>

                <input
                  type="date"
                  value={teamDateFrom}
                  onChange={e => setTeamDateFrom(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:border-teal-500"
                />

                <input
                  type="date"
                  value={teamDateTo}
                  onChange={e => setTeamDateTo(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="industrial-card overflow-hidden bg-white border border-[#CBD5E1] rounded-2xl shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-[#0F172A]">
                    <thead className="bg-[#0F172A] text-white font-mono font-bold uppercase tracking-wider">
                      <tr>
                        <th className="p-4">EMPLOYEE</th>
                        <th className="p-4">DEPARTMENT</th>
                        <th className="p-4">DATE</th>
                        <th className="p-4">CHECK-IN</th>
                        <th className="p-4">CHECK-OUT</th>
                        <th className="p-4">WORK MODE</th>
                        <th className="p-4">LATE</th>
                        <th className="p-4 text-teal-400">WORK HOURS</th>
                        <th className="p-4">BREAKS</th>
                        <th className="p-4 text-amber-400">RAW OT</th>
                        <th className="p-4 text-teal-300">APPROVED OT</th>
                        <th className="p-4">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] font-mono">
                      {teamLoading ? (
                        <tr>
                          <td colSpan={12} className="p-8 text-center text-[#64748B]">
                            LOADING TEAM ATTENDANCE RECORDS...
                          </td>
                        </tr>
                      ) : teamLogs.length > 0 ? (
                        teamLogs.map(log => (
                          <tr key={log.id} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="p-4 font-sans font-medium text-[#0F172A]">
                              <div>
                                <span className="font-bold block">{log.employee_name}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{log.employee_code}</span>
                              </div>
                            </td>
                            <td className="p-4 text-slate-600 font-sans">{log.department_name}</td>
                            <td className="p-4 font-bold text-slate-700">{log.date}</td>
                            <td className="p-4 text-[#047857] font-bold">{log.check_in || '—'}</td>
                            <td className="p-4 text-[#334155]">{log.check_out || '—'}</td>
                            <td className="p-4">{renderWorkModeBadge(log.work_mode)}</td>
                            <td className="p-4">
                              {log.late_minutes > 0 ? (
                                <span className="text-[#B45309] font-bold">+{log.late_minutes}m</span>
                              ) : (
                                <span className="text-[#94A3B8]">0m</span>
                              )}
                            </td>
                            <td className="p-4 font-bold text-[#0F172A]">
                              {log.working_hours > 0 ? (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-[#0D9488]" />
                                  {formatHours(log.working_hours)}
                                </span>
                              ) : (
                                <span className="text-[#94A3B8]">—</span>
                              )}
                            </td>
                            <td className="p-4 text-slate-600 font-bold">
                              {log.break_duration_hours > 0 ? `${(log.break_duration_hours * 60).toFixed(0)}m` : '0m'}
                            </td>
                            <td className="p-4">
                              {log.unapproved_ot_hours > 0 ? (
                                <span className="text-amber-700 font-bold">+{log.unapproved_ot_hours.toFixed(1)}h</span>
                              ) : (
                                <span className="text-[#94A3B8]">0.0h</span>
                              )}
                            </td>
                            <td className="p-4">
                              {log.overtime_hours > 0 ? (
                                <span className="text-teal-700 font-bold">+{log.overtime_hours.toFixed(1)}h</span>
                              ) : (
                                <span className="text-[#94A3B8]">0.0h</span>
                              )}
                            </td>
                            <td className="p-4">{renderStatusBadge(log.status, log.is_resumed, log.calculated_status, log.date, log.working_hours)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={12} className="p-8 text-center text-[#64748B]">
                            No matching team attendance records found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OVERTIME APPROVALS QUEUE */}
          {teamVaultTab === 'ot_queue' && (
            <div className="industrial-card overflow-hidden bg-white border border-[#CBD5E1] rounded-2xl shadow-sm">
              <div className="p-4 bg-[#F8FAFC] border-b border-[#CBD5E1]">
                <span className="font-mono font-bold text-xs text-[#0F172A] uppercase tracking-wider">
                  PENDING OVERTIME CLAIMS QUEUE ({pendingOTClaims.length})
                </span>
              </div>

              <div className="divide-y divide-[#E2E8F0]">
                {pendingOTClaims.length > 0 ? (
                  pendingOTClaims.map(claim => (
                    <div key={claim.id} className="p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 hover:bg-[#F8FAFC] transition">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
                          <span className="font-bold text-[#0F172A] text-sm">{claim.employee_name}</span>
                          <span className="text-slate-500">({claim.employee_code} • {claim.department_name})</span>
                          <span className="px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 font-bold border border-teal-200">
                            Date: {claim.attendance_date}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold border border-amber-200">
                            Claimed: +{claim.claimed_hours}h (Max Raw: {claim.unapproved_ot_hours}h)
                          </span>
                          {renderClaimStatusPill(claim.status)}
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 font-sans">
                          <span className="font-bold text-slate-600 block text-[10px] uppercase font-mono mb-0.5">
                            Task Justification ({claim.project_name}):
                          </span>
                          {claim.task_summary}
                        </div>

                        {claim.manager_remarks && (
                          <div className="text-[11px] text-indigo-700 font-sans">
                            <strong>Manager Recommendation ({claim.manager_name}):</strong> {claim.manager_remarks}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          onClick={() => handleReviewClaim(claim.id, 'APPROVE')}
                          className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-mono font-bold text-xs uppercase shadow-sm transition flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          APPROVE
                        </button>
                        <button
                          onClick={() => handleOpenRejectModal(claim.id)}
                          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-mono font-bold text-xs uppercase shadow-sm transition flex items-center gap-1.5"
                        >
                          <XCircle className="w-4 h-4" />
                          REJECT
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-10 text-center text-slate-500 text-xs font-mono">
                    No pending overtime claims awaiting review.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: REGULARIZATIONS QUEUE */}
          {teamVaultTab === 'reg_queue' && (
            <div className="industrial-card overflow-hidden bg-white border border-[#CBD5E1] rounded-2xl shadow-sm">
              <div className="p-4 bg-[#F8FAFC] border-b border-[#CBD5E1]">
                <span className="font-mono font-bold text-xs text-[#0F172A] uppercase tracking-wider">
                  REGULARIZATION & ACCIDENTAL PUNCH RESUMPTION QUEUE ({pendingCorrections.length})
                </span>
              </div>

              <div className="divide-y divide-[#E2E8F0]">
                {pendingCorrections.length > 0 ? (
                  pendingCorrections.map(req => (
                    <div key={req.id} className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-[#F8FAFC] transition">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
                          <span className="font-bold text-[#0F172A] text-sm">{req.employee_name}</span>
                          <span className="text-slate-500">({req.employee_code} • {req.department_name})</span>
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
                            Date: {req.attendance_date}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold">
                            {req.correction_type.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs text-slate-800 font-sans">
                          <span className="font-bold text-slate-600 block text-[10px] uppercase font-mono mb-0.5">Reason:</span>
                          "{req.reason}"
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          onClick={() => handleReviewRegularization(req.id, 'APPROVE')}
                          className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-mono font-bold text-xs uppercase shadow-sm transition flex items-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          APPROVE
                        </button>
                        <button
                          onClick={() => handleReviewRegularization(req.id, 'REJECT')}
                          className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-mono font-bold text-xs uppercase transition"
                        >
                          REJECT
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-10 text-center text-slate-500 text-xs font-mono">
                    No pending regularization requests.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT TRAIL */}
          {teamVaultTab === 'audit_trail' && (
            <div className="industrial-card overflow-hidden bg-white border border-[#CBD5E1] rounded-2xl shadow-sm">
              <div className="p-4 bg-[#F8FAFC] border-b border-[#CBD5E1] flex items-center justify-between">
                <span className="font-mono font-bold text-xs text-[#0F172A] uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4 text-teal-600" />
                  IMMUTABLE ATTENDANCE EVENT AUDIT TRAIL ({auditEvents.length})
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#0F172A]">
                  <thead className="bg-[#0F172A] text-white font-mono font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-4">TIMESTAMP</th>
                      <th className="p-4">EMPLOYEE</th>
                      <th className="p-4">ACTOR</th>
                      <th className="p-4">EVENT TYPE</th>
                      <th className="p-4">SOURCE</th>
                      <th className="p-4">IP</th>
                      <th className="p-4">PAYLOAD / STATE DIFF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] font-mono text-xs">
                    {auditEvents.map(ev => (
                      <tr key={ev.id} className="hover:bg-[#F8FAFC]">
                        <td className="p-4 text-slate-500 whitespace-nowrap">
                          {ev.created_at ? new Date(ev.created_at).toLocaleString() : '—'}
                        </td>
                        <td className="p-4 font-bold text-[#0F172A] font-sans">{ev.employee_name}</td>
                        <td className="p-4 text-slate-600 font-sans">{ev.actor_name}</td>
                        <td className="p-4">
                          <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 text-slate-800 border border-slate-300">
                            {ev.event_type}
                          </span>
                        </td>
                        <td className="p-4 text-slate-500 text-[10px]">{ev.source}</td>
                        <td className="p-4 text-slate-400 text-[10px]">{ev.ip_address || '—'}</td>
                        <td className="p-4 text-[11px] font-mono text-slate-600 max-w-xs truncate">
                          {ev.new_state ? JSON.stringify(ev.new_state) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: SHIFTS & POLICIES */}
          {teamVaultTab === 'policies' && (
            <div className="space-y-6">
              {/* Policies Grid */}
              <div className="industrial-card p-6 bg-white border border-[#CBD5E1] rounded-2xl shadow-sm space-y-4">
                <h3 className="font-mono font-bold text-sm text-[#0F172A] uppercase flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-teal-600" />
                  CONFIGURED ATTENDANCE POLICIES ({policies.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
                  {policies.map(pol => (
                    <div key={pol.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">{pol.name}</span>
                        <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px] font-bold">
                          {pol.shift_count} Linked Shifts
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-slate-600 text-[11px] pt-1">
                        <div>Standard Hours: <strong>{pol.standard_hours}h</strong></div>
                        <div>Half-Day Threshold: <strong>{pol.half_day_threshold}h</strong></div>
                        <div>Grace Window: <strong>{pol.grace_minutes}m</strong></div>
                        <div>Overtime Capped: <strong>{pol.max_daily_overtime}h</strong></div>
                        <div>Break Allowance: <strong>{pol.break_duration_mins}m</strong></div>
                        <div>Auto-Deduct Break: <strong>{pol.auto_deduct_break ? 'Yes' : 'No'}</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shifts Grid */}
              <div className="industrial-card p-6 bg-white border border-[#CBD5E1] rounded-2xl shadow-sm space-y-4">
                <h3 className="font-mono font-bold text-sm text-[#0F172A] uppercase flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-600" />
                  ACTIVE WORK SHIFTS ({shifts.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
                  {shifts.map(s => (
                    <div key={s.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2 shadow-xs">
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-slate-900">{s.name}</span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded">
                          {s.shift_type}
                        </span>
                      </div>
                      <div className="text-teal-700 font-bold text-sm">
                        {s.start_time} — {s.end_time}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Policy: {s.policy_name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 1: SUBMIT OVERTIME CLAIM                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {showOTClaimModal && claimTargetAttendance && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <form
            onSubmit={handleSubmitClaim}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl text-slate-100"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Briefcase className="w-5 h-5 text-teal-400" />
                <h3 className="font-bold text-base text-slate-100">Submit Overtime Claim</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOTClaimModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Attendance Date:</span>
                <span className="font-bold text-teal-300">{claimTargetAttendance.date}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Punches:</span>
                <span>{claimTargetAttendance.check_in} — {claimTargetAttendance.check_out}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Work Duration:</span>
                <span className="text-slate-200">{formatHours(claimTargetAttendance.working_hours)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Available Raw Overtime (&gt;8.0h):</span>
                <span className="font-bold text-amber-400">+{claimTargetAttendance.unapproved_ot_hours} Hours</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Hours to Claim *</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    max={claimTargetAttendance.unapproved_ot_hours || 12}
                    value={claimHours}
                    onChange={e => setClaimHours(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Project Justification</label>
                  <select
                    value={claimProjectId}
                    onChange={e => setClaimProjectId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  >
                    <option value="">General / Non-Project</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">
                  Deliverables & Justification (What tasks were completed during OT?) *
                </label>
                <textarea
                  rows={3}
                  value={claimSummary}
                  onChange={e => setClaimSummary(e.target.value)}
                  placeholder="e.g. Completed critical server patch deployment and bug triage..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-100 focus:outline-none focus:border-teal-500 resize-none font-sans"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowOTClaimModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={claimSubmitting}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold text-xs uppercase shadow-md transition"
              >
                {claimSubmitting ? 'SUBMITTING...' : 'SUBMIT CLAIM'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 2: GENERAL REGULARIZATION & ACCIDENTAL RESUMPTION REQUEST        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {showRegModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <form
            onSubmit={handleSubmitRegularization}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl text-slate-100"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <RotateCcw className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-slate-100">Attendance Regularization Request</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRegModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">Target Date</label>
                  <input
                    type="date"
                    value={regTargetDate}
                    onChange={e => setRegTargetDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">Regularization Type *</label>
                  <select
                    value={regType}
                    onChange={e => setRegType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 font-bold"
                  >
                    <option value="ACCIDENTAL_PUNCH_OUT">Accidental Punch-Out</option>
                    <option value="MISSING_PUNCH_IN">Missing Punch In</option>
                    <option value="MISSING_PUNCH_OUT">Missing Punch Out</option>
                    <option value="WRONG_TIME">Wrong Timestamp</option>
                    <option value="BIOMETRIC_FAILURE">Biometric Failure</option>
                  </select>
                </div>
              </div>

              {regType !== 'ACCIDENTAL_PUNCH_OUT' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Requested In Time</label>
                    <input
                      type="datetime-local"
                      value={regReqIn}
                      onChange={e => setRegReqIn(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-300 mb-1">Requested Out Time</label>
                    <input
                      type="datetime-local"
                      value={regReqOut}
                      onChange={e => setRegReqOut(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-300 mb-1">Detailed Reason & Explanation *</label>
                <textarea
                  rows={3}
                  value={regReason}
                  onChange={e => setRegReason(e.target.value)}
                  placeholder="e.g. Forgot to punch out due to client meeting offsite..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-100 focus:outline-none focus:border-teal-500 resize-none font-sans"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowRegModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={regSubmitting}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 font-bold text-xs uppercase shadow-md transition"
              >
                {regSubmitting ? 'SUBMITTING...' : 'SUBMIT REGULARIZATION'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 3: CALENDAR DAY DETAIL DRAWER                                    */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {selectedDayRecord && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl text-slate-100 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-teal-400">
                Attendance Details: {selectedDayRecord.date}
              </h3>
              <button onClick={() => setSelectedDayRecord(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="flex justify-between">
                <span className="text-slate-400">Punch In:</span>
                <span className="font-bold text-emerald-400">{selectedDayRecord.check_in || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Punch Out:</span>
                <span className="font-bold text-slate-200">{selectedDayRecord.check_out || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Working Duration:</span>
                <span className="font-bold text-teal-300">{formatHours(selectedDayRecord.working_hours)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Break Duration:</span>
                <span>{(selectedDayRecord.break_duration_hours * 60).toFixed(0)}m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Late Minutes:</span>
                <span className={selectedDayRecord.late_minutes > 0 ? 'text-amber-400 font-bold' : ''}>
                  {selectedDayRecord.late_minutes}m
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Work Mode:</span>
                <span>{selectedDayRecord.work_mode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Approved OT:</span>
                <span className="text-teal-400 font-bold">+{selectedDayRecord.overtime_hours}h</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-800">
                <span className="text-slate-400">Status:</span>
                <span>{renderStatusBadge(selectedDayRecord.status, selectedDayRecord.is_resumed, selectedDayRecord.calculated_status, selectedDayRecord.date, selectedDayRecord.working_hours)}</span>
              </div>
            </div>

            {/* Breaks breakdown */}
            {selectedDayRecord.breaks && selectedDayRecord.breaks.length > 0 && (
              <div className="space-y-1 pt-1">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Breaks Logged</span>
                <div className="space-y-1">
                  {selectedDayRecord.breaks.map(b => (
                    <div key={b.id} className="p-2 rounded bg-slate-950 border border-slate-800 flex justify-between text-[11px]">
                      <span>{b.break_type}</span>
                      <span className="text-slate-400">{b.duration_minutes}m</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedDayRecord(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 4: REJECT REMARKS MODAL                                          */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <form
            onSubmit={handleConfirmReject}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl text-slate-100"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-rose-400 flex items-center gap-2">
                <XCircle className="w-5 h-5" /> Reject Overtime Claim
              </h3>
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="block font-bold text-slate-300">
                Reason for Rejection * (Employee will see this feedback)
              </label>
              <textarea
                rows={3}
                value={rejectRemarks}
                onChange={e => setRejectRemarks(e.target.value)}
                placeholder="Explain why this overtime claim is being rejected..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-100 focus:outline-none focus:border-rose-500 resize-none font-sans"
                required
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={rejectSubmitting}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase shadow-md transition"
              >
                {rejectSubmitting ? 'REJECTING...' : 'CONFIRM REJECTION'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
