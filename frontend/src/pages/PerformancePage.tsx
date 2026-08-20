import React, { useState, useEffect, useRef } from 'react';
import { Award, Target, Plus, X, Users, CheckCircle, Calendar, FileText, Eye, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useOnClickOutside, useEscapeKey } from '../hooks/useOnClickOutside';

// Helper to format dates as ISO/Standard string (e.g. "13 Aug 2026")
const formatDate = (dateStr?: string) => {
  if (!dateStr) return '13 Aug 2026';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return '13 Aug 2026';
  }
};

// Component 1: <EmployeeSelectDropdown /> with Search, AutoFocus, and Empty State
interface EmployeeSelectDropdownProps {
  employees: any[];
  selectedEmployeeId: string;
  onSelect: (empId: string) => void;
  label?: string;
}

export const EmployeeSelectDropdown: React.FC<EmployeeSelectDropdownProps> = ({
  employees,
  selectedEmployeeId,
  onSelect,
  label = "TARGET EMPLOYEES *"
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useOnClickOutside(containerRef, () => setIsOpen(false));
  useEscapeKey(() => setIsOpen(false));

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const selectedEmp = employees.find((e) => e.id === selectedEmployeeId);

  const filteredEmployees = employees.filter((emp) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
    const code = (emp.employee_code || '').toLowerCase();
    const desig = (emp.designation || '').toLowerCase();
    const dept = (emp.department || '').toLowerCase();
    return name.includes(q) || code.includes(q) || desig.includes(q) || dept.includes(q);
  });

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1 font-mono">{label}</label>

      {/* Trigger Combobox Display */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] rounded text-xs font-mono flex items-center justify-between cursor-pointer hover:border-[#0D9488] transition-colors shadow-xs"
      >
        <span className={selectedEmployeeId ? "font-bold text-[#0F172A]" : "text-[#94A3B8]"}>
          {selectedEmployeeId === 'all'
            ? "⚡ All Employees (Bulk Assign)"
            : selectedEmp
            ? `${selectedEmp.first_name} ${selectedEmp.last_name} (${selectedEmp.employee_code}) — ${selectedEmp.designation}`
            : "Select Candidate..."}
        </span>
        <Search className="w-3.5 h-3.5 text-[#0D9488]" />
      </div>

      {/* Searchable Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 bg-white border border-[#CBD5E1] rounded-xl shadow-2xl z-50 overflow-hidden font-mono text-xs animate-in fade-in zoom-in-95 duration-150">
          {/* Realtime Search Bar with AutoFocus */}
          <div className="p-2.5 bg-[#F8FAFC] border-b border-[#E2E8F0] relative">
            <Search className="w-3.5 h-3.5 text-[#0D9488] absolute left-5 top-4 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search by name, EMP-ID, designation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs industrial-input bg-white border border-[#CBD5E1] rounded font-sans"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-3.5 text-[#94A3B8] hover:text-[#0F172A]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtered Results Options List */}
          <div className="max-h-52 overflow-y-auto divide-y divide-[#F1F5F9]">
            <button
              type="button"
              onClick={() => {
                onSelect('all');
                setIsOpen(false);
                setSearchQuery('');
              }}
              className={`w-full text-left p-2.5 font-bold transition-colors ${
                selectedEmployeeId === 'all' ? 'bg-[#CCFBF1] text-[#0F766E]' : 'hover:bg-[#F0FDFA] text-[#0D9488]'
              }`}
            >
              ⚡ All Employees (Bulk Assign)
            </button>

            {filteredEmployees.length > 0 ? (
              filteredEmployees.map((emp) => {
                const isSelected = selectedEmployeeId === emp.id;
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => {
                      onSelect(emp.id);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={`w-full text-left p-2.5 flex items-center justify-between transition-colors ${
                      isSelected ? 'bg-[#CCFBF1] text-[#0F766E] font-bold' : 'hover:bg-[#F8FAFC] text-[#0F172A]'
                    }`}
                  >
                    <div>
                      <div className="font-bold">{emp.first_name} {emp.last_name} <span className="text-[#64748B] font-normal">({emp.employee_code})</span></div>
                      <div className="text-[10px] text-[#64748B] font-sans">{emp.designation} • {emp.department || 'Engineering'}</div>
                    </div>
                    {isSelected && <span className="text-[10px] font-bold text-[#0D9488]">SELECTED ✓</span>}
                  </button>
                );
              })
            ) : (
              <div className="p-6 text-center text-[#64748B] text-xs font-sans">
                No employees found matching "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Component 2: Enhanced <EvaluationCard />
interface EvaluationCardProps {
  evaluation: {
    id: string;
    employeeName?: string;
    employeeId?: string;
    employeeAvatar?: string;
    cycle?: string;
    score?: number | string;
    remarks?: string;
    evaluatedBy?: string;
    date?: string;
    status?: string;
  };
  onClick?: () => void;
}

export const EvaluationCard: React.FC<EvaluationCardProps> = ({ evaluation, onClick }) => {
  const name = evaluation.employeeName || 'Ali Khan';
  const empCode = evaluation.employeeId || 'EMP-004';
  const avatarUrl = evaluation.employeeAvatar;
  const initials = name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
  const score = evaluation.score ?? 4.5;
  const formattedScore = typeof score === 'number' ? score.toFixed(1) : score;
  const cycle = evaluation.cycle || '2026-Q1';
  const status = (evaluation.status || 'COMPLETED').toUpperCase();
  const remarks = evaluation.remarks || 'No evaluation remarks recorded.';
  const evaluatedBy = evaluation.evaluatedBy || 'HR Manager / System Administrator';
  const formattedDate = formatDate(evaluation.date);

  return (
    <div
      onClick={onClick}
      className="p-4 rounded-xl bg-white border border-[#CBD5E1] hover:border-[#0D9488] hover:shadow-md transition-all space-y-3 cursor-pointer group font-sans"
    >
      {/* Row 1 (Header): Identification & Score Badge */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#0F172A] border border-[#0D9488] text-[#14B8A6] font-mono font-bold text-xs flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
            {avatarUrl ? (
              <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-extrabold text-[#0F172A] group-hover:text-[#0D9488] transition-colors truncate">
              {name} <span className="text-[#64748B] font-mono font-normal">・ {empCode}</span>
            </h4>
            <p className="text-[10px] font-mono text-[#64748B]">Workforce Member</p>
          </div>
        </div>

        <div className="px-2.5 py-1 rounded-md bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] font-mono font-extrabold text-xs shrink-0 shadow-2xs">
          KPI SCORE: {formattedScore} / 5.0
        </div>
      </div>

      {/* Row 2 (Sub-header): Cycle & Status Badges */}
      <div className="flex items-center gap-2 font-mono text-[10px]">
        <span className="px-2 py-0.5 rounded bg-[#CCFBF1] text-[#0F766E] font-bold border border-[#99F6E4] uppercase tracking-wider">
          CYCLE {cycle}
        </span>
        <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider border ${
          status === 'COMPLETED'
            ? 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]'
            : 'bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]'
        }`}>
          [{status}]
        </span>
      </div>

      {/* Row 3 (Content / Remarks) */}
      <div className="p-3 bg-[#F8FAFC] rounded-lg border-l-3 border-[#0D9488] text-xs text-[#334155] italic font-sans leading-relaxed">
        "{remarks}"
      </div>

      {/* Row 4 (Footer): Date & Evaluator */}
      <div className="flex items-center justify-between text-[10px] font-mono text-[#64748B] pt-2 border-t border-[#F1F5F9]">
        <span>Evaluated: {formattedDate}</span>
        <span className="font-semibold text-[#475569]">Evaluated by: {evaluatedBy}</span>
      </div>
    </div>
  );
};

// Component 3: <CreateGoalModal />
interface CreateGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: any[];
  onSuccess: () => void;
}

export const CreateGoalModal: React.FC<CreateGoalModalProps> = ({
  isOpen,
  onClose,
  employees,
  onSuccess,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);
  useEscapeKey(onClose);

  const [goalTitle, setGoalTitle] = useState('');
  const [goalCycle, setGoalCycle] = useState('2026-Q1');
  const [goalDescription, setGoalDescription] = useState('');
  const [selectedGoalEmpId, setSelectedGoalEmpId] = useState('all');
  const [submittingGoal, setSubmittingGoal] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingGoal(true);
    try {
      let empIds: string[] = [];
      if (selectedGoalEmpId === 'all') {
        empIds = employees.map((emp) => emp.id);
      } else if (selectedGoalEmpId) {
        empIds = [selectedGoalEmpId];
      }

      await api.post('/performance/goals', {
        employee_ids: empIds.length > 0 ? empIds : undefined,
        title: goalTitle,
        cycle: goalCycle,
        description: goalDescription,
      });

      alert('Goal / OKR created & assigned successfully!');
      setGoalTitle('');
      setGoalDescription('');
      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to create goal');
    } finally {
      setSubmittingGoal(false);
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
            <Target className="w-4 h-4 text-[#0D9488]" /> CREATE NEW GOAL / OKR
          </h3>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 font-mono text-xs">
          <EmployeeSelectDropdown
            employees={employees}
            selectedEmployeeId={selectedGoalEmpId}
            onSelect={(empId) => setSelectedGoalEmpId(empId)}
            label="Target Employees *"
          />

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Goal / OKR Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Deliver Q1 Enterprise Microservices API Architecture"
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] font-sans"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Review Cycle *</label>
            <select
              value={goalCycle}
              onChange={(e) => setGoalCycle(e.target.value)}
              className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1]"
            >
              <option value="2026-Q1">2026 - Q1</option>
              <option value="2026-Q2">2026 - Q2</option>
              <option value="2026-H1">2026 - H1</option>
              <option value="2026-ANNUAL">2026 - Annual</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Objectives & Description</label>
            <textarea
              rows={3}
              placeholder="Detail key deliverables, target KPIs, and success criteria..."
              value={goalDescription}
              onChange={(e) => setGoalDescription(e.target.value)}
              className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] font-sans"
            />
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
              disabled={submittingGoal}
              className="py-2 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-bold uppercase tracking-wider cursor-pointer"
            >
              {submittingGoal ? 'SAVING...' : 'ASSIGN GOAL / OKR'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Component 4: <StartReviewModal />
interface StartReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  employees: any[];
  onSuccess: () => void;
}

export const StartReviewModal: React.FC<StartReviewModalProps> = ({
  isOpen,
  onClose,
  employees,
  onSuccess,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);
  useEscapeKey(onClose);

  const [reviewCycle, setReviewCycle] = useState('2026-Q1');
  const [reviewKpiScore, setReviewKpiScore] = useState('4.5');
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [selectedReviewEmpId, setSelectedReviewEmpId] = useState('all');
  const [submittingReview, setSubmittingReview] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReview(true);
    try {
      let empIds: string[] = [];
      if (selectedReviewEmpId === 'all') {
        empIds = employees.map((emp) => emp.id);
      } else if (selectedReviewEmpId) {
        empIds = [selectedReviewEmpId];
      }

      await api.post('/performance/reviews', {
        employee_ids: empIds.length > 0 ? empIds : undefined,
        cycle: reviewCycle,
        kpi_score: parseFloat(reviewKpiScore) || 4.5,
        feedback: reviewFeedback,
      });

      alert('Performance review cycle initialized successfully!');
      setReviewFeedback('');
      onSuccess();
      onClose();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to start review cycle');
    } finally {
      setSubmittingReview(false);
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
            <Award className="w-4 h-4 text-[#0D9488]" /> START PERFORMANCE REVIEW CYCLE
          </h3>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 font-mono text-xs">
          <EmployeeSelectDropdown
            employees={employees}
            selectedEmployeeId={selectedReviewEmpId}
            onSelect={(empId) => setSelectedReviewEmpId(empId)}
            label="Target Employees *"
          />

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Review Cycle *</label>
            <select
              value={reviewCycle}
              onChange={(e) => setReviewCycle(e.target.value)}
              className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1]"
            >
              <option value="2026-Q1">2026 - Q1 Review Cycle</option>
              <option value="2026-Q2">2026 - Q2 Review Cycle</option>
              <option value="2026-H1">2026 - H1 Bi-Annual Evaluation</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Initial KPI Score Rating (Out of 5.0) *</label>
            <input
              type="number"
              step="0.1"
              min="1.0"
              max="5.0"
              required
              value={reviewKpiScore}
              onChange={(e) => setReviewKpiScore(e.target.value)}
              className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1]"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase mb-1">Review Feedback & Appraisal Notes</label>
            <textarea
              rows={3}
              required
              placeholder="Enter executive appraisal feedback, technical achievements, and areas for growth..."
              value={reviewFeedback}
              onChange={(e) => setReviewFeedback(e.target.value)}
              className="w-full p-2.5 industrial-input bg-white border border-[#CBD5E1] font-sans"
            />
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
              disabled={submittingReview}
              className="py-2 px-4 rounded bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold uppercase tracking-wider cursor-pointer border border-[#1E293B]"
            >
              {submittingReview ? 'INITIALIZING...' : 'SUBMIT REVIEW CYCLE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Component 5: <GoalDetailsPopover />
interface GoalDetailsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  item: any;
  type: 'goal' | 'review';
}

export const GoalDetailsPopover: React.FC<GoalDetailsPopoverProps> = ({
  isOpen,
  onClose,
  item,
  type,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(popoverRef, onClose);
  useEscapeKey(onClose);

  if (!isOpen || !item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
    >
      <div
        ref={popoverRef}
        className="bg-white border border-[#CBD5E1] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans"
      >
        <div className="p-4 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between font-mono">
          <h3 className="text-xs font-bold text-[#0F172A] uppercase flex items-center gap-2">
            {type === 'goal' ? <Target className="w-4 h-4 text-[#0D9488]" /> : <Award className="w-4 h-4 text-[#0D9488]" />}
            {type === 'goal' ? `GOAL / OKR DETAILS: ${item.cycle}` : `EVALUATION RECORD: ${item.cycle}`}
          </h3>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#0F172A]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 font-mono text-xs">
          <div className="p-3.5 bg-[#F0FDFA] border border-[#99F6E4] rounded-lg space-y-1">
            <div className="text-sm font-extrabold text-[#0F766E]">
              {type === 'goal' ? item.title : `CYCLE ${item.cycle}`}
            </div>
            {type === 'review' && (item.kpi_score || item.score) && (
              <div className="text-xs font-bold text-[#047857]">
                KPI SCORE: {typeof (item.kpi_score || item.score) === 'number' ? (item.kpi_score || item.score).toFixed(1) : (item.kpi_score || item.score)} / 5.0
              </div>
            )}
            {type === 'goal' && item.status && (
              <div className="text-[10px] font-bold text-[#0D9488] uppercase">
                STATUS: {item.status}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-[#64748B] uppercase">
              {type === 'goal' ? 'Objectives & Key Deliverables' : 'Executive Feedback & Performance Notes'}
            </label>
            <p className="text-xs text-[#334155] font-sans leading-relaxed p-3.5 bg-[#F8FAFC] rounded border-l-3 border-[#0D9488] italic">
              "{type === 'goal' ? (item.description || 'No detailed objectives provided.') : (item.feedback || item.remarks)}"
            </p>
          </div>

          <div className="flex justify-between items-center text-[10px] font-mono text-[#64748B] pt-3 border-t border-[#E2E8F0]">
            <span>Evaluated: {formatDate(item.created_at || item.date)}</span>
            <button
              onClick={onClose}
              className="py-2 px-4 rounded bg-[#0F172A] text-white font-bold uppercase tracking-wider"
            >
              CLOSE DRAWER
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Page Component
export const PerformancePage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const isHR = user?.role === 'Super Admin' || user?.role === 'HR Manager';

  const [goals, setGoals] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Visibility States
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Drawer / Popover State
  const [selectedPopoverItem, setSelectedPopoverItem] = useState<any>(null);
  const [popoverType, setPopoverType] = useState<'goal' | 'review'>('goal');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  useEffect(() => {
    fetchData();
    if (isHR) fetchEmployees();
  }, []);

  const fetchData = async () => {
    try {
      const gRes = await api.get('/performance/goals');
      setGoals(gRes.data.goals || []);
      const rRes = await api.get('/performance/reviews');
      setReviews(rRes.data.reviews || []);
    } catch (e) {
      console.error('Error fetching performance data', e);
    } finally {
      setLoading(false);
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

  const openDetailsPopover = (item: any, type: 'goal' | 'review') => {
    setSelectedPopoverItem(item);
    setPopoverType(type);
    setIsPopoverOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 industrial-card p-6 bg-white border border-[#CBD5E1]">
        <div>
          <h1 className="text-lg font-bold text-[#0F172A] flex items-center gap-2 font-mono uppercase tracking-wider">
            <Award className="w-5 h-5 text-[#0D9488]" />
            PERFORMANCE EVALUATION & OKRs
          </h1>
          <p className="text-xs text-[#64748B] mt-1 font-sans">
            Bi-annual performance review cycles, quarterly OKRs & KPI scores
          </p>
        </div>

        {isHR && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => setIsGoalModalOpen(true)}
              className="py-2.5 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-md uppercase tracking-wider cursor-pointer"
            >
              <Plus className="w-4 h-4 text-white" />
              CREATE GOAL / OKR
            </button>

            <button
              onClick={() => setIsReviewModalOpen(true)}
              className="py-2.5 px-4 rounded bg-[#0F172A] hover:bg-[#1E293B] text-white font-mono font-bold text-xs flex items-center gap-2 transition-all shadow-md uppercase tracking-wider cursor-pointer border border-[#1E293B]"
            >
              <Plus className="w-4 h-4 text-[#14B8A6]" />
              START REVIEW CYCLE
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Goals List */}
        <div className="industrial-card p-6 space-y-4 bg-white border border-[#CBD5E1] flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="industrial-header flex items-center gap-2">
                <Target className="w-4 h-4 text-[#0D9488]" />
                ACTIVE GOALS & OKRs ({goals.length})
              </div>
              {isHR && goals.length > 0 && (
                <button
                  onClick={() => setIsGoalModalOpen(true)}
                  className="text-[10px] font-mono font-bold text-[#0D9488] hover:text-[#0F766E] uppercase flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> ADD GOAL
                </button>
              )}
            </div>

            <div className="space-y-3 font-mono text-xs max-h-[520px] overflow-y-auto pr-1">
              {goals.length > 0 ? (
                goals.map((g) => (
                  <div
                    key={g.id}
                    onClick={() => openDetailsPopover(g, 'goal')}
                    className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2 hover:border-[#99F6E4] hover:bg-[#F0FDFA] transition-all cursor-pointer group shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0D9488] group-hover:text-[#0F766E] flex items-center gap-1.5 text-xs">
                        {g.title}
                        <Eye className="w-3 h-3 text-[#94A3B8] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                      <span className="text-[10px] text-[#0F766E] px-2 py-0.5 rounded bg-[#CCFBF1] font-bold uppercase tracking-wider border border-[#99F6E4]">
                        {g.cycle}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#64748B] font-sans">
                      Target: <span className="font-bold text-[#0F172A] font-mono">{g.employee_name || 'Workforce Member'} ({g.employee_code || 'EMP'})</span>
                    </div>

                    <p className="text-xs text-[#334155] font-sans line-clamp-2 italic bg-white p-2.5 rounded border border-[#E2E8F0] border-l-3 border-[#0D9488]">
                      "{g.description || 'No detailed description.'}"
                    </p>

                    <div className="text-[10px] text-[#64748B] pt-1 flex items-center justify-between border-t border-[#F1F5F9]">
                      <span className="capitalize font-bold text-[#047857]">Status: {g.status || 'In Progress'}</span>
                      <span className="text-[9px] text-[#0D9488] font-bold uppercase">VIEW DETAILS &rarr;</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded-xl space-y-3">
                  <Target className="w-8 h-8 text-[#94A3B8] mx-auto animate-pulse" />
                  <div>
                    <p className="text-xs font-bold text-[#0F172A] font-mono">NO ACTIVE GOALS LOGGED</p>
                    <p className="text-[11px] text-[#64748B] font-sans mt-0.5">
                      {isHR ? 'Define quarterly OKRs and performance targets for your workforce.' : 'No quarterly goals or OKRs assigned to your profile yet.'}
                    </p>
                  </div>
                  {isHR && (
                    <button
                      onClick={() => setIsGoalModalOpen(true)}
                      className="py-2 px-4 rounded bg-[#0D9488] hover:bg-[#0F766E] text-white font-mono font-bold text-xs inline-flex items-center gap-1.5 transition-all shadow-sm uppercase tracking-wider cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      CREATE GOAL / OKR
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Reviews List */}
        <div className="industrial-card p-6 space-y-4 bg-white border border-[#CBD5E1] flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="industrial-header flex items-center gap-2">
                <Award className="w-4 h-4 text-[#0D9488]" />
                PERFORMANCE EVALUATIONS ({reviews.length})
              </div>
              {isHR && reviews.length > 0 && (
                <button
                  onClick={() => setIsReviewModalOpen(true)}
                  className="text-[10px] font-mono font-bold text-[#0D9488] hover:text-[#0F766E] uppercase flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> NEW REVIEW
                </button>
              )}
            </div>

            <div className="space-y-3 font-mono text-xs max-h-[520px] overflow-y-auto pr-1">
              {reviews.length > 0 ? (
                reviews.map((r) => (
                  <EvaluationCard
                    key={r.id}
                    evaluation={{
                      id: r.id,
                      employeeName: r.employee_name,
                      employeeId: r.employee_code,
                      employeeAvatar: r.employee_avatar,
                      cycle: r.cycle,
                      score: r.kpi_score,
                      remarks: r.feedback,
                      evaluatedBy: r.reviewer_name,
                      date: r.created_at,
                      status: r.status,
                    }}
                    onClick={() => openDetailsPopover(r, 'review')}
                  />
                ))
              ) : (
                <div className="p-8 text-center bg-[#F8FAFC] border border-dashed border-[#CBD5E1] rounded-xl space-y-3">
                  <Award className="w-8 h-8 text-[#94A3B8] mx-auto animate-pulse" />
                  <div>
                    <p className="text-xs font-bold text-[#0F172A] font-mono">NO REVIEWS CONDUCTED YET</p>
                    <p className="text-[11px] text-[#64748B] font-sans mt-0.5">
                      {isHR ? 'Initialize a performance evaluation cycle to grade employee KPIs.' : 'No performance evaluation records logged for your profile yet.'}
                    </p>
                  </div>
                  {isHR && (
                    <button
                      onClick={() => setIsReviewModalOpen(true)}
                      className="py-2 px-4 rounded bg-[#0F172A] hover:bg-[#1E293B] text-white font-mono font-bold text-xs inline-flex items-center gap-1.5 transition-all shadow-sm uppercase tracking-wider cursor-pointer border border-[#1E293B]"
                    >
                      <Plus className="w-4 h-4 text-[#14B8A6]" />
                      START REVIEW CYCLE
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Target Modals & Popovers using useOnClickOutside & useEscapeKey */}
      <CreateGoalModal
        isOpen={isGoalModalOpen}
        onClose={() => setIsGoalModalOpen(false)}
        employees={employees}
        onSuccess={fetchData}
      />

      <StartReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        employees={employees}
        onSuccess={fetchData}
      />

      <GoalDetailsPopover
        isOpen={isPopoverOpen}
        onClose={() => setIsPopoverOpen(false)}
        item={selectedPopoverItem}
        type={popoverType}
      />
    </div>
  );
};
