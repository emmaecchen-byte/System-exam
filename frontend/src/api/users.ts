import api from './client';
import type { RoleCode } from '@/constants/roles';

export interface DepartmentOption {
  id: string;
  name: string;
}

export interface UserRow {
  id: string;
  name: string;
  employeeNo: string;
  email: string | null;
  phone: string | null;
  status: string;
  department: DepartmentOption | null;
  userRoles: Array<{ role: { code: string; name: string } }>;
}

export interface UsersQuery {
  search?: string;
  role?: string;
  departmentId?: string;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface CreateUserPayload {
  name: string;
  employeeNo: string;
  departmentId?: string;
  roleCode: RoleCode | string;
  email?: string;
  phone?: string;
  password?: string;
}

export interface UpdateUserPayload {
  name?: string;
  departmentId?: string | null;
  roleCode?: RoleCode | string;
  email?: string | null;
  phone?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'LOCKED';
}

export interface DeptTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  status: string;
  children?: DeptTreeNode[];
}

export interface PermissionRow {
  id: string;
  code: string;
  name: string;
  module: string;
}

export interface RoleRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  rolePermissions: Array<{ permission: PermissionRow }>;
  _count: { userRoles: number };
}

export interface RolePermissionsResponse {
  role: {
    id: string;
    name: string;
    code: string;
    description: string | null;
    userCount: number;
  };
  permissions: PermissionRow[];
  permissionCodes: string[];
}

export function fetchUserDepartments() {
  return api.get<DepartmentOption[]>('/admin/users/departments');
}

export function fetchUsers(params: UsersQuery) {
  return api.get<{
    data: UserRow[];
    meta: { total: number; page: number; pageSize: number; totalPages: number };
  }>('/admin/users', { params });
}

export function createUser(payload: CreateUserPayload) {
  return api.post<UserRow>('/admin/users', payload);
}

export function updateUser(id: string, payload: UpdateUserPayload) {
  return api.put<UserRow>(`/admin/users/${id}`, payload);
}

export function deleteUser(id: string) {
  return api.delete(`/admin/users/${id}`);
}

export function resetUserPassword(id: string) {
  return api.post<{ password: string }>(`/admin/users/${id}/reset-password`);
}

export function fetchDepartmentTree() {
  return api.get<DeptTreeNode[]>('/admin/departments');
}

export function createDepartment(payload: { name: string; parentId?: string | null }) {
  return api.post('/admin/departments', payload);
}

export function updateDepartment(
  id: string,
  payload: { name?: string; parentId?: string | null; status?: string },
) {
  return api.put(`/admin/departments/${id}`, payload);
}

export function deleteDepartment(id: string) {
  return api.delete(`/admin/departments/${id}`);
}

export function fetchRoles() {
  return api.get<RoleRow[]>('/admin/roles');
}

export function fetchAllPermissions() {
  return api.get<PermissionRow[]>('/admin/roles/permissions');
}

export function fetchRolePermissions(roleId: string) {
  return api.get<RolePermissionsResponse>(`/admin/roles/${roleId}/permissions`);
}

export function updateRolePermissions(roleId: string, permissionCodes: string[]) {
  return api.put(`/admin/roles/${roleId}/permissions`, { permissionCodes });
}
