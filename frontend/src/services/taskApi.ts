import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api/v1';

const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  return {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
};

export interface Project {
  id: string;
  name: string;
  description?: string;
  department_id: number;
  department_name?: string;
  manager_id: string;
  manager_name?: string;
  status: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
  start_date?: string;
  end_date?: string;
  member_count?: number;
  task_count?: number;
  completed_task_count?: number;
  created_at?: string;
}

export interface TaskAssignee {
  user_id: string;
  name: string;
  email: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  project_id: string;
  project_name?: string;
  department_id: number;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE';
  estimated_hours?: number;
  due_date?: string;
  assignees?: TaskAssignee[];
  created_by_manager?: string;
  created_at?: string;
}

export interface WorkloadMetric {
  user_id: string;
  name: string;
  code: string;
  active_task_count: number;
}

export interface DepartmentMember {
  user_id: string;
  employee_code: string;
  name: string;
  email: string;
  designation: string;
  is_manager: boolean;
}

export interface DepartmentInfo {
  id: number;
  name: string;
  manager_id?: string;
  manager?: { user_id: string; name: string; email: string };
}

export const taskApi = {
  getMyDepartment: async (): Promise<{ department: DepartmentInfo | null; is_manager: boolean; members: DepartmentMember[] }> => {
    const response = await axios.get(`${API_BASE_URL}/departments/my-department`, getAuthHeaders());
    return response.data;
  },

  getProjects: async (): Promise<Project[]> => {
    const response = await axios.get(`${API_BASE_URL}/projects`, getAuthHeaders());
    return response.data.projects || [];
  },

  createProject: async (data: { name: string; description?: string; department_id?: number; start_date?: string; end_date?: string }): Promise<{ success: boolean; project: Project }> => {
    const response = await axios.post(`${API_BASE_URL}/projects`, data, getAuthHeaders());
    return response.data;
  },

  getDepartmentTasks: async (): Promise<{ department_id: number; department_name: string; tasks: TaskItem[]; workload: WorkloadMetric[] }> => {
    const response = await axios.get(`${API_BASE_URL}/tasks/department`, getAuthHeaders());
    return response.data;
  },

  getMyTasks: async (): Promise<TaskItem[]> => {
    const response = await axios.get(`${API_BASE_URL}/tasks/my-tasks`, getAuthHeaders());
    return response.data.tasks || [];
  },

  createTask: async (data: {
    project_id: string;
    title: string;
    description?: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    estimated_hours?: number;
    due_date?: string;
    assignee_user_ids?: string[];
  }): Promise<{ success: boolean; task_id: string }> => {
    const response = await axios.post(`${API_BASE_URL}/tasks`, data, getAuthHeaders());
    return response.data;
  },

  updateTaskStatus: async (taskId: string, status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'DONE'): Promise<{ success: boolean }> => {
    const response = await axios.patch(`${API_BASE_URL}/tasks/${taskId}/status`, { status }, getAuthHeaders());
    return response.data;
  },

  deleteTask: async (taskId: string): Promise<{ success: boolean }> => {
    const response = await axios.delete(`${API_BASE_URL}/tasks/${taskId}`, getAuthHeaders());
    return response.data;
  },

  // AGILE SPRINTS & ISSUES
  getProjectSprints: async (projectId: string): Promise<Sprint[]> => {
    const response = await axios.get(`${API_BASE_URL}/agile/projects/${projectId}/sprints`, getAuthHeaders());
    return response.data.sprints || [];
  },

  createSprint: async (projectId: string, name: string, goal?: string): Promise<{ success: boolean; sprint_id: string }> => {
    const response = await axios.post(`${API_BASE_URL}/agile/projects/${projectId}/sprints`, { name, goal }, getAuthHeaders());
    return response.data;
  },

  updateSprintStatus: async (sprintId: string, status: 'PLANNED' | 'ACTIVE' | 'COMPLETED'): Promise<{ success: boolean }> => {
    const response = await axios.patch(`${API_BASE_URL}/agile/sprints/${sprintId}/status`, { status }, getAuthHeaders());
    return response.data;
  },

  getProjectBoard: async (projectId: string): Promise<{ active_sprint: Sprint | null; issues: AgileIssue[] }> => {
    const response = await axios.get(`${API_BASE_URL}/agile/projects/${projectId}/board`, getAuthHeaders());
    return response.data;
  },

  getProjectBacklog: async (projectId: string): Promise<{ sprints: (Sprint & { issues: AgileIssue[] })[]; backlog_issues: AgileIssue[] }> => {
    const response = await axios.get(`${API_BASE_URL}/agile/projects/${projectId}/backlog`, getAuthHeaders());
    return response.data;
  },

  createAgileIssue: async (
    projectId: string,
    data: {
      title: string;
      description?: string;
      issue_type?: 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'SUBTASK';
      priority?: 'LOWEST' | 'LOW' | 'MEDIUM' | 'HIGH' | 'HIGHEST' | 'BLOCKER';
      story_points?: number;
      sprint_id?: string;
      assignee_id?: string;
      parent_issue_id?: string;
    }
  ): Promise<{ success: boolean; issue: AgileIssue }> => {
    const response = await axios.post(`${API_BASE_URL}/agile/projects/${projectId}/issues`, data, getAuthHeaders());
    return response.data;
  },

  moveIssue: async (
    issueId: string,
    data: {
      status?: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'QA' | 'DONE';
      sprint_id?: string | null;
      order_index?: number;
      issue_type?: string;
      priority?: string;
      story_points?: number;
      assignee_id?: string;
      description?: string;
    }
  ): Promise<{ success: boolean; issue: AgileIssue }> => {
    const response = await axios.patch(`${API_BASE_URL}/agile/issues/${issueId}/move`, data, getAuthHeaders());
    return response.data;
  },

  getIssueComments: async (issueId: string): Promise<IssueComment[]> => {
    const response = await axios.get(`${API_BASE_URL}/agile/issues/${issueId}/comments`, getAuthHeaders());
    return response.data.comments || [];
  },

  addIssueComment: async (issueId: string, body: string): Promise<{ success: boolean }> => {
    const response = await axios.post(`${API_BASE_URL}/agile/issues/${issueId}/comments`, { body }, getAuthHeaders());
    return response.data;
  },
};

export interface Sprint {
  id: string;
  project_id: string;
  name: string;
  goal?: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  start_date?: string;
  end_date?: string;
  issue_count?: number;
  total_points?: number;
}

export interface AgileIssue {
  id: string;
  issue_key: string;
  title: string;
  description?: string;
  project_id: string;
  project_name?: string;
  department_id: number;
  sprint_id?: string;
  parent_issue_id?: string;
  issue_type: 'EPIC' | 'STORY' | 'TASK' | 'BUG' | 'SUBTASK';
  status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'QA' | 'DONE';
  priority: 'LOWEST' | 'LOW' | 'MEDIUM' | 'HIGH' | 'HIGHEST' | 'BLOCKER';
  story_points: number;
  order_index: number;
  estimated_hours?: number;
  due_date?: string;
  reporter_id?: string;
  reporter_name?: string;
  assignee_id?: string;
  assignee_name?: string;
  comment_count?: number;
  subtask_count?: number;
  created_at?: string;
}

export interface IssueComment {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}
