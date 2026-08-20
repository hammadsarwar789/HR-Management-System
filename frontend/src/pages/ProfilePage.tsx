import React, { useState, useEffect, useRef } from 'react';
import {
  User as UserIcon,
  ShieldCheck,
  Lock,
  Upload,
  Trash2,
  FileText,
  CheckCircle,
  AlertCircle,
  Phone,
  Mail,
  Building,
  Briefcase,
  DollarSign,
  Calendar,
  Save,
  FileCheck,
  Camera,
  Sparkles,
  QrCode,
  Copy,
  Download,
  KeyRound,
  X,
  ShieldAlert,
  Check,
  Paperclip,
  Share2,
  Send,
  Inbox,
  Eye,
  Clock
} from 'lucide-react';
import { api, getAvatarUrl } from '../lib/api';
import { useAuthStore } from '../store/authStore';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80'
];

const DEFAULT_DEPARTMENTS = [
  { id: 1, name: 'Software Engineering' },
  { id: 2, name: 'Human Resources' },
  { id: 3, name: 'Finance & Accounts' },
  { id: 4, name: 'Quality Assurance' },
  { id: 5, name: 'Product & Design' },
  { id: 6, name: 'General Operations' }
];

export const ProfilePage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const token = useAuthStore((state) => state.token);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  const [imgError, setImgError] = useState(false);

  // Identity Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [cnic, setCnic] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');

  // Emergency Contact & Profile Picture
  const [emName, setEmName] = useState('');
  const [emPhone, setEmPhone] = useState('');
  const [emRelation, setEmRelation] = useState('');
  const [profilePicUrl, setProfilePicUrl] = useState('');

  // Company Governance Form Fields
  const [designation, setDesignation] = useState('');
  const [departmentId, setDepartmentId] = useState<number | string>(1);
  const [departmentsList, setDepartmentsList] = useState<any[]>(DEFAULT_DEPARTMENTS);
  const [basicSalary, setBasicSalary] = useState<number | string>(0);
  const [employmentType, setEmploymentType] = useState('full_time');
  const [accountStatus, setAccountStatus] = useState('active');
  const [savingGov, setSavingGov] = useState(false);

  // Document Vault Upload Form State
  const [docType, setDocType] = useState('cv');
  const [docName, setDocName] = useState('');
  const [selectedDocFile, setSelectedDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Password Change Form Fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // 2FA Setup & Management State
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showSetup2FAModal, setShowSetup2FAModal] = useState(false);
  const [setup2FAStep, setSetup2FAStep] = useState<'QR' | 'CODES'>('QR');
  const [setupSecret, setSetupSecret] = useState('');
  const [qrCodeBase64, setQrCodeBase64] = useState('');
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [enabling2FA, setEnabling2FA] = useState(false);
  const [backupCodesList, setBackupCodesList] = useState<string[]>([]);

  // 2FA Disable Modal State
  const [showDisable2FAModal, setShowDisable2FAModal] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disabling2FA, setDisabling2FA] = useState(false);

  // Cross-User Document Sharing State
  const [docVaultTab, setDocVaultTab] = useState<'private' | 'shared_with_me' | 'sent_by_me'>('private');
  const [sharedWithMeDocs, setSharedWithMeDocs] = useState<any[]>([]);
  const [sentByMeDocs, setSentByMeDocs] = useState<any[]>([]);
  const [allEmployeesList, setAllEmployeesList] = useState<any[]>([]);

  // Share Document Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [shareTitle, setShareTitle] = useState('');
  const [shareCategory, setShareCategory] = useState('general');
  const [shareTargetType, setShareTargetType] = useState<'employee' | 'line_manager' | 'hr' | 'broadcast'>('employee');
  const [shareRecipientId, setShareRecipientId] = useState('');
  const [sharePermission, setSharePermission] = useState('VIEW');
  const [shareNote, setShareNote] = useState('');
  const [sharingLoading, setSharingLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const shareFileInputRef = useRef<HTMLInputElement>(null);

  const isSuperAdmin = Boolean(
    user && (user.role === 'Super Admin' || user.role === 'SUPER_ADMIN')
  );

  const isCanEditGovernance = Boolean(
    user && (
      user.role === 'Super Admin' ||
      user.role === 'SUPER_ADMIN' ||
      user.role === 'HR Manager' ||
      user.role === 'HR_MANAGER' ||
      user.permissions?.includes('GOVERNANCE_WRITE') ||
      user.permissions?.includes('employee:write')
    )
  );

  useEffect(() => {
    fetchProfile();
  }, []);

  useEffect(() => {
    setImgError(false);
  }, [profilePicUrl]);

  const formatCNIC = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 13);
    if (digits.length <= 5) return digits;
    if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  };

  const fetchProfile = async () => {
    try {
      const res = await api.get('/employees/me');
      const data = res.data;
      setProfileData(data);

      setFirstName(data.first_name || '');
      setLastName(data.last_name || '');
      setWorkEmail(data.email || user?.email || '');
      setCnic(data.cnic || '');
      setPhone(data.phone || '');
      setLocation(data.location || '');

      const em = data.emergency_contact || {};
      setEmName(em.name || '');
      setEmPhone(em.phone || '');
      setEmRelation(em.relationship || '');
      const currentPic = em.profile_picture_url || data.profile_picture_url || '';
      setProfilePicUrl(currentPic);
      updateGlobalAvatar(currentPic);

      setDesignation(data.designation || '');
      setDepartmentId(data.department_id || 1);
      setBasicSalary(data.basic_salary || 0);
      setEmploymentType(data.employment_type || 'full_time');
      setAccountStatus(data.status || 'active');

      // Sync 2FA state from backend and authStore
      setTwoFactorEnabled(Boolean(data.two_factor_enabled ?? user?.two_factor_enabled));

      // Fetch Departments
      try {
        const deptRes = await api.get('/departments');
        if (deptRes.data && Array.isArray(deptRes.data.departments) && deptRes.data.departments.length > 0) {
          setDepartmentsList(deptRes.data.departments);
        }
      } catch (deptErr) {
        console.warn('Using default departments list fallback.');
      }
    } catch (err) {
      console.error('Failed to fetch profile details:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSharedDocs = async () => {
    try {
      const [sharedRes, sentRes] = await Promise.allSettled([
        api.get('/documents/shared-with-me'),
        api.get('/documents/sent-by-me')
      ]);
      if (sharedRes.status === 'fulfilled' && sharedRes.value.data?.shared_documents) {
        setSharedWithMeDocs(sharedRes.value.data.shared_documents);
      }
      if (sentRes.status === 'fulfilled' && sentRes.value.data?.sent_documents) {
        setSentByMeDocs(sentRes.value.data.sent_documents);
      }
    } catch (e) {
      console.warn('Failed to fetch shared documents list:', e);
    }
  };

  const fetchEmployeesList = async () => {
    try {
      const res = await api.get('/employees');
      if (res.data && Array.isArray(res.data.employees)) {
        setAllEmployeesList(res.data.employees);
      }
    } catch (e) {
      console.warn('Failed to fetch employees dropdown list:', e);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchSharedDocs();
    fetchEmployeesList();
  }, []);

  const handleShareFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setShareFile(file);
      if (!shareTitle) {
        const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        setShareTitle(baseName.charAt(0).toUpperCase() + baseName.slice(1));
      }
    }
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareFile) {
      alert('Please select a file to share');
      return;
    }
    if (!shareTitle.trim()) {
      alert('Please enter a document title');
      return;
    }

    setSharingLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', shareFile);
      formData.append('document', shareFile);
      formData.append('title', shareTitle.trim());
      formData.append('document_title', shareTitle.trim());
      formData.append('category', shareCategory);
      formData.append('permission', sharePermission);
      if (shareNote.trim()) formData.append('note', shareNote.trim());

      if (shareTargetType === 'employee') {
        if (!shareRecipientId) {
          alert('Please select a recipient employee');
          setSharingLoading(false);
          return;
        }
        formData.append('recipient_id', shareRecipientId);
      } else if (shareTargetType === 'line_manager') {
        formData.append('target_role', 'LINE_MANAGER');
      } else if (shareTargetType === 'hr') {
        formData.append('target_role', 'HR_ADMIN');
      } else if (shareTargetType === 'broadcast') {
        formData.append('target_role', 'ALL');
      }

      await api.post('/documents/share', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      alert('✓ Document shared successfully!');
      setIsShareModalOpen(false);
      setShareFile(null);
      setShareTitle('');
      setShareNote('');
      setShareRecipientId('');
      if (shareFileInputRef.current) shareFileInputRef.current.value = '';
      fetchSharedDocs();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to share document.');
    } finally {
      setSharingLoading(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    if (!confirm('Are you sure you want to revoke this document share?')) return;
    try {
      await api.delete(`/documents/shares/${shareId}`);
      alert('✓ Share revoked successfully');
      fetchSharedDocs();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to revoke share');
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        first_name: firstName,
        last_name: lastName,
        phone,
        location,
        emergency_contact: {
          name: emName,
          phone: emPhone,
          relationship: emRelation,
          profile_picture_url: profilePicUrl
        }
      };

      if (isSuperAdmin) {
        payload.email = workEmail.trim().toLowerCase();
        payload.work_email = workEmail.trim().toLowerCase();
        payload.cnic = cnic.trim();
      }

      await api.put('/employees/me', payload);
      alert('✓ Profile updated successfully!');

      // Synchronize auth store if Super Admin updated email
      if (isSuperAdmin && user && workEmail.trim().toLowerCase() !== user.email) {
        setUser({ ...user, email: workEmail.trim().toLowerCase() }, token || '');
      }

      fetchProfile();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateGovernance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileData?.id) return;
    setSavingGov(true);
    try {
      const payload = {
        designation,
        department_id: Number(departmentId),
        basic_salary: parseFloat(String(basicSalary)),
        employment_type: employmentType,
        status: accountStatus
      };

      await api.put(`/employees/${profileData.id}`, payload);
      alert('✓ Company Governance & Department updated successfully!');
      fetchProfile();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update governance.');
    } finally {
      setSavingGov(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      alert('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('New password and confirm password do not match.');
      return;
    }

    setUpdatingPassword(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      alert('✓ Security password updated successfully! Please use your new password for future logins.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to update security password.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleStart2FASetup = async () => {
    try {
      const res = await api.post('/auth/2fa/generate');
      setSetupSecret(res.data.secret);
      setQrCodeBase64(res.data.qr_code_base64);
      setTotpVerifyCode('');
      setSetup2FAStep('QR');
      setShowSetup2FAModal(true);
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to generate 2FA setup details.');
    }
  };

  const handleEnable2FAConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!totpVerifyCode || totpVerifyCode.trim().length !== 6) {
      alert('Please enter a valid 6-digit TOTP code from your authenticator app.');
      return;
    }

    setEnabling2FA(true);
    try {
      const res = await api.post('/auth/2fa/enable', {
        secret: setupSecret,
        code: totpVerifyCode.trim()
      });

      setBackupCodesList(res.data.backup_codes || []);
      setSetup2FAStep('CODES');
      setTwoFactorEnabled(true);
      if (user) setUser({ ...user, two_factor_enabled: true }, token || '');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Invalid TOTP code. Ensure your device time is accurate.');
    } finally {
      setEnabling2FA(false);
    }
  };

  const handleDisable2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword) {
      alert('Current password is required to disable 2FA.');
      return;
    }

    setDisabling2FA(true);
    try {
      await api.post('/auth/2fa/disable', {
        current_password: disablePassword,
        code: disableCode.trim()
      });

      alert('✓ Two-Factor Authentication (2FA) has been disabled.');
      setTwoFactorEnabled(false);
      if (user) setUser({ ...user, two_factor_enabled: false }, token || '');
      setShowDisable2FAModal(false);
      setDisablePassword('');
      setDisableCode('');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to disable 2FA.');
    } finally {
      setDisabling2FA(false);
    }
  };

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodesList.join('\n'));
    alert('✓ Backup recovery codes copied to clipboard!');
  };

  const handleDownloadBackupCodes = () => {
    const text = `# MAXENIUS HRMS 2FA RECOVERY CODES\n# KEEP THESE CODES SECURE - EACH CODE CAN BE USED ONCE\n\n` + backupCodesList.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `maxenius_2fa_backup_codes_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const updateGlobalAvatar = (newUrl: string) => {
    if (user) {
      const updatedUser = {
        ...user,
        employee: {
          ...(user.employee || { id: '', employee_code: '', first_name: '', last_name: '', designation: '' }),
          profile_picture_url: newUrl
        }
      };
      setUser(updatedUser, token || '');
    }
  };

  const handleAvatarSelect = async (url: string) => {
    setProfilePicUrl(url);
    updateGlobalAvatar(url);
    try {
      const res = await api.post('/employees/me/avatar', { profile_picture_url: url });
      const finalUrl = res.data.profile_picture_url || url;
      setProfilePicUrl(finalUrl);
      updateGlobalAvatar(finalUrl);
      fetchProfile();
    } catch (err: any) {
      console.warn('Failed to persist preset avatar:', err);
    }
  };

  const handleRemovePhoto = async () => {
    if (!confirm('Are you sure you want to remove your profile photo?')) return;
    try {
      await api.delete('/employees/me/avatar');
      setProfilePicUrl('');
      updateGlobalAvatar('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      alert('✓ Profile photo removed successfully!');
      fetchProfile();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to remove profile photo.');
    }
  };

  const handleCustomPicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Profile picture size must be under 2MB.');
      return;
    }

    // 1. Instant local image preview feedback
    const localPreview = URL.createObjectURL(file);
    setProfilePicUrl(localPreview);
    updateGlobalAvatar(localPreview);

    // 2. Read file & dispatch payload to backend endpoint
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result as string;
      try {
        const res = await api.post('/employees/me/avatar', { avatar_data: base64Data });
        const finalUrl = res.data.profile_picture_url || localPreview;
        setProfilePicUrl(finalUrl);
        updateGlobalAvatar(finalUrl);
        alert('✓ Profile photo updated successfully!');
        fetchProfile();
      } catch (err: any) {
        alert(err.response?.data?.error?.message || 'Failed to upload profile photo.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDocFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('Document file size must be under 10MB.');
      return;
    }

    setSelectedDocFile(file);
    if (!docName) {
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setDocName(baseName.charAt(0).toUpperCase() + baseName.slice(1));
    }
  };

  const handleClearSelectedDocFile = () => {
    setSelectedDocFile(null);
    if (docFileInputRef.current) docFileInputRef.current.value = '';
  };

  const handleDocUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    // If no file is selected, open OS file explorer prompt
    if (!selectedDocFile) {
      docFileInputRef.current?.click();
      return;
    }

    if (!docName.trim()) {
      alert('Please enter a document title');
      return;
    }

    console.log("Uploading title:", docName.trim());
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedDocFile);
      formData.append('document', selectedDocFile);
      formData.append('title', docName.trim());
      formData.append('document_title', docName.trim());
      formData.append('document_name', docName.trim());
      formData.append('name', docName.trim());
      formData.append('category', docType);
      formData.append('document_type', docType);

      await api.post(`/employees/${profileData.id}/documents`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      alert('✓ Document uploaded successfully!');
      setDocName('');
      setSelectedDocFile(null);
      if (docFileInputRef.current) docFileInputRef.current.value = '';
      fetchProfile();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to upload document.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDocDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document from your profile?')) return;
    try {
      await api.delete(`/employees/${profileData.id}/documents/${docId}`);
      alert('✓ Document deleted successfully!');
      fetchProfile();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to delete document.');
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center font-mono text-[#64748B] text-xs">
        LOADING EMPLOYEE PROFILE GOVERNANCE...
      </div>
    );
  }

  const company = profileData || {};
  const documents = company.documents || [];

  return (
    <div className="space-y-6 font-sans">
      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={docFileInputRef}
        onChange={handleDocFileSelect}
        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
        className="hidden"
      />

      {/* Top 2-Column Grid: Left Avatar & Identity (4 cols) | Right Security Governance (8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN (~4 Cols): Unified Avatar & Profile Identity Card */}
        <div className="lg:col-span-4">
          <div className="industrial-card p-6 bg-white border border-[#CBD5E1] rounded-xl shadow-xs space-y-5 h-full flex flex-col justify-between">
            <div className="space-y-4">
              {/* Profile Image & Camera Overlay */}
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full bg-[#0D9488] text-white flex items-center justify-center text-2xl font-bold font-mono border-4 border-white shadow-md overflow-hidden">
                    {!imgError && profilePicUrl ? (
                      <img
                        src={getAvatarUrl(profilePicUrl)}
                        alt=""
                        onError={() => setImgError(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      `${(company.first_name || 'U')[0]}${(company.last_name || '')[0]}`
                    )}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 p-1.5 bg-[#0F172A] text-white rounded-full shadow hover:bg-[#0D9488] transition-colors cursor-pointer"
                    title="Upload Custom Avatar (< 2MB)"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleCustomPicUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                {/* Name, Role & Employee Badge */}
                <div>
                  <div className="flex items-center justify-center gap-2">
                    <h1 className="text-lg font-bold text-[#0F172A] font-mono">
                      {company.first_name} {company.last_name}
                    </h1>
                    <span className="px-2 py-0.5 bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4] rounded font-mono text-[10px] font-bold">
                      {company.employee_code || 'EMP-001'}
                    </span>
                  </div>
                  <p className="text-xs text-[#64748B] font-mono mt-0.5">
                    {company.designation || 'Staff'} • {company.department_name || company.department || 'General Operations'}
                  </p>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-full text-xs font-mono">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#0D9488]" />
                    <span className="text-[10px] text-[#64748B] uppercase">Clearance:</span>
                    <span className="font-bold text-[#0F172A]">{user?.role || 'Super Admin'}</span>
                  </div>
                </div>

                {/* Action Buttons: Upload New & Remove Photo */}
                <div className="flex items-center justify-center gap-2 pt-1 w-full font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="py-1.5 px-3.5 rounded bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] border border-[#CBD5E1] font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#0D9488]" /> UPLOAD NEW
                  </button>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="py-1.5 px-3.5 rounded bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] border border-[#FCA5A5] font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#DC2626]" /> REMOVE PHOTO
                  </button>
                </div>
              </div>

              {/* Quick Preset Avatars Subsection */}
              <div className="pt-3 border-t border-[#E2E8F0] space-y-2">
                <div className="text-[10px] font-mono font-bold text-[#64748B] uppercase tracking-wider flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#0D9488]" /> QUICK PRESET AVATARS
                </div>
                <div className="flex items-center justify-center gap-2.5">
                  {PRESET_AVATARS.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAvatarSelect(url)}
                      className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-all cursor-pointer ${
                        profilePicUrl === url ? 'border-[#0D9488] ring-2 ring-[#0D9488]/30 scale-105' : 'border-[#CBD5E1] opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={url} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (~8 Cols): Account Security & Authentication Governance Card */}
        <div className="lg:col-span-8">
          <div className="industrial-card p-6 bg-white border border-[#CBD5E1] rounded-xl shadow-xs space-y-5 h-full flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3 mb-4">
                <h2 className="text-sm font-bold font-mono text-[#0F172A] uppercase flex items-center gap-2">
                  <ShieldCheck className="w-4.5 h-4.5 text-[#0D9488]" /> ACCOUNT SECURITY & AUTHENTICATION GOVERNANCE
                </h2>
                <span className="px-2.5 py-0.5 text-[9px] font-mono bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0] rounded font-bold uppercase tracking-wider">
                  ENCRYPTED 🔒
                </span>
              </div>

              {/* TWO-FACTOR AUTHENTICATION (TOTP) SUBCARD */}
              <div className="p-4 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg space-y-3 font-mono mb-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-[#CCFBF1] text-[#0F766E] rounded-lg">
                      <QrCode className="w-5 h-5 text-[#0D9488]" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-[#0F172A] uppercase">TWO-FACTOR AUTHENTICATION (TOTP)</div>
                      <div className="text-[11px] text-[#64748B] font-sans">
                        Google Authenticator / Authy 2-step verification during portal login
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {twoFactorEnabled ? (
                      <>
                        <span className="px-2.5 py-1 bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] rounded font-bold text-[10px]">
                          2FA ACTIVE 🛡️
                        </span>
                        <button
                          onClick={() => setShowDisable2FAModal(true)}
                          className="py-1.5 px-3 rounded bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] border border-[#FCA5A5] font-bold text-[10px] transition-colors cursor-pointer uppercase"
                        >
                          DISABLE 2FA
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="px-2.5 py-1 bg-[#FEF3C7] border border-[#FDE68A] text-[#D97706] rounded font-bold text-[10px]">
                          2FA INACTIVE ⚠️
                        </span>
                        <button
                          onClick={handleStart2FASetup}
                          className="py-1.5 px-3 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold text-[10px] transition-colors cursor-pointer uppercase shadow-xs"
                        >
                          ENABLE 2FA AUTHENTICATOR
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* SYSTEM PASSWORD UPDATE FORM */}
              <form onSubmit={handleChangePassword} className="space-y-4 font-mono text-xs">
                <div className="text-xs font-bold text-[#0F172A] uppercase flex items-center gap-1.5 border-b border-[#F1F5F9] pb-2">
                  <Lock className="w-4 h-4 text-[#0D9488]" /> UPDATE SYSTEM PASSWORD
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Current Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full p-2.5 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">New Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="Min 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full p-2.5 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Confirm New Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="Repeat new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full p-2.5 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
                  <span className="text-[11px] text-[#64748B] font-sans">
                    First-time login? Change your default temporary password (<span className="font-mono font-bold text-[#0F172A]">Employee@123</span>) to a secure custom password.
                  </span>
                  <button
                    type="submit"
                    disabled={updatingPassword}
                    className="py-2.5 px-6 rounded bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold uppercase tracking-wider shadow shrink-0 cursor-pointer text-xs"
                  >
                    {updatingPassword ? 'UPDATING...' : 'UPDATE PASSWORD'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Main Bottom Grid: Personal Info Form & Governance / Vault Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans">
        {/* Left 2 Columns: Editable Personal & Contact Details */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleUpdateProfile} className="industrial-card p-6 bg-white border border-[#CBD5E1] rounded-xl space-y-5">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h2 className="text-sm font-bold font-mono text-[#0F172A] uppercase flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-[#0D9488]" /> PERSONAL DETAILS & CONTACT INFORMATION
              </h2>
              <span className="text-[10px] font-mono text-[#64748B]">
                {isSuperAdmin ? 'SUPER ADMIN EDITABLE ✏️' : 'SELF EDITABLE'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">First Name *</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full p-2.5 text-xs industrial-input font-sans bg-white border border-[#CBD5E1]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Last Name *</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full p-2.5 text-xs industrial-input font-sans bg-white border border-[#CBD5E1]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">
                  Work Email {isSuperAdmin ? '*' : '(Super Admin Editable * (Read Only))'}
                </label>
                {isSuperAdmin ? (
                  <input
                    type="email"
                    required
                    value={workEmail}
                    onChange={(e) => setWorkEmail(e.target.value)}
                    placeholder="name@maxenius.com"
                    className="w-full p-2.5 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
                  />
                ) : (
                  <input
                    type="email"
                    readOnly
                    value={workEmail}
                    className="w-full p-2.5 text-xs industrial-input font-mono bg-[#F8FAFC] border border-[#CBD5E1] text-[#64748B] cursor-not-allowed"
                  />
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">
                  CNIC {isSuperAdmin ? '*' : '(Super Admin Editable * (Read Only))'}
                </label>
                {isSuperAdmin ? (
                  <input
                    type="text"
                    required
                    value={cnic}
                    onChange={(e) => setCnic(formatCNIC(e.target.value))}
                    placeholder="XXXXX-XXXXXXX-X"
                    className="w-full p-2.5 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
                  />
                ) : (
                  <input
                    type="text"
                    readOnly
                    value={cnic}
                    className="w-full p-2.5 text-xs industrial-input font-mono bg-[#F8FAFC] border border-[#CBD5E1] text-[#64748B] cursor-not-allowed"
                  />
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+92 300 1234567"
                  className="w-full p-2.5 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Work Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Lahore HQ"
                  className="w-full p-2.5 text-xs industrial-input font-sans bg-white border border-[#CBD5E1]"
                />
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="pt-4 border-t border-[#E2E8F0] space-y-3 font-mono text-xs">
              <h3 className="text-xs font-bold text-[#0F172A] uppercase flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#0D9488]" /> EMERGENCY CONTACT DETAILS
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-[#64748B] uppercase mb-1">Contact Name</label>
                  <input
                    type="text"
                    value={emName}
                    onChange={(e) => setEmName(e.target.value)}
                    placeholder="Full Name"
                    className="w-full p-2 text-xs industrial-input font-sans bg-white border border-[#CBD5E1]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-[#64748B] uppercase mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={emPhone}
                    onChange={(e) => setEmPhone(e.target.value)}
                    placeholder="+92 300 0000000"
                    className="w-full p-2 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-[#64748B] uppercase mb-1">Relationship</label>
                  <input
                    type="text"
                    value={emRelation}
                    onChange={(e) => setEmRelation(e.target.value)}
                    placeholder="Spouse / Parent"
                    className="w-full p-2 text-xs industrial-input font-sans bg-white border border-[#CBD5E1]"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                type="submit"
                disabled={saving}
                className="py-2.5 px-6 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-sm uppercase tracking-wider cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {saving ? 'SAVING CHANGES...' : 'UPDATE PROFILE'}
              </button>
            </div>
          </form>

          {/* Documents Vault (Private Personal Files) */}
          <div className="industrial-card p-6 bg-white border border-[#CBD5E1] rounded-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <h2 className="text-sm font-bold font-mono text-[#0F172A] uppercase flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#0D9488]" /> MY PRIVATE VAULT
                </h2>
                <p className="text-[11px] text-[#64748B] font-sans mt-0.5">
                  Store personal CNIC/Passport copies, Resume/CV, Academic Degrees, and Professional Certifications.
                </p>
              </div>
              <span className="text-[10px] font-mono text-[#0F766E] bg-[#F0FDFA] border border-[#99F6E4] px-2 py-0.5 rounded font-bold">
                {documents.length} ATTACHMENT(S)
              </span>
            </div>

            {/* Document Upload Form */}
            <form onSubmit={handleDocUpload} className="p-4 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg space-y-3 font-mono text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Category</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full p-2 text-xs industrial-input bg-white border border-[#CBD5E1]"
                  >
                    <option value="cv">RESUME / CV</option>
                    <option value="contract">EMPLOYMENT CONTRACT</option>
                    <option value="id_proof">CNIC / PASSPORT COPY</option>
                    <option value="degree">ACADEMIC DEGREE</option>
                    <option value="certificate">CERTIFICATION</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Document Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Master Degree Verification Certificate"
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    className="w-full p-2 text-xs industrial-input bg-white border border-[#CBD5E1]"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1 border-t border-[#E2E8F0]">
                <div>
                  {selectedDocFile ? (
                    <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-[#F0FDFA] border border-[#99F6E4] text-[#0F766E] rounded text-xs font-mono font-bold">
                      <Paperclip className="w-3.5 h-3.5 text-[#0D9488]" />
                      <span className="truncate max-w-[200px]">{selectedDocFile.name}</span>
                      <span className="text-[10px] text-[#64748B]">({Math.round(selectedDocFile.size / 1024)} KB)</span>
                      <button
                        type="button"
                        onClick={handleClearSelectedDocFile}
                        className="text-[#64748B] hover:text-[#DC2626] transition-colors p-0.5"
                        title="Clear selected file"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-[#64748B] font-sans">
                      Select a file from your device (<span className="font-mono text-[10px]">PDF, PNG, JPG, DOC</span>, max 10MB).
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => docFileInputRef.current?.click()}
                    className="py-2 px-3 rounded bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#334155] font-bold text-xs flex items-center gap-1.5 border border-[#CBD5E1] transition-all uppercase cursor-pointer"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-[#0D9488]" />
                    {selectedDocFile ? 'CHANGE FILE' : 'BROWSE FILE'}
                  </button>

                  <button
                    type="submit"
                    disabled={uploadingDoc}
                    className={`py-2 px-5 rounded font-bold text-xs text-white transition-all flex items-center gap-1.5 uppercase cursor-pointer shadow-xs ${
                      selectedDocFile ? 'bg-[#0D9488] hover:bg-[#0F766E]' : 'bg-[#0F172A] hover:bg-[#1E293B]'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingDoc ? 'UPLOADING...' : selectedDocFile ? 'CONFIRM UPLOAD' : 'UPLOAD'}
                  </button>
                </div>
              </div>
            </form>

            {/* Private Documents List */}
            <div className="space-y-2">
              {documents.length > 0 ? (
                documents.map((doc: any) => {
                  let docTitle = doc.title || doc.document_title || doc.document_name || doc.name || doc.original_filename || 'Untitled Document';
                  if (typeof docTitle === 'string' && docTitle.startsWith('{')) {
                    try {
                      const parsed = JSON.parse(docTitle);
                      docTitle = parsed.title || parsed.document_title || parsed.document_name || parsed.name || parsed.original_filename || 'Untitled Document';
                    } catch (e) {}
                  }

                  const docCategory = (doc.category || doc.document_type || doc.doc_type || 'GENERAL').toUpperCase();
                  let rawUrl = doc.file_url || '';
                  if (!rawUrl && doc.storage_key) {
                    if (doc.storage_key.startsWith('/') || doc.storage_key.startsWith('http')) {
                      rawUrl = doc.storage_key;
                    } else if (doc.storage_key.startsWith('{')) {
                      try {
                        const parsed = JSON.parse(doc.storage_key);
                        rawUrl = parsed.file_url || '';
                      } catch (e) {}
                    }
                  }
                  const docUrl = getAvatarUrl(rawUrl);

                  return (
                    <div
                      key={doc.id}
                      className="p-3 bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] rounded flex items-center justify-between text-xs font-mono transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileCheck className="w-4 h-4 text-[#0D9488] shrink-0" />
                        <div>
                          <h4 className="font-bold text-[#0F172A] text-sm">{doc.title || doc.document_title || doc.document_name || doc.name || doc.file_name || docTitle || 'Document'}</h4>
                          <div className="text-[10px] text-[#64748B] flex items-center gap-2 mt-0.5">
                            <span className="px-1.5 py-0.2 bg-[#F1F5F9] border border-[#CBD5E1] rounded font-bold text-[9px] text-[#0F766E]">
                              {docCategory}
                            </span>
                            {doc.uploaded_at && (
                              <span>Uploaded: {doc.uploaded_at}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 bg-[#F0FDFA] border border-[#99F6E4] hover:bg-[#CCFBF1] text-[#0F766E] rounded text-[11px] font-bold flex items-center gap-1 transition-colors"
                        >
                          VIEW 🔗
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDocDelete(doc.id)}
                          className="p-1 text-[#94A3B8] hover:text-[#DC2626] transition-colors"
                          title="Delete document"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6 border border-dashed border-[#CBD5E1] rounded text-[#64748B] font-mono text-xs">
                  No personal documents stored in your private vault yet.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Company Governance & Compensation (Super Admin / HR Manager Editable) */}
        <div className="space-y-6">
          {isCanEditGovernance ? (
            <form onSubmit={handleUpdateGovernance} className="industrial-card p-6 bg-white border border-[#CBD5E1] rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                <h3 className="text-sm font-bold font-mono text-[#0F172A] uppercase flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-[#0D9488]" /> COMPANY GOVERNANCE (ADMIN)
                </h3>
                <span className="px-2 py-0.5 text-[9px] font-mono bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4] rounded font-bold">
                  EDITABLE ✏️
                </span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Designation</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full p-2 text-xs industrial-input font-sans bg-white border border-[#CBD5E1]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Department Selector</label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(Number(e.target.value))}
                    className="w-full p-2 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
                  >
                    {departmentsList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#0F766E] uppercase mb-1">Basic Salary (PKR)</label>
                  <input
                    type="number"
                    value={basicSalary}
                    onChange={(e) => setBasicSalary(e.target.value)}
                    className="w-full p-2 text-xs industrial-input font-mono font-bold text-[#0F766E] bg-white border border-[#CBD5E1]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Employment Type</label>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value)}
                    className="w-full p-2 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
                  >
                    <option value="full_time">FULL_TIME</option>
                    <option value="part_time">PART_TIME</option>
                    <option value="contract">CONTRACT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Joining Date</label>
                  <div className="p-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded text-[#0F172A]">
                    {company.joining_date || '2024-01-10'}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Account Status</label>
                  <select
                    value={accountStatus}
                    onChange={(e) => setAccountStatus(e.target.value)}
                    className="w-full p-2 text-xs industrial-input font-mono bg-white border border-[#CBD5E1]"
                  >
                    <option value="active">ACTIVE</option>
                    <option value="resigned">RESIGNED</option>
                    <option value="terminated">TERMINATED</option>
                  </select>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingGov}
                    className="w-full py-2.5 px-4 rounded bg-[#0F172A] hover:bg-[#1E293B] text-white font-mono font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-4 h-4 text-[#14B8A6]" />
                    {savingGov ? 'SAVING GOVERNANCE...' : 'SAVE GOVERNANCE'}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="industrial-card p-6 bg-white border border-[#CBD5E1] rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
                <h3 className="text-sm font-bold font-mono text-[#0F172A] uppercase flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#D97706]" /> COMPANY GOVERNANCE (READ ONLY)
                </h3>
                <span className="px-2 py-0.5 text-[9px] font-mono bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A] rounded font-bold">
                  LOCKED 🔒
                </span>
              </div>

              <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-md text-[11px] font-mono text-[#92400E] flex items-start gap-2">
                <Lock className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
                <span>Compensation and organizational placement are restricted to HR Managers & System Administrators.</span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                  <span className="text-[10px] text-[#64748B] uppercase block">Designation</span>
                  <span className="font-bold text-[#0F172A]">{company.designation || 'Staff'}</span>
                </div>

                <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                  <span className="text-[10px] text-[#64748B] uppercase block">Department</span>
                  <span className="font-bold text-[#0F172A]">{company.department_name || company.department || 'General Operations'}</span>
                </div>

                <div className="p-3 bg-[#F0FDFA] border border-[#99F6E4] rounded">
                  <span className="text-[10px] text-[#0F766E] uppercase block font-bold">Basic Salary</span>
                  <span className="font-extrabold text-[#0F766E] text-base">
                    PKR {floatVal(company.basic_salary).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-[#134E4A] block mt-1">
                    5% Escrow Holdback: PKR {floatVal(company.security_holdback).toLocaleString()}
                  </span>
                </div>

                <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                  <span className="text-[10px] text-[#64748B] uppercase block">Employment Type</span>
                  <span className="font-bold text-[#0F172A] uppercase">{company.employment_type || 'full_time'}</span>
                </div>

                <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                  <span className="text-[10px] text-[#64748B] uppercase block">Joining Date</span>
                  <span className="font-bold text-[#0F172A]">{company.joining_date || '2024-01-10'}</span>
                </div>

                <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded">
                  <span className="text-[10px] text-[#64748B] uppercase block">Account Status</span>
                  <span className="font-bold text-[#047857] uppercase bg-[#ECFDF5] px-2 py-0.5 rounded border border-[#A7F3D0] inline-block mt-0.5">
                    {company.status || 'ACTIVE'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SETUP 2FA MODAL */}
      {showSetup2FAModal && (
        <div className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="industrial-card-raised w-full max-w-lg p-6 relative border border-[#CBD5E1] bg-white text-[#0F172A] rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150 font-sans">
            <button
              onClick={() => setShowSetup2FAModal(false)}
              className="absolute top-4 right-4 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {setup2FAStep === 'QR' ? (
              <div className="space-y-4 font-mono text-xs">
                <h2 className="text-sm font-bold text-[#0F172A] uppercase border-b border-[#E2E8F0] pb-3 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-[#0D9488]" /> SETUP TWO-FACTOR AUTHENTICATION (TOTP)
                </h2>

                <div className="p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded text-center space-y-2">
                  <p className="text-[11px] text-[#334155] font-sans">
                    1. Open Google Authenticator or Authy on your mobile phone.<br />
                    2. Tap <strong>+ Add Account</strong> and scan the QR code below:
                  </p>

                  <div className="w-44 h-44 mx-auto bg-white p-2 border border-[#CBD5E1] rounded shadow-xs flex items-center justify-center">
                    {qrCodeBase64 && <img src={qrCodeBase64} alt="2FA QR Code" className="w-full h-full object-contain" />}
                  </div>

                  <div className="text-[10px] text-[#64748B] pt-1">
                    Or enter manual secret key: <span className="font-extrabold text-[#0D9488] tracking-widest">{setupSecret}</span>
                  </div>
                </div>

                <form onSubmit={handleEnable2FAConfirm} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#334155] uppercase mb-1">
                      3. ENTER 6-DIGIT VERIFICATION CODE FROM AUTHENTICATOR APP *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={totpVerifyCode}
                      onChange={(e) => setTotpVerifyCode(e.target.value)}
                      placeholder="e.g. 123456"
                      className="w-full p-2.5 rounded industrial-input font-bold text-center text-base tracking-widest"
                    />
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowSetup2FAModal(false)}
                      className="w-1/2 py-2.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] uppercase font-bold cursor-pointer"
                    >
                      CANCEL
                    </button>
                    <button
                      type="submit"
                      disabled={enabling2FA}
                      className="w-1/2 py-2.5 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold shadow uppercase cursor-pointer"
                    >
                      {enabling2FA ? 'VERIFYING...' : 'ENABLE 2FA NOW'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="space-y-4 font-mono text-xs">
                <div className="p-3 bg-[#ECFDF5] border border-[#A7F3D0] rounded text-center space-y-1">
                  <ShieldCheck className="w-8 h-8 text-[#047857] mx-auto" />
                  <h2 className="text-sm font-bold text-[#047857] uppercase">2FA AUTHENTICATION ACTIVATED!</h2>
                  <p className="text-[11px] text-[#065F46] font-sans">
                    Save your 8 backup recovery codes. If you lose access to your phone, these codes allow emergency account recovery.
                  </p>
                </div>

                <div className="p-4 bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg">
                  <div className="text-[10px] text-[#64748B] uppercase font-bold mb-2 text-center">EMERGENCY BACKUP RECOVERY CODES</div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    {backupCodesList.map((code, idx) => (
                      <div key={idx} className="p-2 bg-white border border-[#CBD5E1] rounded font-extrabold text-xs tracking-wider text-[#0F172A]">
                        {code}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 font-mono">
                  <button
                    onClick={handleCopyBackupCodes}
                    className="w-1/2 py-2.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-[#0D9488]" /> COPY CODES
                  </button>
                  <button
                    onClick={handleDownloadBackupCodes}
                    className="w-1/2 py-2.5 rounded bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold uppercase flex items-center justify-center gap-1.5 cursor-pointer shadow"
                  >
                    <Download className="w-3.5 h-3.5 text-[#14B8A6]" /> DOWNLOAD CODES
                  </button>
                </div>

                <button
                  onClick={() => setShowSetup2FAModal(false)}
                  className="w-full py-2.5 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold uppercase cursor-pointer shadow-xs"
                >
                  FINISH 2FA SETUP ✓
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DISABLE 2FA MODAL */}
      {showDisable2FAModal && (
        <div className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="industrial-card-raised w-full max-w-md p-6 relative border border-[#CBD5E1] bg-white text-[#0F172A] rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150 font-sans">
            <button
              onClick={() => setShowDisable2FAModal(false)}
              className="absolute top-4 right-4 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-sm font-mono font-bold text-[#DC2626] mb-4 uppercase tracking-wider border-b border-[#E2E8F0] pb-3 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#DC2626]" /> DISABLE TWO-FACTOR AUTHENTICATION
            </h2>

            <form onSubmit={handleDisable2FASubmit} className="space-y-4 font-mono text-xs">
              <div className="p-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded text-[11px] text-[#991B1B] font-sans">
                Disabling 2FA reduces your account security. You will be required to verify your password and 2FA code to confirm.
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#334155] uppercase mb-1">CURRENT SYSTEM PASSWORD *</label>
                <input
                  type="password"
                  required
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full p-2.5 rounded industrial-input"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#334155] uppercase mb-1">6-DIGIT TOTP OR RECOVERY CODE (OPTIONAL)</label>
                <input
                  type="text"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full p-2.5 rounded industrial-input font-bold tracking-widest uppercase"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDisable2FAModal(false)}
                  className="w-1/2 py-2.5 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] uppercase font-bold cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={disabling2FA}
                  className="w-1/2 py-2.5 rounded bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold shadow uppercase cursor-pointer"
                >
                  {disabling2FA ? 'DISABLING...' : 'CONFIRM DISABLE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

function floatVal(v: any): number {
  return typeof v === 'number' ? v : parseFloat(v || '0');
}
