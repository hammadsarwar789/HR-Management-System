import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Clock,
  AlertTriangle,
  Play,
  Eye,
  CheckCircle2,
  FolderKanban,
  Calendar,
  Sparkles,
  UserCheck
} from 'lucide-react';
import { taskApi, TaskItem } from '../services/taskApi';

export const MyTasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadMyTasks();
  }, []);

  const loadMyTasks = async () => {
    setLoading(true);
    try {
      const myTaskList = await taskApi.getMyTasks();
      setTasks(myTaskList);
    } catch (err) {
      console.error('Failed to load my tasks', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusTransition = async (taskId: string, newStatus: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE') => {
    try {
      await taskApi.updateTaskStatus(taskId, newStatus);
      await loadMyTasks();
    } catch (err) {
      console.error(err);
    }
  };

  // Group tasks by project
  const groupedProjects = tasks.reduce((acc, task) => {
    const projName = task.project_name || 'General Project';
    if (!acc[projName]) {
      acc[projName] = [];
    }
    acc[projName].push(task);
    return acc;
  }, {} as Record<string, TaskItem[]>);

  const activeCount = tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS').length;
  const reviewCount = tasks.filter((t) => t.status === 'IN_REVIEW').length;
  const doneCount = tasks.filter((t) => t.status === 'DONE').length;

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
    <div className="p-6 space-y-6 max-w-6xl mx-auto font-sans text-slate-100">
      {/* Header Summary Cards */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <CheckSquare className="w-7 h-7 text-teal-400" />
            <span>My Assigned Tasks</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track your tasks across projects, update progress, and submit work for review.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl text-center">
            <p className="text-xs text-slate-400 font-medium">Active Tasks</p>
            <p className="text-lg font-bold text-teal-400">{activeCount}</p>
          </div>
          <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl text-center">
            <p className="text-xs text-slate-400 font-medium">In Review</p>
            <p className="text-lg font-bold text-amber-400">{reviewCount}</p>
          </div>
          <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl text-center">
            <p className="text-xs text-slate-400 font-medium">Completed</p>
            <p className="text-lg font-bold text-sky-400">{doneCount}</p>
          </div>
        </div>
      </div>

      {/* Task List Grouped by Project */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 font-mono text-xs animate-pulse">
          Loading assigned tasks...
        </div>
      ) : Object.keys(groupedProjects).length > 0 ? (
        Object.entries(groupedProjects).map(([projectName, projectTasks]) => (
          <div key={projectName} className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-1">
            <div className="bg-slate-950/80 px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FolderKanban className="w-4 h-4 text-teal-400" />
                <h3 className="font-bold text-slate-200 text-sm">{projectName}</h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-300">
                {projectTasks.length} Task(s)
              </span>
            </div>

            <div className="divide-y divide-slate-800/80 p-2">
              {projectTasks.map((t) => (
                <div key={t.id} className="p-4 hover:bg-slate-800/40 transition rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 group">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${getPriorityBadgeClass(t.priority)}`}>
                        {t.priority}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">
                        Status: <strong className="text-teal-300 uppercase">{t.status.replace('_', ' ')}</strong>
                      </span>
                    </div>

                    <h4 className="font-bold text-base text-slate-100 group-hover:text-teal-300 transition">
                      {t.title}
                    </h4>

                    {t.description && (
                      <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">{t.description}</p>
                    )}

                    <div className="flex items-center space-x-4 text-[11px] text-slate-500 pt-1 font-mono">
                      {t.due_date && (
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Due: {new Date(t.due_date).toLocaleDateString()}</span>
                        </div>
                      )}
                      {t.estimated_hours && (
                        <div className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>Est: {t.estimated_hours}h</span>
                        </div>
                      )}
                      {t.created_by_manager && (
                        <div className="flex items-center space-x-1">
                          <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                          <span>Assigned by: {t.created_by_manager}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 1-Click Status Advancement Action Buttons */}
                  <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
                    {t.status === 'TODO' && (
                      <button
                        onClick={() => handleStatusTransition(t.id, 'IN_PROGRESS')}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-sm"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start Task</span>
                      </button>
                    )}

                    {t.status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => handleStatusTransition(t.id, 'IN_REVIEW')}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold transition shadow-sm"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Submit for Review</span>
                      </button>
                    )}

                    {t.status === 'IN_REVIEW' && (
                      <button
                        onClick={() => handleStatusTransition(t.id, 'DONE')}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-slate-950 text-xs font-bold transition shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Done</span>
                      </button>
                    )}

                    {t.status === 'DONE' && (
                      <span className="flex items-center space-x-1 px-3 py-1 rounded-lg bg-teal-950 text-teal-300 border border-teal-500/30 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                        <span>Completed</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="bg-slate-900 border border-slate-800 p-12 rounded-2xl text-center space-y-3">
          <CheckSquare className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-300">No Assigned Tasks Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            You currently have no tasks assigned to you. Tasks allocated by your Department Manager will appear here.
          </p>
        </div>
      )}
    </div>
  );
};
