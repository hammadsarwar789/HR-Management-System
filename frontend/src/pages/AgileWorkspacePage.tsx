import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  Bookmark,
  CheckSquare,
  Bug,
  Plus,
  Clock,
  MessageSquare,
  X,
  Layers,
  Send,
  Filter,
  ChevronDown,
  ChevronRight,
  Target,
  TrendingUp,
  Calendar,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  User
} from 'lucide-react';
import {
  taskApi,
  Project,
  Sprint,
  AgileIssue,
  IssueComment,
  DepartmentMember
} from '../services/taskApi';

/* ─── Helpers ─── */
const ISSUE_TYPE_ICONS: Record<string, React.ReactNode> = {
  BUG: <span title="Bug"><Bug className="w-3.5 h-3.5 text-rose-400 shrink-0" /></span>,
  STORY: <span title="Story"><Bookmark className="w-3.5 h-3.5 text-teal-400 shrink-0" /></span>,
  EPIC: <span title="Epic"><Zap className="w-3.5 h-3.5 text-violet-400 shrink-0" /></span>,
  SUBTASK: <span title="Subtask"><ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" /></span>,
  TASK: <span title="Task"><CheckSquare className="w-3.5 h-3.5 text-sky-400 shrink-0" /></span>
};

function issueTypeIcon(type: string) {
  return ISSUE_TYPE_ICONS[type] ?? ISSUE_TYPE_ICONS.TASK;
}

function priorityBadge(priority: string) {
  if (priority === 'BLOCKER' || priority === 'HIGHEST') return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  if (priority === 'HIGH') return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  if (priority === 'MEDIUM') return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
  return 'bg-slate-700/50 text-slate-400 border-slate-600/40';
}

const BOARD_COLS = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'QA', 'DONE'] as const;
const COL_LABELS: Record<string, string> = {
  TODO: 'TO DO',
  IN_PROGRESS: 'IN PROGRESS',
  IN_REVIEW: 'IN REVIEW',
  QA: 'QA VERIFY',
  DONE: 'DONE'
};

/* ─── Component ─── */
export const AgileWorkspacePage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [members, setMembers] = useState<DepartmentMember[]>([]);

  const [activeTab, setActiveTab] = useState<'board' | 'backlog'>('board');

  /* Board data */
  const [activeSprint, setActiveSprint] = useState<Sprint | null>(null);
  const [boardIssues, setBoardIssues] = useState<AgileIssue[]>([]);

  /* Backlog data */
  const [plannedSprints, setPlannedSprints] = useState<(Sprint & { issues: AgileIssue[] })[]>([]);
  const [backlogIssues, setBacklogIssues] = useState<AgileIssue[]>([]);

  const [loading, setLoading] = useState(true);

  /* Board filters */
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterAssignee, setFilterAssignee] = useState<string>('ALL');

  /* Drawer */
  const [selectedIssue, setSelectedIssue] = useState<AgileIssue | null>(null);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerDesc, setDrawerDesc] = useState('');
  const [issueComments, setIssueComments] = useState<IssueComment[]>([]);
  const [newCommentBody, setNewCommentBody] = useState('');
  const [subtasks, setSubtasks] = useState<AgileIssue[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);

  /* Modals */
  const [showCreateIssueModal, setShowCreateIssueModal] = useState(false);
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false);

  /* Create Issue form */
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [newIssueDesc, setNewIssueDesc] = useState('');
  const [newIssueType, setNewIssueType] = useState<'EPIC' | 'STORY' | 'TASK' | 'BUG'>('STORY');
  const [newIssuePriority, setNewIssuePriority] = useState<'LOWEST' | 'LOW' | 'MEDIUM' | 'HIGH' | 'HIGHEST' | 'BLOCKER'>('MEDIUM');
  const [newIssuePoints, setNewIssuePoints] = useState(3);
  const [newIssueAssignee, setNewIssueAssignee] = useState('');
  const [newIssueSprint, setNewIssueSprint] = useState<'BACKLOG' | string>('BACKLOG');

  /* Create Sprint form */
  const [newSprintName, setNewSprintName] = useState('');
  const [newSprintGoal, setNewSprintGoal] = useState('');
  const [newSprintStart, setNewSprintStart] = useState('');
  const [newSprintEnd, setNewSprintEnd] = useState('');

  /* Load on mount */
  useEffect(() => { loadProjectsAndMembers(); }, []);
  useEffect(() => { if (selectedProjectId) loadAgileData(selectedProjectId); }, [selectedProjectId, activeTab]);

  const loadProjectsAndMembers = async () => {
    try {
      const [deptData, projList] = await Promise.all([
        taskApi.getMyDepartment(),
        taskApi.getProjects()
      ]);
      setMembers(deptData.members || []);
      setProjects(projList);
      if (projList.length > 0) setSelectedProjectId(projList[0].id);
    } catch (err) { console.error('Failed to load', err); }
  };

  const loadAgileData = useCallback(async (projId: string) => {
    setLoading(true);
    try {
      if (activeTab === 'board') {
        const d = await taskApi.getProjectBoard(projId);
        setActiveSprint(d.active_sprint);
        setBoardIssues(d.issues || []);
      } else {
        const d = await taskApi.getProjectBacklog(projId);
        setPlannedSprints(d.sprints || []);
        setBacklogIssues(d.backlog_issues || []);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [activeTab]);

  /* ── Drawer helpers ── */
  const openDrawer = async (issue: AgileIssue) => {
    setSelectedIssue(issue);
    setDrawerTitle(issue.title);
    setDrawerDesc(issue.description || '');
    setSubtasks([]);
    setIssueComments([]);
    try {
      const [comms, board] = await Promise.all([
        taskApi.getIssueComments(issue.id),
        taskApi.getProjectBoard(issue.project_id)
      ]);
      setIssueComments(comms);
      // derive subtasks from board issues with parent_issue_id === this issue
      const allIssues = board.issues;
      setSubtasks(allIssues.filter(i => i.parent_issue_id === issue.id));
    } catch (err) { console.error(err); }
  };

  const closeDrawer = () => { setSelectedIssue(null); setNewSubtaskTitle(''); setShowSubtaskInput(false); };

  /* Save individual field to backend then refresh */
  const saveIssueField = async (field: Record<string, any>) => {
    if (!selectedIssue) return;
    try {
      const res = await taskApi.moveIssue(selectedIssue.id, field);
      setSelectedIssue(res.issue);
      await loadAgileData(selectedProjectId);
    } catch (err) { console.error(err); }
  };

  /* ── Status move on Kanban (header select) ── */
  const moveIssueStatus = async (issueId: string, status: string) => {
    try {
      await taskApi.moveIssue(issueId, { status: status as any });
      await loadAgileData(selectedProjectId);
    } catch (err) { console.error(err); }
  };

  /* ── Sprint moves ── */
  const moveIssueToSprint = async (issueId: string, sprintId: string) => {
    try {
      await taskApi.moveIssue(issueId, {
        sprint_id: sprintId === 'BACKLOG' ? null : sprintId
      });
      await loadAgileData(selectedProjectId);
    } catch (err) { console.error(err); }
  };

  const updateSprintStatus = async (sprintId: string, status: 'PLANNED' | 'ACTIVE' | 'COMPLETED') => {
    try {
      await taskApi.updateSprintStatus(sprintId, status);
      await loadAgileData(selectedProjectId);
    } catch (err) { console.error(err); }
  };

  /* ── Create issue ── */
  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !newIssueTitle.trim()) return;
    try {
      await taskApi.createAgileIssue(selectedProjectId, {
        title: newIssueTitle,
        description: newIssueDesc,
        issue_type: newIssueType,
        priority: newIssuePriority,
        story_points: newIssuePoints,
        sprint_id: newIssueSprint === 'BACKLOG' ? undefined : newIssueSprint,
        assignee_id: newIssueAssignee || undefined
      });
      setShowCreateIssueModal(false);
      resetCreateIssueForm();
      await loadAgileData(selectedProjectId);
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to create issue');
    }
  };

  const resetCreateIssueForm = () => {
    setNewIssueTitle(''); setNewIssueDesc(''); setNewIssueType('STORY');
    setNewIssuePriority('MEDIUM'); setNewIssuePoints(3); setNewIssueAssignee('');
    setNewIssueSprint('BACKLOG');
  };

  /* ── Create sprint ── */
  const handleCreateSprint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !newSprintName.trim()) return;
    try {
      await taskApi.createSprint(selectedProjectId, newSprintName, newSprintGoal);
      setShowCreateSprintModal(false);
      setNewSprintName(''); setNewSprintGoal(''); setNewSprintStart(''); setNewSprintEnd('');
      await loadAgileData(selectedProjectId);
    } catch (err) { console.error(err); }
  };

  /* ── Comment ── */
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssue || !newCommentBody.trim()) return;
    try {
      await taskApi.addIssueComment(selectedIssue.id, newCommentBody);
      setNewCommentBody('');
      const comms = await taskApi.getIssueComments(selectedIssue.id);
      setIssueComments(comms);
    } catch (err) { console.error(err); }
  };

  /* ── Subtask ── */
  const handleCreateSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssue || !newSubtaskTitle.trim()) return;
    try {
      const res = await taskApi.createAgileIssue(selectedIssue.project_id, {
        title: newSubtaskTitle,
        issue_type: 'SUBTASK',
        priority: 'MEDIUM',
        story_points: 1,
        sprint_id: selectedIssue.sprint_id || undefined,
        parent_issue_id: selectedIssue.id
      });
      setSubtasks(prev => [...prev, res.issue]);
      setNewSubtaskTitle('');
      setShowSubtaskInput(false);
      setSelectedIssue(si => si ? { ...si, subtask_count: (si.subtask_count || 0) + 1 } : null);
    } catch (err) { console.error(err); }
  };

  /* ── Filters ── */
  const filteredBoardIssues = boardIssues.filter(i => {
    const typeOk = filterType === 'ALL' || i.issue_type === filterType;
    const assigneeOk = filterAssignee === 'ALL' || i.assignee_id === filterAssignee;
    return typeOk && assigneeOk;
  });

  /* ── Sprint velocity ── */
  const donePoints = boardIssues.filter(i => i.status === 'DONE').reduce((s, i) => s + (i.story_points || 0), 0);
  const totalPoints = boardIssues.reduce((s, i) => s + (i.story_points || 0), 0);
  const velocityPct = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;

  /* ── Sprints list for "create issue" sprint select ── */
  const availableSprints = activeTab === 'board'
    ? (activeSprint ? [activeSprint] : [])
    : plannedSprints;

  /* ───────────────── RENDER ───────────────── */
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto font-sans text-slate-100 relative">

      {/* ── TOP HEADER ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-3">
            <Zap className="w-7 h-7 text-teal-400" />
            <h1 className="text-2xl font-bold text-slate-100">Agile Issue Board & Backlog</h1>
          </div>
          <div className="flex items-center flex-wrap gap-3 text-xs text-slate-400">
            <span>Project:</span>
            <select
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1 text-xs font-bold text-teal-300 focus:outline-none focus:border-teal-500"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {activeSprint && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-teal-950 text-teal-300 border border-teal-500/30">
                ⚡ {activeSprint.name}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={() => setShowCreateSprintModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition"
          >
            <Plus className="w-4 h-4 text-teal-400" /> <span>Create Sprint</span>
          </button>
          <button
            onClick={() => setShowCreateIssueModal(true)}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-slate-950 text-xs font-bold transition shadow-md shadow-teal-950/40"
          >
            <Plus className="w-4 h-4" /> <span>Create Issue</span>
          </button>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
        {(['board', 'backlog'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === tab
                ? 'bg-teal-600 text-slate-950 shadow-md shadow-teal-950/30'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {tab === 'board' ? <Layers className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
            <span>{tab === 'board' ? 'Active Sprint Board' : 'Backlog & Sprint Planning'}</span>
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* TAB 1: KANBAN BOARD */}
      {/* ══════════════════════════════════════════ */}
      {activeTab === 'board' && (
        <div className="space-y-4">

          {/* Sprint Banner + Velocity Bar */}
          {activeSprint ? (
            <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <span className="font-mono font-bold text-slate-200 uppercase tracking-wider mr-2">{activeSprint.name}</span>
                  <span className="text-xs text-slate-400 italic">"{activeSprint.goal || 'No goal set'}"</span>
                </div>
                <button
                  onClick={() => updateSprintStatus(activeSprint.id, 'COMPLETED')}
                  className="px-3 py-1 rounded-lg bg-rose-950 text-rose-300 border border-rose-500/40 hover:bg-rose-900 text-[11px] font-bold shrink-0"
                >
                  Complete Sprint
                </button>
              </div>

              {/* Velocity Progress Bar — Fix #11 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-teal-400" />
                    <span>Sprint Velocity</span>
                  </div>
                  <span className="font-bold text-teal-300">{donePoints} / {totalPoints} pts ({velocityPct}%)</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all duration-500"
                    style={{ width: `${velocityPct}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Empty state — Fix #13 */
            !loading && (
              <div className="bg-slate-900/60 border border-dashed border-slate-700 p-8 rounded-2xl text-center space-y-3">
                <Zap className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="font-bold text-slate-300 text-base">No Active Sprint</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Go to <strong>Backlog & Sprint Planning</strong> to create and start a sprint — then its issues will appear here on the board.
                </p>
              </div>
            )
          )}

          {/* Board Filters — Fix #9 */}
          {activeSprint && (
            <div className="flex items-center flex-wrap gap-3 py-2">
              <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                <Filter className="w-3.5 h-3.5" /> <span className="font-bold">Filter:</span>
              </div>

              {/* Type filter */}
              <div className="flex items-center gap-1">
                {[{ v: 'ALL', label: 'All Types' }, { v: 'BUG', label: '🐛 Bug' }, { v: 'STORY', label: '🔖 Story' }, { v: 'TASK', label: '📌 Task' }, { v: 'EPIC', label: '⚡ Epic' }].map(f => (
                  <button
                    key={f.v}
                    onClick={() => setFilterType(f.v)}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border transition ${filterType === f.v ? 'bg-teal-600 text-slate-950 border-transparent' : 'bg-slate-950 text-slate-400 border-slate-700 hover:border-slate-500'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Assignee filter */}
              <select
                value={filterAssignee}
                onChange={e => setFilterAssignee(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-300 focus:outline-none focus:border-teal-500"
              >
                <option value="ALL">All Assignees</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
              </select>
            </div>
          )}

          {/* Kanban Columns */}
          {activeSprint && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {BOARD_COLS.map(col => {
                const colIssues = filteredBoardIssues.filter(i => i.status === col);
                return (
                  <div key={col} className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-2xl flex flex-col min-h-[460px]">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3 shrink-0">
                      <span className="font-mono font-bold text-xs text-slate-300 tracking-wider">{COL_LABELS[col]}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400">{colIssues.length}</span>
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto pr-0.5">
                      {colIssues.length === 0 && (
                        <div className="py-10 text-center text-[11px] text-slate-700 font-mono italic">— empty —</div>
                      )}
                      {colIssues.map(issue => (
                        <div
                          key={issue.id}
                          onClick={() => openDrawer(issue)}
                          className="bg-slate-950 border border-slate-800 hover:border-teal-500/60 p-3.5 rounded-xl shadow-lg space-y-2.5 cursor-pointer group transition transform active:scale-[0.98]"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5">
                              {issueTypeIcon(issue.issue_type)}
                              <span className="text-[11px] font-mono font-bold text-teal-300 group-hover:underline">{issue.issue_key}</span>
                            </div>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${priorityBadge(issue.priority)}`}>
                              {issue.priority}
                            </span>
                          </div>

                          <h4 className="font-bold text-xs text-slate-100 leading-snug group-hover:text-teal-300 transition line-clamp-2">{issue.title}</h4>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 font-mono">
                            <div className="flex items-center space-x-1.5">
                              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[9px]">
                                {issue.assignee_name ? issue.assignee_name[0].toUpperCase() : 'U'}
                              </span>
                              <span className="truncate max-w-[72px]">{issue.assignee_name || 'Unassigned'}</span>
                            </div>
                            <div className="flex items-center space-x-2">
                              {!!issue.comment_count && (
                                <span className="flex items-center gap-0.5 text-slate-500">
                                  <MessageSquare className="w-3 h-3" />{issue.comment_count}
                                </span>
                              )}
                              {!!issue.subtask_count && (
                                <span className="flex items-center gap-0.5 text-slate-500">
                                  <CheckSquare className="w-3 h-3" />{issue.subtask_count}
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 font-bold text-teal-400 border border-slate-700">{issue.story_points}pts</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* TAB 2: BACKLOG & SPRINT PLANNING */}
      {/* ══════════════════════════════════════════ */}
      {activeTab === 'backlog' && (
        <div className="space-y-6">
          {plannedSprints.length === 0 && backlogIssues.length === 0 && !loading && (
            <div className="bg-slate-900 border border-dashed border-slate-700 p-10 rounded-2xl text-center space-y-3">
              <Target className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="font-bold text-slate-300 text-base">Backlog is empty</h3>
              <p className="text-xs text-slate-500">Create sprints and issues to start planning your project.</p>
            </div>
          )}

          {/* Sprint Accordions */}
          {plannedSprints.map(sprint => (
            <div key={sprint.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="font-bold text-slate-200 text-sm truncate">{sprint.name}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    sprint.status === 'ACTIVE' ? 'bg-teal-950 text-teal-300 border border-teal-500/30' : 'bg-slate-800 text-slate-400'
                  }`}>{sprint.status}</span>
                  <span className="text-xs text-slate-500 italic truncate hidden sm:block">{sprint.goal || 'No goal set'}</span>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <span className="text-xs font-mono font-bold text-teal-400">{sprint.issues.length} Issues</span>
                  {sprint.status === 'PLANNED' && (
                    <button
                      onClick={() => updateSprintStatus(sprint.id, 'ACTIVE')}
                      className="px-3 py-1 rounded bg-teal-600 hover:bg-teal-500 text-slate-950 text-xs font-bold"
                    >
                      Start Sprint
                    </button>
                  )}
                  {sprint.status === 'ACTIVE' && (
                    <button
                      onClick={() => updateSprintStatus(sprint.id, 'COMPLETED')}
                      className="px-3 py-1 rounded bg-rose-950 text-rose-300 border border-rose-500/40 hover:bg-rose-900 text-xs font-bold"
                    >
                      Complete
                    </button>
                  )}
                </div>
              </div>

              <div className="divide-y divide-slate-800 p-2">
                {sprint.issues.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-600 font-mono italic">
                    No issues in this sprint. Move issues from backlog.
                  </div>
                ) : sprint.issues.map(issue => (
                  <div
                    key={issue.id}
                    className="p-3 hover:bg-slate-800/50 rounded-xl flex items-center justify-between gap-4 group"
                  >
                    <div
                      onClick={() => openDrawer(issue)}
                      className="flex items-center space-x-3 min-w-0 cursor-pointer flex-1"
                    >
                      {issueTypeIcon(issue.issue_type)}
                      <span className="font-mono text-xs font-bold text-teal-300 shrink-0">{issue.issue_key}</span>
                      <span className="text-xs font-bold text-slate-200 truncate group-hover:text-teal-300">{issue.title}</span>
                    </div>
                    <div className="flex items-center space-x-3 shrink-0">
                      <select
                        value={issue.sprint_id || 'BACKLOG'}
                        onChange={e => moveIssueToSprint(issue.id, e.target.value)}
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-300 focus:outline-none"
                      >
                        <option value="BACKLOG">→ Backlog</option>
                        {plannedSprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300">{issue.story_points}pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Product Backlog */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-teal-400" />
                <h3 className="font-bold text-slate-200 text-sm">Product Backlog</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-400">{backlogIssues.length}</span>
              </div>
            </div>
            <div className="divide-y divide-slate-800 p-2">
              {backlogIssues.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-600 font-mono italic">Backlog is empty — all issues are in sprints.</div>
              ) : backlogIssues.map(issue => (
                <div key={issue.id} className="p-3 hover:bg-slate-800/50 rounded-xl flex items-center justify-between gap-4 group">
                  <div onClick={() => openDrawer(issue)} className="flex items-center space-x-3 min-w-0 cursor-pointer flex-1">
                    {issueTypeIcon(issue.issue_type)}
                    <span className="font-mono text-xs font-bold text-teal-300 shrink-0">{issue.issue_key}</span>
                    <span className="text-xs font-bold text-slate-200 truncate group-hover:text-teal-300">{issue.title}</span>
                  </div>
                  <div className="flex items-center space-x-3 shrink-0">
                    <select
                      defaultValue="BACKLOG"
                      onChange={e => moveIssueToSprint(issue.id, e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-slate-300 focus:outline-none"
                    >
                      <option value="BACKLOG" disabled>Move to Sprint…</option>
                      {plannedSprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300">{issue.story_points}pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* SLIDE-OVER ISSUE DRAWER — All fields fixed */}
      {/* ══════════════════════════════════════════ */}
      {selectedIssue && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex justify-end" onClick={e => { if (e.target === e.currentTarget) closeDrawer(); }}>
          <div className="w-full max-w-xl bg-slate-900 border-l border-slate-800 h-full flex flex-col p-0 shadow-2xl overflow-hidden">

            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 shrink-0 bg-slate-950">
              <div className="flex items-center space-x-2">
                {issueTypeIcon(selectedIssue.issue_type)}
                <span className="font-mono font-bold text-sm text-teal-300">{selectedIssue.issue_key}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${priorityBadge(selectedIssue.priority)}`}>
                  {selectedIssue.priority}
                </span>
              </div>
              <button onClick={closeDrawer} className="p-1 text-slate-400 hover:text-white rounded transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Title — Fix #2 */}
              <input
                type="text"
                value={drawerTitle}
                onChange={e => setDrawerTitle(e.target.value)}
                onBlur={() => {
                  if (drawerTitle.trim() && drawerTitle !== selectedIssue.title) {
                    saveIssueField({ title: drawerTitle });
                  }
                }}
                className="w-full bg-transparent font-bold text-lg text-slate-100 border-b border-transparent focus:outline-none focus:border-teal-500 pb-1 transition"
                placeholder="Issue title..."
              />

              {/* Attributes Grid */}
              <div className="grid grid-cols-2 gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs">
                {/* Status */}
                <div>
                  <label className="text-slate-400 block mb-1">Status</label>
                  <select
                    value={selectedIssue.status}
                    onChange={e => saveIssueField({ status: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-bold focus:outline-none focus:border-teal-500"
                  >
                    {['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'QA', 'DONE'].map(s => (
                      <option key={s} value={s}>{COL_LABELS[s]}</option>
                    ))}
                  </select>
                </div>

                {/* Priority — Fix #1 */}
                <div>
                  <label className="text-slate-400 block mb-1">Priority</label>
                  <select
                    value={selectedIssue.priority}
                    onChange={e => saveIssueField({ priority: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-bold focus:outline-none focus:border-teal-500"
                  >
                    {['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHEST', 'BLOCKER'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>

                {/* Story Points */}
                <div>
                  <label className="text-slate-400 block mb-1">Story Points</label>
                  <input
                    type="number"
                    min={0}
                    value={selectedIssue.story_points}
                    onChange={e => setSelectedIssue({ ...selectedIssue, story_points: parseInt(e.target.value) || 1 })}
                    onBlur={() => saveIssueField({ story_points: selectedIssue.story_points })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-bold focus:outline-none focus:border-teal-500"
                  />
                </div>

                {/* Assignee */}
                <div>
                  <label className="text-slate-400 block mb-1">Assignee</label>
                  <select
                    value={selectedIssue.assignee_id || ''}
                    onChange={e => saveIssueField({ assignee_id: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-bold focus:outline-none focus:border-teal-500"
                  >
                    <option value="">Unassigned</option>
                    {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                  </select>
                </div>

                {/* Issue Type */}
                <div>
                  <label className="text-slate-400 block mb-1">Issue Type</label>
                  <select
                    value={selectedIssue.issue_type}
                    onChange={e => saveIssueField({ issue_type: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-bold focus:outline-none focus:border-teal-500"
                  >
                    {['EPIC', 'STORY', 'TASK', 'BUG', 'SUBTASK'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Sprint */}
                <div>
                  <label className="text-slate-400 block mb-1">Sprint</label>
                  <select
                    value={selectedIssue.sprint_id || 'BACKLOG'}
                    onChange={e => saveIssueField({ sprint_id: e.target.value === 'BACKLOG' ? null : e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-bold focus:outline-none focus:border-teal-500"
                  >
                    <option value="BACKLOG">Backlog</option>
                    {plannedSprints.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    {activeSprint && <option value={activeSprint.id}>{activeSprint.name} (Active)</option>}
                  </select>
                </div>
              </div>

              {/* Description — Fix #2 */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold text-slate-400 uppercase">Description</label>
                <textarea
                  rows={4}
                  value={drawerDesc}
                  onChange={e => setDrawerDesc(e.target.value)}
                  onBlur={() => {
                    if (drawerDesc !== (selectedIssue.description || '')) {
                      saveIssueField({ description: drawerDesc });
                    }
                  }}
                  placeholder="Add a detailed description, acceptance criteria..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500 resize-none transition"
                />
              </div>

              {/* ── Subtasks — Fix #10 ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-mono font-bold text-xs text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5 text-sky-400" />
                    <span>Subtasks ({subtasks.length})</span>
                  </h4>
                  <button
                    onClick={() => setShowSubtaskInput(v => !v)}
                    className="text-[11px] font-bold text-teal-400 hover:text-teal-300 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Subtask
                  </button>
                </div>

                {showSubtaskInput && (
                  <form onSubmit={handleCreateSubtask} className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={newSubtaskTitle}
                      onChange={e => setNewSubtaskTitle(e.target.value)}
                      placeholder="Subtask title..."
                      autoFocus
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
                    />
                    <button type="submit" className="p-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 transition">
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setShowSubtaskInput(false)} className="p-2 text-slate-400 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </form>
                )}

                {subtasks.length > 0 && (
                  <div className="space-y-1.5 bg-slate-950 p-2 rounded-xl border border-slate-800">
                    {subtasks.map(st => (
                      <div key={st.id} className="flex items-center justify-between text-xs p-2 hover:bg-slate-900 rounded-lg transition">
                        <div className="flex items-center space-x-2 min-w-0">
                          {issueTypeIcon('SUBTASK')}
                          <span className="font-mono text-[10px] text-teal-400 shrink-0">{st.issue_key}</span>
                          <span className="text-slate-300 truncate">{st.title}</span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase border shrink-0 ${
                          st.status === 'DONE' ? 'bg-teal-950 text-teal-300 border-teal-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>{st.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Activity Comments ── */}
              <div className="space-y-3">
                <h4 className="font-mono font-bold text-xs text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-teal-400" />
                  <span>Activity ({issueComments.length})</span>
                </h4>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
                  {issueComments.length === 0 && (
                    <p className="text-[11px] text-slate-600 italic font-mono text-center py-3">No comments yet. Be the first!</p>
                  )}
                  {issueComments.map(c => (
                    <div key={c.id} className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-slate-300">{c.author_name}</span>
                        <span className="text-slate-500 font-mono">
                          {c.created_at ? new Date(c.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-snug">{c.body}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddComment} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={newCommentBody}
                    onChange={e => setNewCommentBody(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                  <button type="submit" className="p-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-slate-950 transition shadow-sm">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* MODAL: CREATE AGILE ISSUE */}
      {/* ══════════════════════════════════════════ */}
      {showCreateIssueModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateIssue}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Zap className="w-5 h-5 text-teal-400" /> Create Agile Issue
              </h3>
              <button type="button" onClick={() => setShowCreateIssueModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Issue Type</label>
                  <select value={newIssueType} onChange={e => setNewIssueType(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500">
                    <option value="STORY">🔖 Story</option>
                    <option value="TASK">📌 Task</option>
                    <option value="BUG">🐛 Bug</option>
                    <option value="EPIC">⚡ Epic</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Priority</label>
                  <select value={newIssuePriority} onChange={e => setNewIssuePriority(e.target.value as any)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500">
                    {['LOWEST', 'LOW', 'MEDIUM', 'HIGH', 'HIGHEST', 'BLOCKER'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1">Title *</label>
                <input
                  type="text"
                  value={newIssueTitle}
                  onChange={e => setNewIssueTitle(e.target.value)}
                  placeholder="e.g. Implement drag-and-drop column reordering"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={newIssueDesc}
                  onChange={e => setNewIssueDesc(e.target.value)}
                  placeholder="Details and acceptance criteria..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Story Points</label>
                  <input type="number" min={0} value={newIssuePoints} onChange={e => setNewIssuePoints(parseInt(e.target.value) || 1)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Assignee</label>
                  <select value={newIssueAssignee} onChange={e => setNewIssueAssignee(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500">
                    <option value="">Unassigned</option>
                    {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1">Add to Sprint</label>
                <select value={newIssueSprint} onChange={e => setNewIssueSprint(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500">
                  <option value="BACKLOG">Backlog (unscheduled)</option>
                  {activeSprint && <option value={activeSprint.id}>{activeSprint.name} (Active)</option>}
                  {plannedSprints.filter(s => s.status === 'PLANNED').map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button type="button" onClick={() => setShowCreateIssueModal(false)} className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 text-xs font-bold transition shadow-md shadow-teal-950/30">Create Issue</button>
            </div>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* MODAL: CREATE SPRINT — Fix #8: date pickers */}
      {/* ══════════════════════════════════════════ */}
      {showCreateSprintModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateSprint}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Zap className="w-5 h-5 text-teal-400" /> Create Planned Sprint
              </h3>
              <button type="button" onClick={() => setShowCreateSprintModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-400 mb-1">Sprint Name *</label>
                <input type="text" value={newSprintName} onChange={e => setNewSprintName(e.target.value)} placeholder="e.g. Sprint 3 (UI Polish)" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500" required autoFocus />
              </div>
              <div>
                <label className="block font-semibold text-slate-400 mb-1">Sprint Goal</label>
                <textarea rows={2} value={newSprintGoal} onChange={e => setNewSprintGoal(e.target.value)} placeholder="Goal for this iteration..." className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-400 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Start Date</label>
                  <input type="date" value={newSprintStart} onChange={e => setNewSprintStart(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-400 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> End Date</label>
                  <input type="date" value={newSprintEnd} onChange={e => setNewSprintEnd(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button type="button" onClick={() => setShowCreateSprintModal(false)} className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200">Cancel</button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 text-xs font-bold transition shadow-md shadow-teal-950/30">Create Sprint</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
