import axios from 'axios';

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Response interceptor to handle session 401s (expired / missing tokens)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const requestUrl = error.config?.url || '';
      // Do not clear session for form validation errors (e.g. password change or 2FA code verification)
      const isFormAuthValidation =
        requestUrl.includes('/auth/login') ||
        requestUrl.includes('/auth/2fa') ||
        requestUrl.includes('/auth/change-password');

      if (!isFormAuthValidation) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const getAvatarUrl = (path?: string | null): string => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:') || path.startsWith('data:')) {
    return path;
  }
  const backendOrigin = (import.meta as any).env?.VITE_BACKEND_ORIGIN || 'http://localhost:5000';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${backendOrigin}${cleanPath}`;
};
