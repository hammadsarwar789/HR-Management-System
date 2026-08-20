import React, { useState, useEffect, useRef } from 'react';
import {
  FolderOpen,
  FileText,
  Upload,
  Paperclip,
  Share2,
  Inbox,
  Send,
  Search,
  Filter,
  Eye,
  Clock,
  Check,
  Trash2,
  Download,
  X,
  FileCheck,
  ShieldAlert,
  Building,
  User,
  ArrowUpDown,
  Sparkles,
  Info
} from 'lucide-react';
import { api, getAvatarUrl } from '../lib/api';
import { useAuthStore } from '../store/authStore';

export const DocumentsPage: React.FC = () => {
  const { user } = useAuthStore();

  // Tab State: 'shared_with_me' | 'sent_by_me' | 'policies'
  const [activeTab, setActiveTab] = useState<'shared_with_me' | 'sent_by_me' | 'policies'>('shared_with_me');

  // Documents & Employee Data
  const [sharedWithMeDocs, setSharedWithMeDocs] = useState<any[]>([]);
  const [sentByMeDocs, setSentByMeDocs] = useState<any[]>([]);
  const [companyPoliciesDocs, setCompanyPoliciesDocs] = useState<any[]>([]);
  const [allEmployeesList, setAllEmployeesList] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'NEWEST' | 'OLDEST' | 'TITLE'>('NEWEST');

  // Share Modal State
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [shareTitle, setShareTitle] = useState<string>('');
  const [shareCategory, setShareCategory] = useState<string>('handover');
  const [shareTargetType, setShareTargetType] = useState<'employee' | 'line_manager' | 'hr' | 'broadcast'>('employee');
  const [shareRecipientId, setShareRecipientId] = useState<string>('');
  const [sharePermission, setSharePermission] = useState<string>('VIEW');
  const [shareNote, setShareNote] = useState<string>('');
  const [sharingLoading, setSharingLoading] = useState<boolean>(false);

  const shareFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocumentsData();
    fetchEmployeesList();
  }, []);

  const fetchDocumentsData = async () => {
    setLoading(true);
    try {
      const [sharedRes, sentRes] = await Promise.allSettled([
        api.get('/documents/shared-with-me'),
        api.get('/documents/sent-by-me')
      ]);

      let sharedList: any[] = [];
      let sentList: any[] = [];

      if (sharedRes.status === 'fulfilled' && sharedRes.value.data?.shared_documents) {
        sharedList = sharedRes.value.data.shared_documents;
      }
      if (sentRes.status === 'fulfilled' && sentRes.value.data?.sent_documents) {
        sentList = sentRes.value.data.sent_documents;
      }

      setSharedWithMeDocs(sharedList);
      setSentByMeDocs(sentList);

      // Separate Company Policies / Broadcasts from shared inbox
      const policies = sharedList.filter(
        (doc: any) =>
          (doc.category || '').toUpperCase() === 'POLICY' ||
          (doc.recipient_name || '').toLowerCase().includes('all') ||
          doc.target_role === 'ALL'
      );
      setCompanyPoliciesDocs(policies);

    } catch (e) {
      console.error('Failed to fetch shared documents:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeesList = async () => {
    try {
      const res = await api.get('/employees');
      const list = res.data.employees || res.data || [];
      if (Array.isArray(list)) {
        setAllEmployeesList(list);
      }
    } catch (e) {
      console.warn('Failed to fetch employees list for sharing modal:', e);
    }
  };

  // Handle Share File Selection
  const handleShareFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setShareFile(file);
      if (!shareTitle) {
        const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        setShareTitle(nameWithoutExt);
      }
    }
  };

  // Submit Share Form
  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareFile) {
      alert('Please select a file to share.');
      return;
    }
    if (!shareTitle.trim()) {
      alert('Please enter a document title.');
      return;
    }
    if (shareTargetType === 'employee' && !shareRecipientId) {
      alert('Please select a recipient employee.');
      return;
    }

    setSharingLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', shareFile);
      formData.append('document', shareFile);
      formData.append('title', shareTitle.trim());
      formData.append('category', shareCategory);
      formData.append('permission', sharePermission);

      if (shareNote.trim()) {
        formData.append('note', shareNote.trim());
      }

      if (shareTargetType === 'employee') {
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

      alert('✓ File shared successfully with team members!');
      setIsShareModalOpen(false);
      setShareFile(null);
      setShareTitle('');
      setShareNote('');
      setShareRecipientId('');
      fetchDocumentsData();
      setActiveTab('sent_by_me');
    } catch (err: any) {
      console.error('Share error:', err);
      alert(err.response?.data?.error?.message || 'Failed to share document.');
    } finally {
      setSharingLoading(false);
    }
  };

  const handleMarkViewed = async (shareId?: string, documentId?: string) => {
    if (shareId) {
      try {
        await api.patch(`/documents/shares/${shareId}/view`);
      } catch (e) {
        console.warn('Failed to mark share viewed:', e);
      }
    }
    setSharedWithMeDocs((prev) =>
      prev.map((doc) => {
        if ((shareId && doc.share_id === shareId) || (documentId && doc.document_id === documentId)) {
          return {
            ...doc,
            viewed_at: doc.viewed_at || new Date().toISOString().replace('T', ' ').substring(0, 16),
            status: 'ACKNOWLEDGED'
          };
        }
        return doc;
      })
    );
  };

  // Revoke Share
  const handleRevokeShare = async (shareId: string) => {
    if (!window.confirm('Are you sure you want to revoke access to this shared document?')) return;
    try {
      await api.delete(`/documents/shares/${shareId}`);
      alert('✓ Share access revoked successfully.');
      fetchDocumentsData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to revoke share access.');
    }
  };

  // Filter & Sort Logic
  const getFilteredList = (list: any[]) => {
    return list
      .filter((item: any) => {
        const titleMatch = (item.title || item.document_title || '').toLowerCase().includes(searchQuery.toLowerCase());
        const uploaderMatch = (item.uploader_name || '').toLowerCase().includes(searchQuery.toLowerCase());
        const recipientMatch = (item.recipient_name || '').toLowerCase().includes(searchQuery.toLowerCase());
        const noteMatch = (item.note || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSearch = titleMatch || uploaderMatch || recipientMatch || noteMatch;

        const category = (item.category || '').toUpperCase();
        const matchesCategory = categoryFilter === 'ALL' || category === categoryFilter || (categoryFilter === 'HANDOVER' && category === 'HANDOVER');

        return matchesSearch && matchesCategory;
      })
      .sort((a: any, b: any) => {
        if (sortBy === 'NEWEST') {
          return new Date(b.shared_at || 0).getTime() - new Date(a.shared_at || 0).getTime();
        } else if (sortBy === 'OLDEST') {
          return new Date(a.shared_at || 0).getTime() - new Date(b.shared_at || 0).getTime();
        } else {
          return (a.title || '').localeCompare(b.title || '');
        }
      });
  };

  const currentList =
    activeTab === 'shared_with_me'
      ? getFilteredList(sharedWithMeDocs)
      : activeTab === 'sent_by_me'
      ? getFilteredList(sentByMeDocs)
      : getFilteredList(companyPoliciesDocs);

  const unreadInboxCount = sharedWithMeDocs.filter((d) => !d.viewed_at).length;
  const acknowledgedOutboxCount = sentByMeDocs.filter((d) => d.viewed_at).length;

  return (
    <div className="space-y-6 font-sans pb-12">
      {/* Top Banner & Action Header */}
      <div className="industrial-card p-6 bg-white border border-[#CBD5E1] rounded-xl shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[#0D9488]">
            <FolderOpen className="w-6 h-6" />
            <h1 className="text-xl font-bold font-mono text-[#0F172A] tracking-tight uppercase">
              TEAM DOCUMENT HUB & SHARING
            </h1>
          </div>
          <p className="text-xs text-[#64748B] font-sans">
            Centralized document distribution workspace for cross-user handover notes, medical proofs, expense receipts, and company broadcasts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsShareModalOpen(true)}
          className="py-2.5 px-4 bg-[#0D9488] hover:bg-[#0F766E] text-white font-mono font-bold text-xs rounded-lg flex items-center gap-2 shadow-sm transition-all cursor-pointer shrink-0 uppercase tracking-wider"
        >
          <Share2 className="w-4 h-4" />
          SHARE FILE WITH TEAM
        </button>
      </div>

      {/* Analytics KPI Stat Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
        <div className="p-4 bg-white border border-[#CBD5E1] rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-[#64748B] uppercase block">Shared With Me</span>
            <span className="text-xl font-extrabold text-[#0F172A]">{sharedWithMeDocs.length}</span>
            <span className="text-[10px] text-[#0D9488] block mt-0.5 font-sans">
              {unreadInboxCount} unread document(s)
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#F0FDFA] border border-[#99F6E4] flex items-center justify-center text-[#0D9488]">
            <Inbox className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white border border-[#CBD5E1] rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-[#64748B] uppercase block">Sent By Me</span>
            <span className="text-xl font-extrabold text-[#0F172A]">{sentByMeDocs.length}</span>
            <span className="text-[10px] text-[#047857] block mt-0.5 font-sans">
              {acknowledgedOutboxCount} acknowledged receipt(s)
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#F1F5F9] border border-[#CBD5E1] flex items-center justify-center text-[#334155]">
            <Send className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white border border-[#CBD5E1] rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-[#64748B] uppercase block">Company Broadcasts</span>
            <span className="text-xl font-extrabold text-[#0F172A]">{companyPoliciesDocs.length}</span>
            <span className="text-[10px] text-[#0284C7] block mt-0.5 font-sans">Policy announcements</span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#E0F2FE] border border-[#BAE6FD] flex items-center justify-center text-[#0369A1]">
            <Building className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 bg-white border border-[#CBD5E1] rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-[#64748B] uppercase block">Vault Security</span>
            <span className="text-xs font-bold text-[#047857] bg-[#ECFDF5] px-2 py-0.5 rounded border border-[#A7F3D0] inline-block mt-1">
              SYSTEM VERIFIED 🔒
            </span>
          </div>
          <div className="w-10 h-10 rounded-lg bg-[#F0FDFA] border border-[#99F6E4] flex items-center justify-center text-[#0F766E]">
            <FileCheck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Workspace Card */}
      <div className="industrial-card p-6 bg-white border border-[#CBD5E1] rounded-xl space-y-5">
        {/* Primary Filter Tabs */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-3 font-mono text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('shared_with_me')}
              className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'shared_with_me'
                  ? 'bg-[#0F172A] text-white shadow-sm'
                  : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'
              }`}
            >
              <Inbox className="w-4 h-4 text-[#0D9488]" />
              SHARED WITH ME ({sharedWithMeDocs.length})
              {unreadInboxCount > 0 && (
                <span className="px-1.5 py-0.2 bg-[#D97706] text-white text-[9px] rounded-full animate-pulse">
                  {unreadInboxCount} NEW
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sent_by_me')}
              className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'sent_by_me'
                  ? 'bg-[#0F172A] text-white shadow-sm'
                  : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'
              }`}
            >
              <Send className="w-4 h-4 text-[#0D9488]" />
              SENT BY ME ({sentByMeDocs.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('policies')}
              className={`px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'policies'
                  ? 'bg-[#0F172A] text-white shadow-sm'
                  : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]'
              }`}
            >
              <Building className="w-4 h-4 text-[#0D9488]" />
              COMPANY POLICIES ({companyPoliciesDocs.length})
            </button>
          </div>

          <span className="text-[11px] text-[#64748B] font-sans">
            Showing <strong className="text-[#0F172A] font-mono">{currentList.length}</strong> attachment record(s)
          </span>
        </div>

        {/* Search & Filter Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 font-mono text-xs">
          <div className="md:col-span-6 relative">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents by title, uploader name, recipient, or note..."
              className="w-full pl-9 pr-3 py-2 text-xs industrial-input bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full py-2 px-3 text-xs industrial-input bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
            >
              <option value="ALL">ALL CATEGORIES</option>
              <option value="HANDOVER">PROJECT HANDOVER</option>
              <option value="MEDICAL">MEDICAL PROOF</option>
              <option value="EXPENSE_RECEIPT">EXPENSE RECEIPT</option>
              <option value="CONTRACT">CONTRACT / INCREMENT</option>
              <option value="POLICY">COMPANY POLICY</option>
              <option value="GENERAL">GENERAL ATTACHMENT</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="w-full py-2 px-3 text-xs industrial-input bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
            >
              <option value="NEWEST">SORT: NEWEST FIRST</option>
              <option value="OLDEST">SORT: OLDEST FIRST</option>
              <option value="TITLE">SORT: BY DOCUMENT TITLE</option>
            </select>
          </div>
        </div>

        {/* Documents Feed List */}
        {loading ? (
          <div className="py-12 text-center text-xs font-mono text-[#64748B]">
            LOADING DOCUMENT HUB RECORDS...
          </div>
        ) : currentList.length > 0 ? (
          <div className="space-y-3 font-mono text-xs">
            {currentList.map((item: any) => {
              const categoryBadge = (item.category || 'GENERAL').toUpperCase();
              const isInbox = activeTab === 'shared_with_me' || activeTab === 'policies';

              return (
                <div
                  key={item.share_id || item.id}
                  className="p-4 bg-[#F8FAFC] border border-[#CBD5E1] hover:border-[#0D9488] rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all shadow-2xs"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <FileText className="w-4 h-4 text-[#0D9488] shrink-0" />
                      <h3 className="font-bold text-[#0F172A] text-sm truncate">{item.title}</h3>
                      <span className="px-2.5 py-0.5 bg-[#E0F2FE] border border-[#BAE6FD] text-[#0369A1] rounded-full text-[10px] font-bold">
                        {categoryBadge}
                      </span>
                      {item.permission && (
                        <span className="px-2 py-0.5 bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] rounded text-[9px] font-bold">
                          {item.permission}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-[#475569] flex items-center gap-4 flex-wrap">
                      {isInbox ? (
                        <span>Sender: <strong className="text-[#0F172A]">{item.uploader_name}</strong></span>
                      ) : (
                        <span>Recipient: <strong className="text-[#0F172A]">{item.recipient_name}</strong></span>
                      )}

                      <span>Shared: {item.shared_at}</span>

                      {item.viewed_at ? (
                        <span className="text-[#0D9488] font-bold flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" /> ACKNOWLEDGED ({item.viewed_at})
                        </span>
                      ) : (
                        <span className="text-[#D97706] font-bold flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> UNREAD / PENDING RECEIPT
                        </span>
                      )}
                    </div>

                    {item.note && (
                      <p className="text-[11px] font-sans text-[#475569] italic bg-white p-2 border border-[#E2E8F0] rounded-lg mt-1">
                        "{item.note}"
                      </p>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <a
                      href={getAvatarUrl(`/api/v1/documents/${item.document_id}/download?token=${localStorage.getItem('access_token') || ''}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleMarkViewed(item.share_id, item.document_id)}
                      className="px-3.5 py-2 bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      VIEW & DOWNLOAD
                    </a>

                    {!isInbox && (
                      <button
                        type="button"
                        onClick={() => handleRevokeShare(item.share_id)}
                        className="px-3 py-2 bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] text-[#DC2626] font-bold text-xs rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                        title="Revoke Share Access"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        REVOKE
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed border-[#CBD5E1] rounded-xl text-[#64748B] font-mono text-xs space-y-2">
            <FolderOpen className="w-8 h-8 text-[#94A3B8] mx-auto" />
            <p>No documents found matching the current search or tab selection.</p>
          </div>
        )}
      </div>

      {/* CROSS-USER SHARE DOCUMENT MODAL */}
      {isShareModalOpen && (
        <div className="fixed inset-0 bg-[#0F172A]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="industrial-card-raised w-full max-w-lg p-6 relative border border-[#CBD5E1] bg-white text-[#0F172A] rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150 font-sans">
            <button
              onClick={() => setIsShareModalOpen(false)}
              className="absolute top-4 right-4 text-[#64748B] hover:text-[#0F172A] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 text-[#0D9488] mb-1 font-mono">
              <Share2 className="w-5 h-5" />
              <h3 className="text-base font-bold uppercase text-[#0F172A]">Share Document With Team</h3>
            </div>
            <p className="text-xs text-[#64748B] mb-4 font-sans">
              Dispatch handover files, medical attachments, or policy documents to individual employees or entire departments.
            </p>

            <form onSubmit={handleShareSubmit} className="space-y-4 text-xs font-mono">
              {/* Hidden File Input */}
              <input
                type="file"
                ref={shareFileInputRef}
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                onChange={handleShareFileSelect}
              />

              {/* Attachment File Picker */}
              <div>
                <label className="block text-[10px] font-bold text-[#334155] uppercase mb-1">Attachment File *</label>
                {shareFile ? (
                  <div className="flex items-center justify-between p-2.5 bg-[#F0FDFA] border border-[#99F6E4] rounded-lg text-[#0F766E] font-bold">
                    <div className="flex items-center gap-2 truncate">
                      <Paperclip className="w-4 h-4 text-[#0D9488] shrink-0" />
                      <span className="truncate">{shareFile.name}</span>
                      <span className="text-[10px] text-[#64748B]">({Math.round(shareFile.size / 1024)} KB)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShareFile(null)}
                      className="text-[#64748B] hover:text-[#DC2626] p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => shareFileInputRef.current?.click()}
                    className="w-full p-3 border-2 border-dashed border-[#CBD5E1] hover:border-[#0D9488] rounded-lg bg-[#F8FAFC] text-[#64748B] font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Upload className="w-4 h-4 text-[#0D9488]" />
                    BROWSE DEVICE FILE TO SHARE
                  </button>
                )}
              </div>

              {/* Document Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-[#334155] uppercase mb-1">Document Title *</label>
                  <input
                    type="text"
                    required
                    value={shareTitle}
                    onChange={(e) => setShareTitle(e.target.value)}
                    placeholder="e.g. Handover Notes Q3"
                    className="w-full p-2.5 rounded-lg industrial-input bg-white border border-[#CBD5E1]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#334155] uppercase mb-1">Category</label>
                  <select
                    value={shareCategory}
                    onChange={(e) => setShareCategory(e.target.value)}
                    className="w-full p-2.5 rounded-lg industrial-input bg-white border border-[#CBD5E1]"
                  >
                    <option value="handover">PROJECT HANDOVER</option>
                    <option value="medical">MEDICAL PROOF</option>
                    <option value="expense_receipt">EXPENSE RECEIPT</option>
                    <option value="contract">CONTRACT / INCREMENT</option>
                    <option value="policy">COMPANY POLICY</option>
                    <option value="general">GENERAL ATTACHMENT</option>
                  </select>
                </div>
              </div>

              {/* Recipient Targeting */}
              <div>
                <label className="block text-[10px] font-bold text-[#334155] uppercase mb-1">Recipient Target *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setShareTargetType('employee')}
                    className={`p-2 rounded-lg text-[11px] font-bold text-center border cursor-pointer transition-colors ${
                      shareTargetType === 'employee'
                        ? 'bg-[#0D9488] text-white border-[#0D9488]'
                        : 'bg-[#F1F5F9] text-[#334155] border-[#CBD5E1]'
                    }`}
                  >
                    Colleague
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareTargetType('line_manager')}
                    className={`p-2 rounded-lg text-[11px] font-bold text-center border cursor-pointer transition-colors ${
                      shareTargetType === 'line_manager'
                        ? 'bg-[#0D9488] text-white border-[#0D9488]'
                        : 'bg-[#F1F5F9] text-[#334155] border-[#CBD5E1]'
                    }`}
                  >
                    Line Manager
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareTargetType('hr')}
                    className={`p-2 rounded-lg text-[11px] font-bold text-center border cursor-pointer transition-colors ${
                      shareTargetType === 'hr'
                        ? 'bg-[#0D9488] text-white border-[#0D9488]'
                        : 'bg-[#F1F5F9] text-[#334155] border-[#CBD5E1]'
                    }`}
                  >
                    HR Dept
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareTargetType('broadcast')}
                    className={`p-2 rounded-lg text-[11px] font-bold text-center border cursor-pointer transition-colors ${
                      shareTargetType === 'broadcast'
                        ? 'bg-[#0D9488] text-white border-[#0D9488]'
                        : 'bg-[#F1F5F9] text-[#334155] border-[#CBD5E1]'
                    }`}
                  >
                    Broadcast All
                  </button>
                </div>

                {shareTargetType === 'employee' && (
                  <select
                    value={shareRecipientId}
                    onChange={(e) => setShareRecipientId(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-lg industrial-input bg-white border border-[#CBD5E1]"
                  >
                    <option value="">-- SELECT RECIPIENT EMPLOYEE --</option>
                    {allEmployeesList.map((emp: any) => (
                      <option key={emp.id} value={emp.user_id || emp.id}>
                        {emp.first_name} {emp.last_name} ({emp.employee_code || emp.designation})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Message Note */}
              <div>
                <label className="block text-[10px] font-bold text-[#334155] uppercase mb-1">Optional Message Note</label>
                <textarea
                  rows={2}
                  value={shareNote}
                  onChange={(e) => setShareNote(e.target.value)}
                  placeholder="Add an optional message note for the recipient..."
                  className="w-full p-2.5 rounded-lg industrial-input bg-white border border-[#CBD5E1]"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsShareModalOpen(false)}
                  className="w-1/2 py-2.5 rounded-lg bg-[#F1F5F9] border border-[#CBD5E1] text-[#334155] font-bold uppercase cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={sharingLoading}
                  className="w-1/2 py-2.5 rounded-lg bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold shadow uppercase cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {sharingLoading ? 'SHARING...' : 'CONFIRM & SHARE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
