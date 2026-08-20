import React, { useState, useEffect } from 'react';
import {
  FolderKanban,
  CheckSquare,
  Plus,
  Users,
  Clock,
  AlertTriangle,
  LayoutGrid,
  List,
  UserCheck,
  Calendar,
  X,
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Play,
  Eye,
  Trash2
} from 'lucide-react';
import {
  taskApi,
  Project,
  TaskItem,
  WorkloadMetric,
  DepartmentInfo,
  DepartmentMember
} from '../services/taskApi';

export const TasksManagementPage: React.FC = () => {
  const [department, setDepartment] = useState<DepartmentInfo | null>(null);
  const [members, setMembers] = useState<DepartmentMember[]>([]);
  const [isManager, setIsManager] = useState<boolean>(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [workload, setWorkload] = useState<WorkloadMetric[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // View state: 'kanban' | 'table'
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [showAllocateModal, setShowAllocateModal] = useState<boolean>(false);
  const [showProjectModal, setShowProjectModal] = useState<boolean>(false);

  // Allocate Task Form
  const [taskTitle, setTaskTitle] = useState<string>('');
  const [taskDescription, setTaskDescription] = useState<string>('');
  const [taskProjectId, setTaskProjectId] = useState<string>('');
  const [taskPriority, setTaskPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [taskHours, setTaskHours] = useState<string>('8');
  const [taskDueDate, setTaskDueDate] = useState<string>('');
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);

  // Create Project Form
  const [projectName, setProjectName] = useState<string>('');
  const [projectDescription, setProjectDescription] = useState<string>('');
  const [projectStartDate, setProjectStartDate] = useState<string>('');
  const [projectEndDate, setProjectEndDate] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const deptData = await taskApi.getMyDepartment();
      setDepartment(deptData.department);
      setIsManager(deptData.is_manager);
      setMembers(deptData.members || []);

      const projList = await taskApi.getProjects();
      setProjects(projList);
      if (projList.length > 0 && !taskProjectId) {
        setTaskProjectId(projList[0].id);
      }

      const taskData = await taskApi.getDepartmentTasks();
      setTasks(taskData.tasks || []);
      setWorkload(taskData.workload || []);
    } catch (err) {
      console.error('Failed to load tasks management data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    try {
      await taskApi.createProject({
        name: projectName,
        description: projectDescription,
        department_id: department?.id,
        start_date: projectStartDate || undefined,
        end_date: projectEndDate || undefined
      });
      setShowProjectModal(false);
      setProjectName('');
      setProjectDescription('');
      setProjectStartDate('');
      setProjectEndDate('');
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to create project');
    }
  };

  const handleAllocateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskProjectId) return;

    try {
      await taskApi.createTask({
        project_id: taskProjectId,
        title: taskTitle,
        description: taskDescription,
        priority: taskPriority,
        estimated_hours: parseFloat(taskHours) || 0,
        due_date: taskDueDate || undefined,
        assignee_user_ids: selectedAssigneeIds
      });
      setShowAllocateModal(false);
      setTaskTitle('');
      setTaskDescription('');
      setTaskHours('8');
      setTaskDueDate('');
      setSelectedAssigneeIds([]);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Failed to allocate task');
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE') => {
    try {
      await taskApi.updateTaskStatus(taskId, newStatus);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await taskApi.deleteTask(taskId);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  // Filter tasks by project & search
  const filteredTasks = tasks.filter((t) => {
    const matchesProj = selectedProjectId === 'ALL' || t.project_id === selectedProjectId;
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesProj && matchesSearch;
  });

  const getTasksByStatus = (status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE') => {
    return filteredTasks.filter((t) => t.status === status);
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'HIGH':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'MEDIUM':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      default:
        return 'bg-slate-700/50 text-slate-300 border-slate-600/50';
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto font-sans text-slate-100">
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <FolderKanban className="w-7 h-7 text-teal-400" />
              <span>{department?.name || 'Department'} Projects & Task Allocation</span>
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase bg-teal-950 text-teal-300 border border-teal-500/30">
              {isManager ? 'Department Manager Workspace' : 'Department Workspace'}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Allocate tasks to team members, monitor developer workload, and manage project progress.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <button
            onClick={() => setShowProjectModal(true)}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition shadow-sm"
          >
            <Plus className="w-4 h-4 text-teal-400" />
            <span>Create Project</span>
          </button>
          <button
            onClick={() => setShowAllocateModal(true)}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-slate-950 text-xs font-bold transition shadow-md shadow-teal-950/40"
          >
            <CheckSquare className="w-4 h-4" />
            <span>Allocate Task</span>
          </button>
        </div>
      </div>

      {/* 2. Developer Workload Balance Bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-teal-400" />
            <span>Team Workload Balance</span>
          </h3>
          <span className="text-[11px] text-slate-400">Active tasks assigned per developer</span>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {workload.length > 0 ? (
            workload.map((w) => (
              <div
                key={w.user_id}
                className={`flex items-center space-x-2.5 px-3 py-2 rounded-lg border text-xs font-medium transition ${
                  w.active_task_count >= 5
                    ? 'bg-rose-950/50 border-rose-500/50 text-rose-200'
                    : w.active_task_count >= 3
                    ? 'bg-amber-950/50 border-amber-500/50 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <div className="w-6 h-6 rounded-md bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center">
                  {w.name[0]}
                </div>
                <div>
                  <p className="font-bold text-slate-200 text-xs">{w.name}</p>
                  <p className="text-[10px] text-slate-400">Code: {w.code}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  w.active_task_count >= 5
                    ? 'bg-rose-500 text-white'
                    : w.active_task_count >= 3
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-teal-500/20 text-teal-300'
                }`}>
                  {w.active_task_count} active
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 italic">No department workload records available.</p>
          )}
        </div>
      </div>

      {/* 3. Controls & View Switcher */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {/* Project Filter */}
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-teal-500"
          >
            <option value="ALL">All Projects ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Search Box */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>

        {/* View Toggle Buttons */}
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setViewMode('kanban')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
              viewMode === 'kanban' ? 'bg-teal-600 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Kanban</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
              viewMode === 'table' ? 'bg-teal-600 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Table</span>
          </button>
        </div>
      </div>

      {/* 4. Kanban View */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const).map((statusCol) => {
            const colTasks = getTasksByStatus(statusCol);
            const colTitles = {
              TODO: 'To Do',
              IN_PROGRESS: 'In Progress',
              IN_REVIEW: 'In Review',
              DONE: 'Done'
            };
            const colColors = {
              TODO: 'border-slate-700 bg-slate-900/60',
              IN_PROGRESS: 'border-sky-500/40 bg-sky-950/20',
              IN_REVIEW: 'border-amber-500/40 bg-amber-950/20',
              DONE: 'border-teal-500/40 bg-teal-950/20'
            };

            return (
              <div key={statusCol} className={`p-4 rounded-xl border ${colColors[statusCol]} space-y-3 min-h-[400px]`}>
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="font-mono font-bold text-xs uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-teal-400" />
                    <span>{colTitles[statusCol]}</span>
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-800 text-slate-300">
                    {colTasks.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {colTasks.length > 0 ? (
                    colTasks.map((t) => (
                      <div
                        key={t.id}
                        className="bg-slate-900 border border-slate-800 hover:border-teal-500/50 p-4 rounded-xl shadow-lg space-y-3 transition group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[10px] font-mono font-bold text-teal-400 uppercase tracking-tight truncate">
                            {t.project_name}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border uppercase ${getPriorityBadgeClass(t.priority)}`}>
                            {t.priority}
                          </span>
                        </div>

                        <h5 className="font-bold text-sm text-slate-100 leading-snug group-hover:text-teal-300 transition">
                          {t.title}
                        </h5>

                        {t.description && (
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{t.description}</p>
                        )}

                        {/* Assignees List */}
                        {t.assignees && t.assignees.length > 0 && (
                          <div className="flex items-center space-x-1.5 pt-1">
                            <span className="text-[10px] text-slate-500">Assigned:</span>
                            {t.assignees.map((a) => (
                              <span
                                key={a.user_id}
                                className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] font-medium rounded-md border border-slate-700 truncate max-w-[100px]"
                                title={a.name}
                              >
                                {a.name}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                          <div className="flex items-center space-x-1">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span>{t.estimated_hours}h</span>
                          </div>

                          {/* Quick Status Select */}
                          <select
                            value={t.status}
                            onChange={(e) => handleStatusChange(t.id, e.target.value as any)}
                            className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 focus:outline-none"
                          >
                            <option value="TODO">TODO</option>
                            <option value="IN_PROGRESS">IN_PROGRESS</option>
                            <option value="IN_REVIEW">IN_REVIEW</option>
                            <option value="DONE">DONE</option>
                          </select>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-xs text-slate-600 font-mono italic">
                      No tasks in {colTitles[statusCol]}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 5. Table View */
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-3.5">Task Title</th>
                <th className="p-3.5">Project</th>
                <th className="p-3.5">Priority</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Assignees</th>
                <th className="p-3.5">Est. Hours</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredTasks.length > 0 ? (
                filteredTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3.5 font-bold text-slate-100">{t.title}</td>
                    <td className="p-3.5 text-teal-400 font-semibold">{t.project_name}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${getPriorityBadgeClass(t.priority)}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <select
                        value={t.status}
                        onChange={(e) => handleStatusChange(t.id, e.target.value as any)}
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-semibold text-slate-200"
                      >
                        <option value="TODO">TODO</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="IN_REVIEW">IN_REVIEW</option>
                        <option value="DONE">DONE</option>
                      </select>
                    </td>
                    <td className="p-3.5">
                      {t.assignees && t.assignees.length > 0 ? (
                        t.assignees.map((a) => a.name).join(', ')
                      ) : (
                        <span className="text-slate-500 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3.5">{t.estimated_hours} hrs</td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => handleDeleteTask(t.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
                        title="Delete Task"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 font-mono text-xs">
                    No matching tasks found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: ALLOCATE TASK */}
      {showAllocateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleAllocateTask}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-teal-400" />
                <span>Allocate Task to Department Member</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAllocateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-400 mb-1">Select Project</label>
                <select
                  value={taskProjectId}
                  onChange={(e) => setTaskProjectId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  required
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1">Task Title</label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="e.g. Design Interactive Component"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="Describe task scope, requirements, and acceptance criteria..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Priority</label>
                  <select
                    value={taskPriority}
                    onChange={(e) => setTaskPriority(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Est. Hours</label>
                  <input
                    type="number"
                    value={taskHours}
                    onChange={(e) => setTaskHours(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1">Due Date</label>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1">Assign Developer (Department Member)</label>
                <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-950 p-2 rounded-lg border border-slate-800">
                  {members.map((m) => (
                    <label key={m.user_id} className="flex items-center space-x-2 p-1.5 hover:bg-slate-900 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedAssigneeIds.includes(m.user_id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAssigneeIds((prev) => [...prev, m.user_id]);
                          } else {
                            setSelectedAssigneeIds((prev) => prev.filter((id) => id !== m.user_id));
                          }
                        }}
                        className="rounded border-slate-700 bg-slate-900 text-teal-600 focus:ring-0"
                      />
                      <span className="font-semibold text-slate-200">{m.name}</span>
                      <span className="text-[10px] text-slate-500">({m.designation})</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAllocateModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 text-xs font-bold transition shadow-md shadow-teal-950/30"
              >
                Allocate Task
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CREATE PROJECT */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateProject}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <FolderKanban className="w-5 h-5 text-teal-400" />
                <span>Create Department Project</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowProjectModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-400 mb-1">Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. HRMS Dashboard 2.0"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Project goal and scope..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={projectStartDate}
                    onChange={(e) => setProjectStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={projectEndDate}
                    onChange={(e) => setProjectEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowProjectModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 text-xs font-bold transition shadow-md shadow-teal-950/30"
              >
                Create Project
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
