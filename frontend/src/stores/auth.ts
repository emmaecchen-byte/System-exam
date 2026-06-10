import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '@/api/client';
import {
  getHomeRoute,
  hasAnyRole,
  resolvePrimaryRole,
  RoleCode,
} from '@/constants/roles';

export interface AuthUser {
  id: string;
  name: string;
  employeeNo: string;
  email: string | null;
  department: { id: string; name: string } | null;
  roles: string[];
  permissions: string[];
  primaryRole: RoleCode;
}

const TOKEN_KEY = 'accessToken';
const REMEMBER_KEY = 'rememberMe';

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const initialized = ref(false);

  const isAuthenticated = computed(() => !!getStoredToken() && !!user.value);
  const primaryRole = computed(() => user.value?.primaryRole ?? resolvePrimaryRole(user.value?.roles ?? []));
  const homeRoute = computed(() => getHomeRoute(user.value?.roles ?? []));

  function hasPermission(code: string) {
    return user.value?.permissions.includes(code) ?? false;
  }

  function hasRole(...roles: RoleCode[]) {
    return hasAnyRole(user.value?.roles ?? [], roles);
  }

  function setToken(token: string, rememberMe: boolean) {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(REMEMBER_KEY, String(rememberMe));
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REMEMBER_KEY);
    localStorage.removeItem('lastActivity');
    sessionStorage.removeItem('lastActivity');
  }

  async function login(identifier: string, password: string, rememberMe = false) {
    const { data } = await api.post('/auth/login', { identifier, password, rememberMe });
    setToken(data.accessToken, rememberMe);
    user.value = data.user;
    touchActivity();
    return data.user as AuthUser;
  }

  async function fetchMe() {
    const token = getStoredToken();
    if (!token) {
      user.value = null;
      initialized.value = true;
      return null;
    }
    try {
      const { data } = await api.get('/auth/me');
      user.value = data;
      touchActivity();
      return data as AuthUser;
    } catch {
      clearToken();
      user.value = null;
      return null;
    } finally {
      initialized.value = true;
    }
  }

  async function refreshToken() {
    const { data } = await api.post('/auth/refresh-token');
    const rememberMe = localStorage.getItem(REMEMBER_KEY) === 'true';
    setToken(data.accessToken, rememberMe);
    user.value = data.user;
    return data.accessToken as string;
  }

  async function logout() {
    try {
      if (getStoredToken()) {
        await api.post('/auth/logout');
      }
    } catch {
      // ignore — still clear local session
    } finally {
      clearToken();
      user.value = null;
    }
  }

  function touchActivity() {
    const ts = String(Date.now());
    localStorage.setItem('lastActivity', ts);
    sessionStorage.setItem('lastActivity', ts);
  }

  function getLastActivity(): number {
    const raw = localStorage.getItem('lastActivity') ?? sessionStorage.getItem('lastActivity');
    return raw ? Number(raw) : Date.now();
  }

  return {
    user,
    initialized,
    isAuthenticated,
    primaryRole,
    homeRoute,
    hasPermission,
    hasRole,
    login,
    fetchMe,
    refreshToken,
    logout,
    touchActivity,
    getLastActivity,
    getStoredToken,
  };
});
