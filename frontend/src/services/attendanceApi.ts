import { api } from '../lib/api';

export interface AttendanceBreak {
  id: string;
  attendance_id: number;
  break_type: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  is_active: boolean;
}

export interface AttendanceAuditEvent {
  id: string;
  attendance_id?: number | null;
  employee_id: string;
  employee_name: string;
  actor_id?: string | null;
  actor_name: string;
  event_type: string;
  source: string;
  ip_address?: string | null;
  previous_state?: any;
  new_state?: any;
  created_at: string;
}

export interface AttendancePolicy {
  id: string;
  name: string;
  standard_hours: number;
  min_full_day_hours: number;
  half_day_threshold: number;
  grace_minutes: number;
  late_after_minutes: number;
  overtime_after_hours: number;
  max_daily_overtime: number;
  break_duration_mins: number;
  auto_deduct_break: boolean;
  shift_count: number;
}

export interface AttendanceShift {
  id: string;
  name: string;
  shift_type: string;
  start_time: string;
  end_time: string;
  is_overnight: boolean;
  policy_id: string;
  policy_name: string;
}

export interface AttendanceRecord {
  id: number;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department_id?: number;
  department_name?: string;
  designation?: string;
  gender: string;
  shift_id?: string;
  shift_name?: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  calculated_status: string;
  work_mode: string;
  late_minutes: number;
  early_leaving_minutes: number;
  working_hours: number;
  regular_hours: number;
  break_duration_hours: number;
  unapproved_ot_hours: number;
  approved_ot_hours: number;
  overtime_hours: number;
  ot_category: string;
  is_resumed: boolean;
  device_id: string;
  source_type: string;
  active_break?: AttendanceBreak | null;
  breaks?: AttendanceBreak[];
  claim?: {
    id: string;
    status: string;
    claimed_hours: number;
    task_summary: string;
  } | null;
  punch_correction?: {
    id: string;
    correction_type?: string;
    status: string;
    reason: string;
    requested_in_time?: string | null;
    requested_out_time?: string | null;
  } | null;
}

export interface TodayAttendance {
  id?: number;
  date?: string;
  is_checked_in: boolean;
  is_checked_out: boolean;
  is_on_break: boolean;
  active_break?: AttendanceBreak | null;
  check_in: string | null;
  check_out: string | null;
  status: string;
  calculated_status: string;
  work_mode: string;
  late_minutes: number;
  early_leaving_minutes: number;
  working_hours: number;
  regular_hours: number;
  break_duration_hours: number;
  unapproved_ot_hours: number;
  overtime_hours: number;
  is_resumed: boolean;
  shift_name: string;
  shift_type: string;
  gender: string;
  device_id: string;
  source_type: string;
  has_pending_resume?: boolean;
  breaks?: AttendanceBreak[];
}

export interface LivePresenceUser {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department_name: string;
  designation: string;
  presence_status: 'IN_SHIFT' | 'ON_BREAK' | 'PUNCHED_OUT' | 'NOT_STARTED';
  work_mode: string;
  check_in: string | null;
  check_out: string | null;
  working_hours: number;
  active_break?: AttendanceBreak | null;
}

export interface OvertimeClaim {
  id: string;
  attendance_id: number;
  attendance_date: string;
  user_id: string;
  employee_name: string;
  employee_code: string;
  department_name: string;
  project_id?: string | null;
  project_name?: string;
  claimed_hours: number;
  unapproved_ot_hours: number;
  task_summary: string;
  status: 'PENDING_MANAGER' | 'PENDING_HR' | 'APPROVED' | 'REJECTED';
  manager_id?: string | null;
  manager_name?: string | null;
  manager_remarks?: string | null;
  hr_id?: string | null;
  hr_name?: string | null;
  hr_remarks?: string | null;
  created_at: string;
}

export interface PunchCorrectionRequest {
  id: string;
  attendance_id: number;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  user_id: string;
  employee_name: string;
  employee_code: string;
  department_name: string;
  correction_type: string;
  requested_in_time?: string | null;
  requested_out_time?: string | null;
  reason: string;
  audit_note?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewed_by_id?: string | null;
  reviewed_by_name?: string | null;
  created_at: string;
}

export const attendanceApi = {
  getMyLogs: async (params?: { from?: string; to?: string; month?: number; year?: number }): Promise<AttendanceRecord[]> => {
    const res = await api.get('/attendance/my-logs', { params });
    return res.data.attendance || [];
  },

  getTeamLogs: async (params?: {
    department_id?: number;
    employee_id?: string;
    from?: string;
    to?: string;
    search?: string;
    status?: string;
  }): Promise<{ attendance: AttendanceRecord[]; scope: string; managed_dept_id?: number }> => {
    const res = await api.get('/attendance/team-logs', { params });
    return {
      attendance: res.data.attendance || [],
      scope: res.data.scope,
      managed_dept_id: res.data.managed_dept_id
    };
  },

  getTodayAttendance: async (): Promise<TodayAttendance> => {
    const res = await api.get('/attendance/today');
    return res.data;
  },

  checkIn: async (workMode: string = 'OFFICE') => {
    const res = await api.post('/attendance/check-in', { work_mode: workMode });
    return res.data;
  },

  checkOut: async () => {
    const res = await api.post('/attendance/check-out');
    return res.data;
  },

  startBreak: async (breakType: string = 'LUNCH'): Promise<{ success: boolean; message: string; break: AttendanceBreak }> => {
    const res = await api.post('/attendance/break/start', { break_type: breakType });
    return res.data;
  },

  endBreak: async (): Promise<{ success: boolean; message: string; break: AttendanceBreak }> => {
    const res = await api.post('/attendance/break/end');
    return res.data;
  },

  getPresenceStream: async (departmentId?: number): Promise<LivePresenceUser[]> => {
    const res = await api.get('/attendance/presence/stream', { params: { department_id: departmentId } });
    return res.data.presence || [];
  },

  getAuditEvents: async (params?: { attendance_id?: number; employee_id?: string; event_type?: string }): Promise<AttendanceAuditEvent[]> => {
    const res = await api.get('/attendance/audit-events', { params });
    return res.data.events || [];
  },

  submitRegularization: async (data: {
    attendance_id?: number;
    correction_type: string;
    requested_in_time?: string;
    requested_out_time?: string;
    reason: string;
  }): Promise<{ success: boolean; message: string; request: PunchCorrectionRequest }> => {
    const res = await api.post('/attendance/regularization/request', data);
    return res.data;
  },

  getPendingRegularizations: async (): Promise<PunchCorrectionRequest[]> => {
    const res = await api.get('/attendance/regularization/pending');
    return res.data.requests || [];
  },

  getMyRegularizations: async (): Promise<PunchCorrectionRequest[]> => {
    const res = await api.get('/attendance/punch-corrections/my-requests');
    return res.data.requests || [];
  },

  reviewRegularization: async (
    reqId: string,
    data: { action: 'APPROVE' | 'REJECT'; audit_note?: string }
  ): Promise<{ success: boolean; message: string; request: PunchCorrectionRequest }> => {
    const res = await api.patch(`/attendance/regularization/${reqId}/review`, data);
    return res.data;
  },

  submitOvertimeClaim: async (data: {
    attendance_id: number;
    project_id?: string;
    claimed_hours: number;
    task_summary: string;
  }): Promise<{ success: boolean; message: string; claim: OvertimeClaim }> => {
    const res = await api.post('/attendance/overtime/claim', data);
    return res.data;
  },

  getPendingOvertimeClaims: async (status?: string): Promise<{ claims: OvertimeClaim[]; is_hr_view: boolean }> => {
    const res = await api.get('/attendance/overtime/pending', { params: { status } });
    return {
      claims: res.data.claims || [],
      is_hr_view: !!res.data.is_hr_view
    };
  },

  getMyOvertimeClaims: async (): Promise<OvertimeClaim[]> => {
    const res = await api.get('/attendance/overtime/my-claims');
    return res.data.claims || [];
  },

  reviewOvertimeClaim: async (
    claimId: string,
    data: { action: 'APPROVE' | 'REJECT'; remarks?: string }
  ): Promise<{ success: boolean; message: string; claim: OvertimeClaim }> => {
    const res = await api.patch(`/attendance/overtime/${claimId}/review`, data);
    return res.data;
  },

  getPolicies: async (): Promise<AttendancePolicy[]> => {
    const res = await api.get('/attendance/policies');
    return res.data.policies || [];
  },

  getShifts: async (): Promise<AttendanceShift[]> => {
    const res = await api.get('/attendance/shifts');
    return res.data.shifts || [];
  },

  assignShift: async (data: { user_id: string; shift_id: string; effective_from?: string }) => {
    const res = await api.post('/attendance/shifts/assign', data);
    return res.data;
  },

  simulateBiometric: async (employeeCode: string = 'EMP-004') => {
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const res = await api.post('/attendance/biometric-ingest', {
      employee_code: employeeCode,
      timestamp: nowStr,
      device_id: 'BIOMETRIC-GATE-01',
      event_type: 'check_in'
    });
    return res.data;
  },

  getProjects: async () => {
    try {
      const res = await api.get('/projects');
      return res.data.projects || [];
    } catch {
      return [];
    }
  },

  getDepartments: async () => {
    try {
      const res = await api.get('/departments');
      return res.data.departments || [];
    } catch {
      return [];
    }
  },

  getHolidays: async () => {
    try {
      const res = await api.get('/holidays');
      return res.data.holidays || [];
    } catch {
      return [];
    }
  },

  getLeaveRequests: async () => {
    try {
      const res = await api.get('/leave/requests');
      return res.data.leave_requests || [];
    } catch {
      return [];
    }
  }
};
