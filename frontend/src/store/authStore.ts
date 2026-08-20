import { create } from 'zustand';

export interface EmployeeInfo {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  designation: string;
  department?: string;
  department_id?: string | number;
  profile_picture_url?: string;
  gender?: string;
}


export interface User {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  two_factor_enabled?: boolean;
  employee?: EmployeeInfo;
}

interface AuthState {
  user: User | null;
  token: string | null;
  setUser: (user: User | null, token?: string) => void;
  logout: () => void;
  hasPermission: (perm: string) => boolean;
}

const savedUserStr = localStorage.getItem('user');
let initialUser: User | null = null;
if (savedUserStr) {
  try {
    initialUser = JSON.parse(savedUserStr);
  } catch (e) {
    initialUser = null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: initialUser,
  token: localStorage.getItem('access_token'),
  setUser: (user, token) => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
    if (token) {
      localStorage.setItem('access_token', token);
    }
    set({ user, token: token || get().token });
  },
  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('access_token');
    set({ user: null, token: null });
    window.location.href = '/login';
  },
  hasPermission: (perm: string) => {
    const u = get().user;
    if (!u) return false;
    if (u.role === 'Super Admin') return true;
    return u.permissions.includes(perm);
  }
}));
