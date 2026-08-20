import React, { useState, useEffect, useRef } from 'react';
import {
  Users, Plus, Search, X, ShieldCheck, Eye, CreditCard, Laptop, Target, Award, FileText, UserCheck, Phone, Mail, Calendar, MapPin, Building, AlertCircle, CheckCircle2, Key, Edit3, Save
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export const EmployeesPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const isHR = user?.role === 'Super Admin' || user?.role === 'HR Manager';

  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Full Employee Profile Modal State
  const [selectedEmployeeDetail, setSelectedEmployeeDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'salary' | 'assets' | 'expenses' | 'performance' | 'documents'>('profile');

  // Edit Employee Modal State
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [editFormData, setEditFormData] = useState<any>(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Admin Reset Password State
  const [adminResetPw, setAdminResetPw] = useState('');
  const [adminResetting, setAdminResetting] = useState(false);

  // Form state for creating employee
  const [formData, setFormData] = useState({
    email: '',
    password: 'Employee@123',
    first_name: '',
    last_name: '',
    cnic: '',
    employee_code: '',
    designation: '',
    department_id: 1,
    employment_type: 'full_time',
    location: 'Main Office / HQ',
    joining_date: new Date().toISOString().split('T')[0],
    basic_salary: 150000,
    security_deduction_rate: 5.0,
    tax_bracket_rate: 2.5
  });

  const [submitting, setSubmitting] = useState(false);
  const profileModalRef = useRef<HTMLDivElement>(null);
  const editModalRef = useRef<HTMLDivElement>(null);

  // CNIC & Email Regex Validation Guards
  const isCnicValid = /^\d{5}-\d{7}-\d{1}$/.test(formData.cnic);
  const isEmailValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(formData.email);

  const isEditCnicValid = editFormData ? /^\d{5}-\d{7}-\d{1}$/.test(editFormData.cnic) : true;
  const isEditEmailValid = editFormData ? /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(editFormData.email) : true;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    fetchEmployees();
  }, [debouncedSearch]);

  // Clickaway & Escape key handlers for modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileModalRef.current && !profileModalRef.current.contains(event.target as Node)) {
        if (!editingEmployee) setSelectedEmployeeDetail(null);
      }
      if (editModalRef.current && !editModalRef.current.contains(event.target as Node)) {
        setEditingEmployee(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (editingEmployee) {
          setEditingEmployee(null);
        } else {
          setSelectedEmployeeDetail(null);
          setShowAddModal(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [editingEmployee]);

  const fetchEmployees = async () => {
    try {
      const res = await api.get(`/employees?search=${debouncedSearch}`);
      setEmployees(res.data.employees || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRegisterModal = async () => {
    setShowAddModal(true);
    try {
      const res = await api.get('/employees/next-code');
      if (res.data?.next_code) {
        setFormData((prev) => ({ ...prev, employee_code: res.data.next_code }));
      }
    } catch (e) {
      console.error('Failed to fetch next employee code', e);
    }
  };

  const handleViewEmployeeProfile = async (empId: string) => {
    setLoadingDetail(true);
    setActiveTab('profile');
    try {
      const res = await api.get(`/employees/${empId}`);
      setSelectedEmployeeDetail(res.data);
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to fetch employee details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleOpenEditModal = async (empId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await api.get(`/employees/${empId}`);
      const emp = res.data;
      setEditingEmployee(emp);
      setEditFormData({
        id: emp.id,
        employee_code: emp.employee_code,
        first_name: emp.first_name,
        last_name: emp.last_name,
        email: emp.email,
        cnic: emp.cnic,
        phone: emp.phone || '',
        designation: emp.designation,
        department_id: emp.department_id || 1,
        location: emp.location || 'Main Office',
        employment_type: emp.employment_type || 'full_time',
        joining_date: emp.joining_date || new Date().toISOString().split('T')[0],
        status: emp.status || 'active',
        basic_salary: emp.salary_structure?.basic_salary || 180000,
        security_deduction_rate: 5.0,
        tax_bracket_rate: emp.salary_structure?.tax_bracket_rate || 2.5,
        emergency_contact: emp.emergency_contact || { name: '', phone: '', relation: '' }
      });
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to fetch employee data for editing');
    }
  };

  // Helper to format CNIC input as XXXXX-XXXXXXX-X automatically
  const handleCnicChange = (raw: string, isEdit = false) => {
    const digits = raw.replace(/\D/g, '').slice(0, 13);
    let formatted = digits;
    if (digits.length > 5 && digits.length <= 12) {
      formatted = `${digits.slice(0, 5)}-${digits.slice(5)}`;
    } else if (digits.length > 12) {
      formatted = `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
    }
    if (isEdit) {
      setEditFormData((prev: any) => ({ ...prev, cnic: formatted }));
    } else {
      setFormData((prev) => ({ ...prev, cnic: formatted }));
    }
  };

  const handleAdminResetPassword = async () => {
    if (!selectedEmployeeDetail?.id) return;
    const pwToSet = adminResetPw.trim() || 'Employee@123';
    if (pwToSet.length < 6) {
      alert('Password must be at least 6 characters long.');
      return;
    }
    setAdminResetting(true);
    try {
      const res = await api.post(`/auth/reset-employee-password/${selectedEmployeeDetail.id}`, { new_password: pwToSet });
      alert(`✓ ${res.data?.message || 'Password reset successfully!'}`);
      setAdminResetPw('');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to reset password');
    } finally {
      setAdminResetting(false);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isCnicValid) {
      alert('Invalid CNIC Format! CNIC must be 13 digits formatted as XXXXX-XXXXXXX-X (e.g. 42101-1234567-1).');
      return;
    }

    if (!isEmailValid) {
      alert('Invalid Email Format! Enter a valid email address (e.g. employee@maxenius.com).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/employees', formData);
      alert(
        `✓ Employee Account & ESS Profile Created!\n\n` +
        `• Employee Code: ${res.data.employee_code}\n` +
        `• Login Email: ${formData.email}\n` +
        `• Temporary Password: ${formData.password}\n\n` +
        `The employee can now log in at /login using these credentials.`
      );
      setShowAddModal(false);
      setFormData({
        email: '',
        password: 'Employee@123',
        first_name: '',
        last_name: '',
        cnic: '',
        employee_code: '',
        designation: '',
        department_id: 1,
        employment_type: 'full_time',
        location: 'Main Office / HQ',
        joining_date: new Date().toISOString().split('T')[0],
        basic_salary: 150000,
        security_deduction_rate: 5.0,
        tax_bracket_rate: 2.5
      });
      fetchEmployees();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Error creating employee');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEditEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditCnicValid) {
      alert('Invalid CNIC Format! CNIC must be 13 digits formatted as XXXXX-XXXXXXX-X.');
      return;
    }
    if (!isEditEmailValid) {
      alert('Invalid Email Format!');
      return;
    }

    setSubmittingEdit(true);
    try {
      await api.patch(`/employees/${editFormData.id}`, editFormData);
      alert(`✓ Employee Record (${editFormData.employee_code}) updated successfully!`);
      setEditingEmployee(null);
      fetchEmployees();

      if (selectedEmployeeDetail && selectedEmployeeDetail.id === editFormData.id) {
        handleViewEmployeeProfile(editFormData.id);
      }
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update employee record');
    } finally {
      setSubmittingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 industrial-card p-6 bg-white border border-[#CBD5E1]">
        <div>
          <h1 className="text-lg font-bold text-[#0F172A] flex items-center gap-2 font-mono uppercase tracking-wider">
            <Users className="w-5 h-5 text-[#0D9488]" />
            WORKFORCE DIRECTORY LOG
          </h1>
          <p className="text-xs text-[#64748B] mt-1 font-sans">
            Central employee registry, 360° profile views, salary structures & department governance
          </p>
        </div>

        {isHR && (
          <button
            onClick={handleOpenRegisterModal}
            className="py-2 px-4 rounded bg-[#0D9488] text-white font-mono font-bold text-xs hover:bg-[#0F766E] transition-all flex items-center gap-2 shadow-sm uppercase tracking-wider cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            REGISTER EMPLOYEE
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code (EMP-001), name, or CNIC..."
            className="w-full py-2.5 pl-10 pr-4 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
          />
        </div>
      </div>

      {/* Data Table */}
      <div className="industrial-card overflow-hidden bg-white border border-[#CBD5E1]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#0F172A]">
            <thead className="bg-[#0F172A] text-white font-mono font-bold uppercase tracking-wider">
              <tr>
                <th className="p-4">CODE</th>
                <th className="p-4">EMPLOYEE NAME</th>
                <th className="p-4">DEPARTMENT & DESIGNATION</th>
                <th className="p-4">CNIC</th>
                <th className="p-4">JOINING DATE</th>
                <th className="p-4">STATUS</th>
                <th className="p-4 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] font-sans">
              {employees.length > 0 ? (
                employees.map((emp) => (
                  <tr
                    key={emp.id}
                    onClick={() => handleViewEmployeeProfile(emp.id)}
                    className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                  >
                    <td className="p-4 font-mono font-bold">
                      <span className="px-2 py-1 bg-[#CCFBF1] border border-[#99F6E4] rounded text-[#0F766E]">
                        {emp.employee_code}
                      </span>
                    </td>
                    <td className="p-4 font-medium text-[#0F172A]">
                      <div className="group-hover:text-[#0D9488] font-semibold transition-colors">
                        {emp.first_name} {emp.last_name}
                      </div>
                      <div className="text-[10px] font-mono text-[#64748B]">{emp.email}</div>
                    </td>
                    <td className="p-4">
                      <div>{emp.designation}</div>
                      <div className="text-[10px] font-mono text-[#0D9488] font-bold uppercase">
                        {emp.department_name || 'Engineering'}
                      </div>
                    </td>
                    <td className="p-4 font-mono text-[#475569]">{emp.cnic}</td>
                    <td className="p-4 font-mono text-[#475569]">{emp.joining_date}</td>
                    <td className="p-4 font-mono">
                      <span className="px-2.5 py-0.5 text-[10px] font-bold chip-approved rounded uppercase">
                        {emp.status}
                      </span>
                    </td>
                    <td className="p-4 text-right font-mono flex items-center justify-end gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewEmployeeProfile(emp.id);
                        }}
                        className="px-2.5 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#334155] border border-[#CBD5E1] rounded text-[10px] font-bold uppercase transition-colors inline-flex items-center gap-1 cursor-pointer"
                        title="View Complete Profile"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#0D9488]" /> VIEW
                      </button>

                      {isHR && (
                        <button
                          onClick={(e) => handleOpenEditModal(emp.id, e)}
                          className="px-2.5 py-1 bg-[#0F172A] hover:bg-[#1E293B] text-white rounded text-[10px] font-bold uppercase transition-colors inline-flex items-center gap-1 cursor-pointer border border-[#1E293B]"
                          title="Edit Employee Record"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#14B8A6]" /> EDIT
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-[#64748B] font-mono">
                    {loading ? 'LOADING EMPLOYEE RECORDS...' : 'NO RECORDS FOUND.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Complete 360° Employee Profile Details Modal */}
      {selectedEmployeeDetail && (
        <div className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div
            ref={profileModalRef}
            className="bg-white border border-[#CBD5E1] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col font-sans animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="p-5 bg-[#0F172A] text-white flex items-center justify-between font-mono shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#1E293B] border border-[#0D9488] text-[#14B8A6] font-bold text-sm flex items-center justify-center font-mono">
                  {selectedEmployeeDetail.first_name[0]}{selectedEmployeeDetail.last_name[0]}
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                    {selectedEmployeeDetail.first_name} {selectedEmployeeDetail.last_name}
                    <span className="px-2 py-0.5 text-[10px] bg-[#CCFBF1] text-[#0F766E] rounded font-bold">
                      {selectedEmployeeDetail.employee_code}
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#94A3B8] font-sans">
                    {selectedEmployeeDetail.designation} • {selectedEmployeeDetail.department_name || 'Engineering'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isHR && (
                  <button
                    onClick={() => handleOpenEditModal(selectedEmployeeDetail.id)}
                    className="py-1.5 px-3 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-mono text-[10px] font-bold uppercase flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-white" /> EDIT RECORD
                  </button>
                )}

                <button
                  onClick={() => setSelectedEmployeeDetail(null)}
                  className="text-[#94A3B8] hover:text-white transition-colors cursor-pointer p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Profile Navigation Tabs */}
            <div className="flex items-center gap-1 px-5 pt-3 bg-[#F8FAFC] border-b border-[#CBD5E1] font-mono text-xs overflow-x-auto shrink-0">
              {[
                { key: 'profile', label: 'Overview & ESS', icon: Users },
                ...(
                  user && (
                    user.role === 'Super Admin' ||
                    user.role === 'HR Manager' ||
                    user.role === 'Finance Admin' ||
                    (selectedEmployeeDetail && user.employee && String(user.employee.id) === String(selectedEmployeeDetail.id))
                  ) ? [{ key: 'salary', label: 'Compensation & Escrow', icon: CreditCard }] : []
                ),
                { key: 'assets', label: `Assigned Assets (${selectedEmployeeDetail.assigned_assets?.length || 0})`, icon: Laptop },
                { key: 'expenses', label: `Expense Claims (${selectedEmployeeDetail.expense_claims?.length || 0})`, icon: Building },
                { key: 'performance', label: 'Performance & OKRs', icon: Target },
                { key: 'documents', label: `Documents (${selectedEmployeeDetail.documents?.length || 0})`, icon: FileText }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`px-3 py-2 border-b-2 font-bold text-[11px] uppercase transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'border-[#0D9488] text-[#0D9488] bg-white'
                        : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-[#0D9488]' : 'text-[#94A3B8]'}`} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Modal Body / Tab Content */}
            <div className="p-6 overflow-y-auto space-y-4 font-mono text-xs flex-1">
              {/* Tab 1: Overview & ESS */}
              {activeTab === 'profile' && (
                <div className="space-y-4">
                  {/* Employee Login Credentials Info Banner */}
                  <div className="p-3 bg-[#F0FDFA] border border-[#99F6E4] rounded-lg font-mono text-[11px] space-y-1">
                    <div className="font-bold text-[#0F766E] uppercase flex items-center gap-1.5">
                      <Key className="w-4 h-4 text-[#0D9488]" /> SYSTEM LOGIN AUTHENTICATION
                    </div>
                    <div className="text-[#134E4A] font-sans">
                      This employee logs into the Maxenius Portal at <span className="font-mono font-bold text-[#0F172A]">/login</span> using their Work Email: <span className="font-mono font-bold text-[#0D9488]">{selectedEmployeeDetail.email}</span>.
                    </div>
                  </div>

                  {/* Admin Reset Password Subsection */}
                  {isHR && (
                    <div className="p-3.5 bg-[#FEF3C7] border border-[#FDE68A] rounded space-y-2 font-mono">
                      <div className="text-[10px] font-bold text-[#92400E] uppercase flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><Key className="w-3.5 h-3.5 text-[#D97706]" /> RESET ACCESS PASSWORD (ADMIN CONTROL)</span>
                        <span className="text-[9px] bg-white px-2 py-0.5 rounded text-[#D97706] font-bold border border-[#FDE68A]">HR / ADMIN ACCESS</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Enter new password (default: Employee@123)"
                          value={adminResetPw}
                          onChange={(e) => setAdminResetPw(e.target.value)}
                          className="flex-1 p-2 text-xs bg-white border border-[#CBD5E1] rounded font-mono font-bold text-[#0F172A]"
                        />
                        <button
                          type="button"
                          onClick={handleAdminResetPassword}
                          disabled={adminResetting}
                          className="py-2 px-4 bg-[#D97706] hover:bg-[#B45309] text-white font-bold rounded text-[10px] uppercase shrink-0 shadow cursor-pointer"
                        >
                          {adminResetting ? 'RESETTING...' : 'RESET PASSWORD'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
                    <div className="p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded space-y-2">
                      <div className="text-[10px] font-bold text-[#0D9488] uppercase tracking-wider">JOB INFORMATION</div>
                      <div className="space-y-1 text-xs">
                        <div><span className="text-[#64748B]">Code:</span> <span className="font-bold">{selectedEmployeeDetail.employee_code}</span></div>
                        <div><span className="text-[#64748B]">Designation:</span> <span>{selectedEmployeeDetail.designation}</span></div>
                        <div><span className="text-[#64748B]">Department:</span> <span className="font-bold text-[#0D9488]">{selectedEmployeeDetail.department_name || 'Engineering'}</span></div>
                        <div><span className="text-[#64748B]">Employment Type:</span> <span className="uppercase font-bold">{selectedEmployeeDetail.employment_type || 'full_time'}</span></div>
                        <div><span className="text-[#64748B]">Joining Date:</span> <span>{selectedEmployeeDetail.joining_date}</span></div>
                        <div><span className="text-[#64748B]">Work Location:</span> <span>{selectedEmployeeDetail.location || 'Main Office'}</span></div>
                        <div><span className="text-[#64748B]">Status:</span> <span className="px-2 py-0.5 text-[10px] font-bold bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] rounded uppercase">{selectedEmployeeDetail.status}</span></div>
                      </div>
                    </div>

                    <div className="p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded space-y-2">
                      <div className="text-[10px] font-bold text-[#0D9488] uppercase tracking-wider">PERSONAL & CONTACT DETAILS</div>
                      <div className="space-y-1 text-xs">
                        <div><span className="text-[#64748B]">Work Email:</span> <span className="font-bold text-[#0F172A]">{selectedEmployeeDetail.email}</span></div>
                        <div><span className="text-[#64748B]">CNIC / National ID:</span> <span className="font-bold">{selectedEmployeeDetail.cnic}</span></div>
                        <div><span className="text-[#64748B]">Phone Number:</span> <span>{selectedEmployeeDetail.phone || 'N/A'}</span></div>
                        <div><span className="text-[#64748B]">Gender Identity:</span> <span>{selectedEmployeeDetail.emergency_contact?.gender || 'Unspecified'}</span></div>
                        <div><span className="text-[#64748B]">Date of Birth:</span> <span>{selectedEmployeeDetail.emergency_contact?.dob || 'N/A'}</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Emergency Contact */}
                  <div className="p-3.5 bg-[#F0FDFA] border border-[#99F6E4] rounded space-y-1.5">
                    <div className="text-[10px] font-bold text-[#0F766E] uppercase tracking-wider">EMERGENCY CONTACT PERSON</div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div><span className="text-[#64748B]">Contact Person:</span> <span className="font-bold text-[#0F172A]">{selectedEmployeeDetail.emergency_contact?.name || 'Not Provided'}</span></div>
                      <div><span className="text-[#64748B]">Phone:</span> <span className="font-bold text-[#0D9488]">{selectedEmployeeDetail.emergency_contact?.phone || 'N/A'}</span></div>
                      <div><span className="text-[#64748B]">Relationship:</span> <span>{selectedEmployeeDetail.emergency_contact?.relation || 'N/A'}</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Salary Structure & Escrow */}
              {activeTab === 'salary' && selectedEmployeeDetail.salary_structure && (
                <div className="space-y-4">
                  <div className="p-4 bg-[#CCFBF1] border border-[#99F6E4] rounded space-y-1">
                    <div className="text-[10px] font-bold text-[#0F766E] uppercase tracking-wider">5% SECURITY HOLDBACK POLICY</div>
                    <div className="text-xs font-bold text-[#0F766E]">
                      Monthly Escrowed Amount: PKR {selectedEmployeeDetail.salary_structure.security_holdback.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-[11px] text-[#134E4A] font-sans">
                      5.0% of basic salary is escrowed each month per Maxenius operational rules.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded">
                      <div className="text-[10px] text-[#64748B] uppercase">Basic Salary</div>
                      <div className="text-sm font-extrabold text-[#0F172A]">PKR {selectedEmployeeDetail.salary_structure.basic_salary.toLocaleString()}</div>
                    </div>
                    <div className="p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded">
                      <div className="text-[10px] text-[#64748B] uppercase">Total Allowances</div>
                      <div className="text-sm font-extrabold text-[#0D9488]">PKR {selectedEmployeeDetail.salary_structure.total_allowances.toLocaleString()}</div>
                    </div>
                    <div className="p-3 bg-[#CCFBF1] border border-[#99F6E4] rounded">
                      <div className="text-[10px] text-[#0F766E] uppercase font-bold">5% Holdback</div>
                      <div className="text-sm font-extrabold text-[#0F766E]">PKR {selectedEmployeeDetail.salary_structure.security_holdback.toLocaleString()}</div>
                    </div>
                    <div className="p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded">
                      <div className="text-[10px] text-[#64748B] uppercase">Tax Bracket</div>
                      <div className="text-sm font-extrabold text-[#DC2626]">{selectedEmployeeDetail.salary_structure.tax_bracket_rate}%</div>
                    </div>
                  </div>

                  {selectedEmployeeDetail.salary_structure.allowances && (
                    <div className="p-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded space-y-2">
                      <div className="text-[10px] font-bold text-[#64748B] uppercase">ALLOWANCES BREAKDOWN</div>
                      <div className="grid grid-cols-3 gap-2">
                        {Object.entries(selectedEmployeeDetail.salary_structure.allowances).map(([k, v]: [string, any]) => (
                          <div key={k} className="p-2 bg-white border border-[#CBD5E1] rounded">
                            <div className="text-[10px] text-[#64748B] uppercase">{k}</div>
                            <div className="font-bold text-[#0F172A]">PKR {Number(v).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Assigned Assets */}
              {activeTab === 'assets' && (
                <div className="space-y-3">
                  {selectedEmployeeDetail.assigned_assets && selectedEmployeeDetail.assigned_assets.length > 0 ? (
                    <div className="divide-y divide-[#E2E8F0] border border-[#CBD5E1] rounded-lg overflow-hidden">
                      <div className="bg-[#0F172A] text-white p-3 font-bold text-[11px] uppercase flex items-center justify-between">
                        <span>DEVICE / MODEL</span>
                        <span>TAG ID</span>
                      </div>
                      {selectedEmployeeDetail.assigned_assets.map((asset: any) => (
                        <div key={asset.id} className="p-3 bg-white flex items-center justify-between hover:bg-[#F8FAFC]">
                          <div>
                            <div className="font-bold text-[#0F172A] text-xs">{asset.model}</div>
                            <div className="text-[10px] text-[#64748B]">{asset.category.toUpperCase()} • SN: {asset.serial_number || 'N/A'} • Assigned {asset.assigned_date}</div>
                          </div>
                          <span className="px-2.5 py-1 bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4] font-bold rounded text-[10px]">
                            {asset.asset_tag}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-[#64748B] bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded">
                      No hardware company assets currently assigned to this employee.
                    </div>
                  )}
                </div>
              )}

              {/* Tab 4: Expense Claims */}
              {activeTab === 'expenses' && (
                <div className="space-y-3">
                  {selectedEmployeeDetail.expense_claims && selectedEmployeeDetail.expense_claims.length > 0 ? (
                    <div className="divide-y divide-[#E2E8F0] border border-[#CBD5E1] rounded-lg overflow-hidden">
                      <div className="bg-[#0F172A] text-white p-3 font-bold text-[11px] uppercase flex items-center justify-between">
                        <span>CATEGORY / DESCRIPTION</span>
                        <span>AMOUNT & STATUS</span>
                      </div>
                      {selectedEmployeeDetail.expense_claims.map((claim: any) => (
                        <div key={claim.id} className="p-3 bg-white flex items-center justify-between hover:bg-[#F8FAFC]">
                          <div>
                            <div className="font-bold text-[#0D9488] text-xs">{claim.category} — {claim.claim_date}</div>
                            <div className="text-[11px] text-[#334155] font-sans">{claim.description || 'No notes'}</div>
                            {claim.rejection_reason && (
                              <div className="text-[10px] text-[#DC2626] font-bold">Reason: {claim.rejection_reason}</div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-extrabold text-xs text-[#0F172A]">PKR {claim.amount.toLocaleString()}</div>
                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase ${
                              claim.status === 'reimbursed' ? 'bg-[#ECFEFF] text-[#0891B2]' : claim.status === 'approved' ? 'bg-[#ECFDF5] text-[#047857]' : claim.status === 'rejected' ? 'bg-[#FEF2F2] text-[#DC2626]' : 'bg-[#FEF3C7] text-[#D97706]'
                            }`}>
                              {claim.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-[#64748B] bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded">
                      No expense reimbursement claims filed by this employee.
                    </div>
                  )}
                </div>
              )}

              {/* Tab 5: Performance & OKRs */}
              {activeTab === 'performance' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-[#0F172A] uppercase">PERFORMANCE EVALUATION REVIEWS</div>
                    {selectedEmployeeDetail.performance_reviews && selectedEmployeeDetail.performance_reviews.length > 0 ? (
                      selectedEmployeeDetail.performance_reviews.map((rev: any) => (
                        <div key={rev.id} className="p-3 bg-white border border-[#CBD5E1] rounded space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-[#0D9488]">CYCLE {rev.cycle}</span>
                            <span className="px-2 py-0.5 bg-[#ECFDF5] text-[#047857] font-bold text-[10px] rounded border border-[#A7F3D0]">
                              KPI SCORE: {rev.kpi_score} / 5.0
                            </span>
                          </div>
                          <p className="text-xs text-[#334155] font-sans italic p-2 bg-[#F8FAFC] rounded border-l-2 border-[#0D9488]">"{rev.feedback}"</p>
                          <div className="text-[10px] text-[#64748B]">Evaluated by {rev.reviewer_name} on {rev.created_at}</div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-[#64748B] bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded">
                        No performance evaluation records logged yet.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-[#0F172A] uppercase">QUARTERLY GOALS & OKRs</div>
                    {selectedEmployeeDetail.performance_goals && selectedEmployeeDetail.performance_goals.length > 0 ? (
                      selectedEmployeeDetail.performance_goals.map((goal: any) => (
                        <div key={goal.id} className="p-3 bg-white border border-[#CBD5E1] rounded space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-[#0F172A]">{goal.title}</span>
                            <span className="text-[10px] text-[#0D9488] font-bold uppercase">{goal.cycle}</span>
                          </div>
                          <p className="text-xs text-[#334155] font-sans">{goal.description || 'No description'}</p>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-[#64748B] bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded">
                        No active goals assigned yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 6: Documents Vault */}
              {activeTab === 'documents' && (
                <div className="space-y-3">
                  {selectedEmployeeDetail.documents && selectedEmployeeDetail.documents.length > 0 ? (
                    <div className="divide-y divide-[#E2E8F0] border border-[#CBD5E1] rounded-lg overflow-hidden">
                      {selectedEmployeeDetail.documents.map((doc: any) => (
                        <div key={doc.id} className="p-3 bg-white flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-[#0D9488]" />
                            <div>
                              <div className="font-bold text-[#0F172A] text-xs uppercase">{doc.doc_type}</div>
                              <div className="text-[10px] text-[#64748B]">Uploaded {doc.uploaded_at}</div>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-[#0D9488]">📎 {doc.storage_key}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-[#64748B] bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded">
                      No compliance documents uploaded in vault yet.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#F8FAFC] border-t border-[#CBD5E1] flex justify-end font-mono shrink-0">
              <button
                onClick={() => setSelectedEmployeeDetail(null)}
                className="py-2 px-4 rounded bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                CLOSE PROFILE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Edit Employee Profile (Admin / Super Admin) */}
      {editingEmployee && editFormData && (
        <div className="fixed inset-0 bg-[#0F172A]/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div
            ref={editModalRef}
            className="industrial-card-raised w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto relative border border-[#CBD5E1] bg-white text-[#0F172A] rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          >
            <button
              onClick={() => setEditingEmployee(null)}
              className="absolute top-4 right-4 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-sm font-mono font-bold text-[#0F172A] mb-4 uppercase tracking-wider border-b border-[#E2E8F0] pb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#0D9488]" /> EDIT EMPLOYEE PROFILE ({editFormData.employee_code})
              </span>
              <span className="px-2 py-0.5 text-[10px] bg-[#CCFBF1] text-[#0F766E] rounded font-bold">
                READ-ONLY CODE
              </span>
            </h2>

            <form onSubmit={handleSaveEditEmployee} className="space-y-4 text-xs font-sans">
              {/* Row 1: Employee Code & CNIC */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold flex items-center justify-between">
                    <span>EMPLOYEE CODE</span>
                    <span className="text-[9px] text-[#0D9488] bg-[#CCFBF1] px-1.5 py-0.5 rounded font-mono font-bold">IMMUTABLE</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={editFormData.employee_code || ''}
                    className="w-full p-2.5 rounded industrial-input font-mono bg-[#F8FAFC] text-[#0F766E] font-bold cursor-not-allowed border-[#CBD5E1]"
                  />
                </div>
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold flex items-center justify-between">
                    <span>CNIC NUMBER *</span>
                    <span className={`text-[9px] font-mono ${isEditCnicValid ? 'text-[#047857]' : 'text-[#DC2626]'}`}>
                      {isEditCnicValid ? '✓ 13 DIGITS' : 'INVALID'}
                    </span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.cnic || ''}
                    onChange={(e) => handleCnicChange(e.target.value, true)}
                    maxLength={15}
                    placeholder="42101-1234567-1"
                    className={`w-full p-2.5 rounded industrial-input font-mono ${
                      isEditCnicValid ? 'border-[#CBD5E1]' : 'border-[#EF4444] bg-[#FEF2F2]'
                    }`}
                  />
                </div>
              </div>

              {/* Row 2: First Name & Last Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">FIRST NAME *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.first_name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, first_name: e.target.value })}
                    className="w-full p-2.5 rounded industrial-input font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">LAST NAME *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.last_name || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, last_name: e.target.value })}
                    className="w-full p-2.5 rounded industrial-input font-sans"
                  />
                </div>
              </div>

              {/* Row 3: Work Email & Work Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold flex items-center justify-between">
                    <span>WORK EMAIL *</span>
                    <span className={`text-[9px] font-mono ${isEditEmailValid ? 'text-[#047857]' : 'text-[#DC2626]'}`}>
                      {isEditEmailValid ? '✓ VALID' : 'INVALID'}
                    </span>
                  </label>
                  <input
                    type="email"
                    required
                    value={editFormData.email || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className={`w-full p-2.5 rounded industrial-input font-mono ${
                      isEditEmailValid ? 'border-[#CBD5E1]' : 'border-[#EF4444] bg-[#FEF2F2]'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">WORK LOCATION</label>
                  <input
                    type="text"
                    value={editFormData.location || 'Main Office / HQ'}
                    onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                    placeholder="Main Office / HQ, Remote, Client Site"
                    className="w-full p-2.5 rounded industrial-input font-sans"
                  />
                </div>
              </div>

              {/* Row 4: Designation & Department Dropdown */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">DESIGNATION *</label>
                  <input
                    type="text"
                    required
                    value={editFormData.designation || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                    placeholder="e.g. Senior Software Engineer"
                    className="w-full p-2.5 rounded industrial-input font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">DEPARTMENT *</label>
                  <select
                    value={editFormData.department_id || 1}
                    onChange={(e) => setEditFormData({ ...editFormData, department_id: Number(e.target.value) })}
                    className="w-full p-2.5 rounded industrial-input font-mono bg-white border-[#CBD5E1]"
                  >
                    <option value={1}>SOFTWARE ENGINEERING</option>
                    <option value={2}>HUMAN RESOURCES</option>
                    <option value={3}>FINANCE & ACCOUNTS</option>
                    <option value={4}>QUALITY ASSURANCE</option>
                    <option value={5}>PRODUCT & DESIGN</option>
                    <option value={6}>GENERAL OPERATIONS</option>
                  </select>
                </div>
              </div>

              {/* Row 5: Employment Type, Joining Date & Account Status */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">EMPLOYMENT TYPE</label>
                  <select
                    value={editFormData.employment_type || 'full_time'}
                    onChange={(e) => setEditFormData({ ...editFormData, employment_type: e.target.value })}
                    className="w-full p-2.5 rounded industrial-input font-mono bg-white border-[#CBD5E1]"
                  >
                    <option value="full_time">FULL_TIME</option>
                    <option value="part_time">PART_TIME</option>
                    <option value="contract">CONTRACT</option>
                    <option value="intern">INTERN</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">JOINING DATE</label>
                  <input
                    type="date"
                    value={editFormData.joining_date || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, joining_date: e.target.value })}
                    className="w-full p-2.5 rounded industrial-input font-mono bg-white border-[#CBD5E1]"
                  />
                </div>
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">ACCOUNT STATUS</label>
                  <select
                    value={editFormData.status || 'active'}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    className="w-full p-2.5 rounded industrial-input font-mono bg-white border-[#CBD5E1]"
                  >
                    <option value="active">ACTIVE</option>
                    <option value="resigned">RESIGNED</option>
                    <option value="terminated">TERMINATED</option>
                  </select>
                </div>
              </div>

              {/* Salary Structure section */}
              <div className="p-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded space-y-3">
                <div className="industrial-header">SALARY & COMPENSATION GOVERNANCE</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[#334155] font-mono text-[10px] mb-1 font-bold">BASIC SALARY (PKR) *</label>
                    <input
                      type="number"
                      required
                      value={editFormData.basic_salary}
                      onChange={(e) => setEditFormData({ ...editFormData, basic_salary: Number(e.target.value) })}
                      className="w-full p-2.5 rounded industrial-input font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[#0F766E] font-mono text-[10px] font-bold mb-1">5% HOLDBACK RATE</label>
                    <input
                      type="number"
                      step="0.1"
                      readOnly
                      value={editFormData.security_deduction_rate}
                      className="w-full p-2.5 rounded industrial-input font-mono text-[#0F766E] font-bold cursor-not-allowed bg-[#CCFBF1]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#334155] font-mono text-[10px] mb-1 font-bold">TAX BRACKET % *</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={editFormData.tax_bracket_rate}
                      onChange={(e) => setEditFormData({ ...editFormData, tax_bracket_rate: Number(e.target.value) })}
                      className="w-full p-2.5 rounded industrial-input font-mono tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 flex gap-3 font-mono">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="w-1/2 py-2.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] hover:bg-[#E2E8F0] uppercase font-bold cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit || !isEditCnicValid || !isEditEmailValid}
                  className={`w-1/2 py-2.5 rounded text-white font-bold shadow uppercase transition-colors cursor-pointer flex items-center justify-center gap-2 ${
                    isEditCnicValid && isEditEmailValid ? 'bg-[#0D9488] hover:bg-[#0F766E]' : 'bg-[#94A3B8] cursor-not-allowed'
                  }`}
                >
                  <Save className="w-4 h-4 text-white" />
                  {submittingEdit ? 'SAVING CHANGES...' : 'SAVE CHANGES'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Register New Employee Profile with Auto-Generated Code & Strict Validation */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="industrial-card-raised w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto relative border border-[#CBD5E1] bg-white text-[#0F172A] rounded-xl shadow-2xl">
            <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 text-[#64748B] hover:text-[#0F172A] cursor-pointer">
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-sm font-mono font-bold text-[#0F172A] mb-4 uppercase tracking-wider border-b border-[#E2E8F0] pb-2 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#0D9488]" /> REGISTER NEW EMPLOYEE PROFILE
            </h2>

            <form onSubmit={handleCreateEmployee} className="space-y-4 text-xs font-sans">
              {/* Login Credentials Policy Banner */}
              <div className="p-3.5 bg-[#F0FDFA] border border-[#99F6E4] rounded-lg font-mono text-[11px] space-y-2">
                <div className="font-bold text-[#0F766E] uppercase flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-[#0D9488]" /> INITIAL SYSTEM LOGIN CREDENTIALS
                </div>
                <div className="text-[#134E4A] font-sans">
                  Employees log into the Maxenius Portal at <span className="font-mono font-bold text-[#0F172A]">/login</span> using their <span className="font-mono font-bold">Work Email</span> and the initial password below:
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <label className="text-[10px] font-bold text-[#0F766E] uppercase shrink-0">TEMPORARY PASSWORD:</label>
                  <input
                    type="text"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="py-1 px-2.5 bg-white border border-[#CBD5E1] rounded text-xs font-mono font-bold text-[#0F172A] w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold flex items-center justify-between">
                    <span>EMPLOYEE CODE *</span>
                    <span className="text-[9px] text-[#0D9488] bg-[#CCFBF1] px-1.5 py-0.5 rounded font-mono">AUTO-GENERATED</span>
                  </label>
                  <input
                    type="text"
                    required
                    readOnly
                    value={formData.employee_code}
                    className="w-full p-2.5 rounded industrial-input font-mono bg-[#F8FAFC] text-[#0F766E] font-bold cursor-not-allowed border-[#CBD5E1]"
                  />
                </div>
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold flex items-center justify-between">
                    <span>CNIC NUMBER *</span>
                    <span className={`text-[9px] font-mono ${isCnicValid ? 'text-[#047857]' : 'text-[#DC2626]'}`}>
                      {isCnicValid ? '✓ VALID FORMAT' : '13 DIGITS'}
                    </span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.cnic}
                    onChange={(e) => handleCnicChange(e.target.value)}
                    placeholder="42101-1234567-1"
                    maxLength={15}
                    className={`w-full p-2.5 rounded industrial-input font-mono ${
                      formData.cnic ? (isCnicValid ? 'border-[#10B981] bg-[#ECFDF5]' : 'border-[#EF4444] bg-[#FEF2F2]') : 'border-[#CBD5E1]'
                    }`}
                  />
                  <div className="text-[10px] mt-1 font-mono">
                    {formData.cnic ? (
                      isCnicValid ? (
                        <span className="text-[#047857] flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Valid Pakistani CNIC (XXXXX-XXXXXXX-X)</span>
                      ) : (
                        <span className="text-[#DC2626] flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Format required: XXXXX-XXXXXXX-X (13 digits)</span>
                      )
                    ) : (
                      <span className="text-[#64748B]">Must match 13-digit pattern: XXXXX-XXXXXXX-X</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">FIRST NAME *</label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    placeholder="e.g. Zain"
                    className="w-full p-2.5 rounded industrial-input"
                  />
                </div>
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">LAST NAME *</label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    placeholder="e.g. Ali"
                    className="w-full p-2.5 rounded industrial-input"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">WORK EMAIL *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="zain.ali@maxenius.com"
                    className={`w-full p-2.5 rounded industrial-input font-mono ${
                      formData.email ? (isEmailValid ? 'border-[#10B981]' : 'border-[#EF4444]') : 'border-[#CBD5E1]'
                    }`}
                  />
                  {!isEmailValid && formData.email && (
                    <span className="text-[10px] text-[#DC2626] font-mono block mt-0.5">Enter a valid domain email address</span>
                  )}
                </div>
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">WORK LOCATION</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Main Office / HQ, Remote, Client Site"
                    className="w-full p-2.5 rounded industrial-input font-sans"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">DESIGNATION *</label>
                  <input
                    type="text"
                    required
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    placeholder="e.g. Senior Software Engineer"
                    className="w-full p-2.5 rounded industrial-input font-sans"
                  />
                </div>
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">DEPARTMENT *</label>
                  <select
                    value={formData.department_id}
                    onChange={(e) => setFormData({ ...formData, department_id: Number(e.target.value) })}
                    className="w-full p-2.5 rounded industrial-input font-mono bg-white border-[#CBD5E1]"
                  >
                    <option value={1}>SOFTWARE ENGINEERING</option>
                    <option value={2}>HUMAN RESOURCES</option>
                    <option value={3}>FINANCE & ACCOUNTS</option>
                    <option value={4}>QUALITY ASSURANCE</option>
                    <option value={5}>PRODUCT & DESIGN</option>
                    <option value={6}>GENERAL OPERATIONS</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">EMPLOYMENT TYPE *</label>
                  <select
                    value={formData.employment_type}
                    onChange={(e) => setFormData({ ...formData, employment_type: e.target.value })}
                    className="w-full p-2.5 rounded industrial-input font-mono bg-white border-[#CBD5E1]"
                  >
                    <option value="full_time">FULL_TIME</option>
                    <option value="part_time">PART_TIME</option>
                    <option value="contract">CONTRACT</option>
                    <option value="intern">INTERN</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[#334155] font-mono text-[11px] mb-1 font-bold">JOINING DATE *</label>
                  <input
                    type="date"
                    required
                    value={formData.joining_date}
                    onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                    className="w-full p-2.5 rounded industrial-input font-mono bg-white border-[#CBD5E1]"
                  />
                </div>
              </div>

              {/* Salary Structure & Security Holdback section */}
              <div className="p-3.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded space-y-3">
                <div className="industrial-header">SALARY STRUCTURE & 5% HOLDBACK</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[#334155] font-mono text-[10px] mb-1 font-bold">BASIC SALARY (PKR) *</label>
                    <input
                      type="number"
                      required
                      value={formData.basic_salary}
                      onChange={(e) => setFormData({ ...formData, basic_salary: Number(e.target.value) })}
                      className="w-full p-2.5 rounded industrial-input font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[#0F766E] font-mono text-[10px] font-bold mb-1">5% HOLDBACK RATE</label>
                    <input
                      type="number"
                      step="0.1"
                      readOnly
                      value={formData.security_deduction_rate}
                      className="w-full p-2.5 rounded industrial-input font-mono text-[#0F766E] font-bold cursor-not-allowed bg-[#CCFBF1]"
                    />
                  </div>
                  <div>
                    <label className="block text-[#334155] font-mono text-[10px] mb-1 font-bold">TAX BRACKET % *</label>
                    <input
                      type="number"
                      step="0.1"
                      required
                      value={formData.tax_bracket_rate}
                      onChange={(e) => setFormData({ ...formData, tax_bracket_rate: Number(e.target.value) })}
                      className="w-full p-2.5 rounded industrial-input font-mono tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 flex gap-3 font-mono">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="w-1/2 py-2.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] hover:bg-[#E2E8F0] uppercase font-bold cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={submitting || !isCnicValid || !isEmailValid}
                  className={`w-1/2 py-2.5 rounded text-white font-bold shadow uppercase transition-colors cursor-pointer ${
                    isCnicValid && isEmailValid ? 'bg-[#0D9488] hover:bg-[#0F766E]' : 'bg-[#94A3B8] cursor-not-allowed'
                  }`}
                >
                  {submitting ? 'COMMITTING...' : 'COMMIT RECORD'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
