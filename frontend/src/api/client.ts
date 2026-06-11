import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getApiBaseUrl } from '@/config/apiBase';

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
});

function getToken(): string | null {
  return localStorage.getItem('accessToken') ?? sessionStorage.getItem('accessToken');
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshing = false;

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const isAuthEndpoint = original?.url?.includes('/auth/login');
    const isPublicEndpoint =
      original?.url?.includes('/public/') || original?.url?.includes('/health');

    if (error.response?.status === 401 && original && !original._retry && !isAuthEndpoint && !isPublicEndpoint) {
      if (getToken()) {
        if (!refreshing) {
          refreshing = true;
          try {
            const { data } = await api.post('/auth/refresh-token');
            const rememberMe = localStorage.getItem('rememberMe') === 'true';
            const storage = rememberMe ? localStorage : sessionStorage;
            localStorage.removeItem('accessToken');
            sessionStorage.removeItem('accessToken');
            storage.setItem('accessToken', data.accessToken);
            original._retry = true;
            original.headers.Authorization = `Bearer ${data.accessToken}`;
            refreshing = false;
            return api(original);
          } catch {
            refreshing = false;
          }
        }
      }
      localStorage.removeItem('accessToken');
      sessionStorage.removeItem('accessToken');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login?reason=session_expired';
      }
    }

    return Promise.reject(error);
  },
);

export default api;
