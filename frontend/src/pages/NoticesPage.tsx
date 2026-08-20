import React, { useState, useEffect, useRef } from 'react';
import { Bell, Calendar, Plus, X, Pin, AlertCircle, FileText, Download, Edit2, Trash2, Paperclip, CheckCircle2, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useOnClickOutside, useEscapeKey } from '../hooks/useOnClickOutside';

// Date formatter (e.g., "23 Mar 2026")
const formatDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
};

// Component 1: <PostAnnouncementModal />
interface PostAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PostAnnouncementModal: React.FC<PostAnnouncementModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);
  useEscapeKey(onClose);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetDept, setTargetDept] = useState('All');
  const [priority, setPriority] = useState<'URGENT' | 'GENERAL' | 'EVENT'>('GENERAL');
  const [pinned, setPinned] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/holidays/announcements', {
        title,
        body: content,
        content,
        target_dept: targetDept,
        priority,
        pinned,
        expiry_date: expiryDate || null,
        attachment_name: fileName || null
      });

      alert('Announcement posted successfully!');
      setTitle('');
      setContent('');
      setFileName('');
      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to post announcement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="bg-white border border-[#CBD5E1] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans"
      >
        <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between font-mono">
          <h3 className="text-xs font-bold text-[#0F172A] uppercase flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#0D9488]" /> POST SYSTEM ANNOUNCEMENT
          </h3>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-mono text-xs">
          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Announcement Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Q1 Townhall & Annual Policy Update"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] font-sans text-xs"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Announcement Body / Content *</label>
            <textarea
              rows={4}
              required
              placeholder="Write official notice details, policy instructions, or event schedule..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] font-sans text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Target Audience</label>
              <select
                value={targetDept}
                onChange={(e) => setTargetDept(e.target.value)}
                className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] text-xs"
              >
                <option value="All">All Departments</option>
                <option value="Software Engineering">Software Engineering</option>
                <option value="Human Resources">Human Resources</option>
                <option value="Finance & Accounts">Finance & Accounts</option>
                <option value="Sales & Marketing">Sales & Marketing</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Expiry Date (Optional)</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] text-xs"
              />
            </div>
          </div>

          {/* Priority Badge Picker */}
          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1.5">Priority Tag</label>
            <div className="flex items-center gap-3">
              {[
                { key: 'GENERAL', label: '[GENERAL]', class: 'bg-[#CCFBF1] text-[#0F766E] border-[#99F6E4]' },
                { key: 'URGENT', label: '[URGENT]', class: 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]' },
                { key: 'EVENT', label: '[EVENT]', class: 'bg-[#F3E8FF] text-[#7E22CE] border-[#E9D5FF]' }
              ].map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPriority(p.key as any)}
                  className={`px-3 py-1.5 rounded-lg border font-bold text-[10px] transition-all ${p.class} ${
                    priority === p.key ? 'ring-2 ring-[#0D9488] shadow-xs' : 'opacity-60 hover:opacity-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pin to Top Toggle */}
          <div className="flex items-center justify-between p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <Pin className="w-4 h-4 text-[#0D9488]" />
              <span className="font-bold text-[#0F172A] text-xs">PIN TO TOP OF BULLETIN</span>
            </div>
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="w-4 h-4 text-[#0D9488] rounded border-[#CBD5E1] cursor-pointer"
            />
          </div>

          {/* Attachment Upload Dropzone */}
          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Attach Memo Document (PDF / DOCX)</label>
            <div className="border-2 border-dashed border-[#CBD5E1] rounded-lg p-3 text-center bg-[#F8FAFC] hover:bg-[#F0FDFA] transition-colors">
              <input
                type="file"
                id="file-upload"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) setFileName(e.target.files[0].name);
                }}
              />
              <label htmlFor="file-upload" className="cursor-pointer flex items-center justify-center gap-2 text-xs text-[#0D9488] font-bold">
                <Paperclip className="w-3.5 h-3.5" />
                {fileName ? `Attached: ${fileName}` : 'Choose File or Drop PDF'}
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded bg-[#F1F5F9] text-[#475569] font-bold hover:bg-[#E2E8F0]"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="py-2 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold uppercase tracking-wider cursor-pointer"
            >
              {submitting ? 'POSTING...' : 'PUBLISH NOTICE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Component 2: <AddEditHolidayModal />
interface AddEditHolidayModalProps {
  isOpen: boolean;
  onClose: () => void;
  holidayToEdit?: any;
  onSuccess: () => void;
}

export const AddEditHolidayModal: React.FC<AddEditHolidayModalProps> = ({
  isOpen,
  onClose,
  holidayToEdit,
  onSuccess,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);
  useEscapeKey(onClose);

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState('public');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (holidayToEdit) {
      setName(holidayToEdit.name || '');
      setDate(holidayToEdit.date || '');
      setType(holidayToEdit.type || 'public');
    } else {
      setName('');
      setDate('');
      setType('public');
    }
  }, [holidayToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (holidayToEdit) {
        await api.put(`/holidays/${holidayToEdit.id}`, { name, date, type });
        alert('Holiday updated successfully!');
      } else {
        await api.post('/holidays', { name, date, type });
        alert('Holiday entry added successfully!');
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to save holiday entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="bg-white border border-[#CBD5E1] rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans"
      >
        <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between font-mono">
          <h3 className="text-xs font-bold text-[#0F172A] uppercase flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#0D9488]" />
            {holidayToEdit ? 'EDIT HOLIDAY ENTRY' : 'ADD NEW HOLIDAY ENTRY'}
          </h3>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 font-mono text-xs">
          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Holiday Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Eid-ul-Fitr / Labour Day"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] font-sans text-xs"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Date (ISO Picker) *</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Holiday Classification *</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] text-xs"
            >
              <option value="public">Public Holiday (Official Gazetted)</option>
              <option value="company">Company Holiday (Mandatory Observance)</option>
              <option value="optional">Optional / Restricted Holiday</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 rounded bg-[#F1F5F9] text-[#475569] font-bold hover:bg-[#E2E8F0]"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="py-2 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold uppercase tracking-wider cursor-pointer"
            >
              {submitting ? 'SAVING...' : holidayToEdit ? 'UPDATE ENTRY' : 'SAVE HOLIDAY'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Main Page Component
export const NoticesPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const isHR = user?.role === 'Super Admin' || user?.role === 'HR Manager';

  const [holidays, setHolidays] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals visibility
  const [isPostAnnouncementOpen, setIsPostAnnouncementOpen] = useState(false);
  const [isAddHolidayOpen, setIsAddHolidayOpen] = useState(false);
  const [holidayToEdit, setHolidayToEdit] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const hRes = await api.get('/holidays');
      const sortedHolidays = (hRes.data.holidays || []).sort(
        (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      setHolidays(sortedHolidays);

      const aRes = await api.get('/holidays/announcements');
      setAnnouncements(aRes.data.announcements || []);
    } catch (e) {
      console.error('Error fetching notices data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHoliday = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete holiday "${name}"?`)) return;
    try {
      await api.delete(`/holidays/${id}`);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to delete holiday');
    }
  };

  const handleDeleteAnnouncement = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete announcement "${title}"?`)) return;
    try {
      await api.delete(`/holidays/announcements/${id}`);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to delete announcement');
    }
  };

  const handlePrintPdfCalendar = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 industrial-card p-6 bg-white border border-[#CBD5E1]">
        <div>
          <h1 className="text-lg font-bold text-[#0F172A] flex items-center gap-2 font-mono uppercase tracking-wider">
            <Bell className="w-5 h-5 text-[#0D9488]" />
            HOLIDAY CALENDAR & ANNOUNCEMENTS
          </h1>
          <p className="text-xs text-[#64748B] mt-1 font-sans">
            Official company holiday schedule & general announcements bulletin
          </p>
        </div>

        {isHR && (
          <button
            onClick={() => setIsPostAnnouncementOpen(true)}
            className="py-2.5 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-md uppercase tracking-wider cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-white" />
            POST ANNOUNCEMENT
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Holidays Section */}
        <div className="industrial-card p-6 space-y-4 bg-white border border-[#CBD5E1] flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
              <div className="industrial-header flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#0D9488]" />
                OFFICIAL HOLIDAYS (2026)
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintPdfCalendar}
                  className="px-2.5 py-1.5 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A] rounded border border-[#CBD5E1] text-[10px] font-mono font-bold uppercase transition-colors flex items-center gap-1.5 shadow-2xs"
                  title="Download / Print Annual PDF Calendar"
                >
                  <Download className="w-3 h-3 text-[#0D9488]" />
                  DOWNLOAD PDF
                </button>

                {isHR && (
                  <button
                    onClick={() => {
                      setHolidayToEdit(null);
                      setIsAddHolidayOpen(true);
                    }}
                    className="px-2.5 py-1.5 bg-[#0D9488] hover:bg-[#0F766E] text-white rounded text-[10px] font-mono font-bold uppercase transition-colors flex items-center gap-1 shadow-2xs"
                  >
                    <Plus className="w-3 h-3" /> ADD HOLIDAY
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2 font-mono text-xs max-h-[500px] overflow-y-auto pr-1">
              {holidays.length > 0 ? (
                holidays.map((h) => (
                  <div key={h.id} className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between hover:border-[#99F6E4] transition-colors group">
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="font-bold text-[#0F172A] flex items-center gap-2">
                        <span>{h.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold ${
                          h.type === 'company' ? 'bg-[#F3E8FF] text-[#7E22CE]' : 'bg-[#CCFBF1] text-[#0F766E]'
                        }`}>
                          {h.type}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#64748B] font-sans mt-0.5">{h.description || 'Official holiday observance'}</div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-xs font-bold text-[#0D9488] bg-[#ECFDF5] px-3 py-1 rounded border border-[#A7F3D0]">
                        {formatDate(h.date)}
                      </div>

                      {isHR && (
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => {
                              setHolidayToEdit(h);
                              setIsAddHolidayOpen(true);
                            }}
                            className="p-1 hover:text-[#0D9488] text-[#64748B]"
                            title="Edit Holiday"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteHoliday(h.id, h.name)}
                            className="p-1 hover:text-[#DC2626] text-[#64748B]"
                            title="Delete Holiday"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-[#64748B] font-mono">
                  {loading ? 'LOADING CALENDAR...' : 'NO HOLIDAYS REGISTERED.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Announcements Bulletin */}
        <div className="industrial-card p-6 space-y-4 bg-white border border-[#CBD5E1] flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="industrial-header flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#0D9488]" />
                ANNOUNCEMENTS BULLETIN ({announcements.length})
              </div>
            </div>

            <div className="space-y-3 font-sans text-xs max-h-[500px] overflow-y-auto pr-1">
              {announcements.length > 0 ? (
                announcements.map((a) => (
                  <div key={a.id} className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 hover:border-[#99F6E4] transition-all group relative">
                    <div className="flex items-center justify-between font-mono">
                      <div className="flex items-center gap-2">
                        {a.pinned && <Pin className="w-3.5 h-3.5 text-[#0D9488] fill-[#0D9488]" />}
                        <span className="font-bold text-[#0F172A] text-xs uppercase">{a.title}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                          a.priority === 'URGENT'
                            ? 'bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]'
                            : a.priority === 'EVENT'
                            ? 'bg-[#F3E8FF] text-[#7E22CE] border border-[#E9D5FF]'
                            : 'bg-[#CCFBF1] text-[#0F766E] border border-[#99F6E4]'
                        }`}>
                          [{a.priority || 'GENERAL'}]
                        </span>

                        {isHR && (
                          <button
                            onClick={() => handleDeleteAnnouncement(a.id, a.title)}
                            className="p-1 hover:text-[#DC2626] text-[#94A3B8] transition-colors"
                            title="Delete Announcement"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-[#334155] leading-relaxed font-sans">{a.body || a.content}</p>

                    {a.attachment_name && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#E0F2FE] text-[#0284C7] font-mono text-[10px] border border-[#BAE6FD]">
                        <Paperclip className="w-3 h-3" />
                        <span>Attachment: {a.attachment_name}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[10px] font-mono text-[#64748B] pt-2 border-t border-[#F1F5F9]">
                      <span>Posted: {formatDate(a.created_at)}</span>
                      <span>Target: {a.target_dept || 'All Departments'}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-[#64748B] font-mono">
                  {loading ? 'LOADING BULLETIN...' : 'NO ANNOUNCEMENTS PUBLISHED.'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Target Modals using useOnClickOutside & useEscapeKey */}
      <PostAnnouncementModal
        isOpen={isPostAnnouncementOpen}
        onClose={() => setIsPostAnnouncementOpen(false)}
        onSuccess={fetchData}
      />

      <AddEditHolidayModal
        isOpen={isAddHolidayOpen}
        onClose={() => setIsAddHolidayOpen(false)}
        holidayToEdit={holidayToEdit}
        onSuccess={fetchData}
      />
    </div>
  );
};
