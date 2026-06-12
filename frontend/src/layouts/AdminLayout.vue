<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { ROLES } from '@/constants/roles';
import { useRoleLabels } from '@/composables/useRoleLabel';
import AppSidebarLayout from '@/components/AppSidebarLayout.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const roleLabel = useRoleLabels();

const activeMenu = computed(() => {
  const path = route.path;
  if (path.startsWith('/admin/questions')) return '/admin/questions';
  if (path.startsWith('/admin/papers')) return '/admin/papers';
  if (path.startsWith('/admin/exams')) return '/admin/exams';
  return path;
});

interface MenuItem {
  path: string;
  labelKey: string;
  roles?: string[];
  permission?: string;
}

const allMenus: MenuItem[] = [
  { path: '/admin/dashboard', labelKey: 'nav.dashboard', roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN] },
  { path: '/admin/users', labelKey: 'nav.users', permission: 'user:manage' },
  { path: '/admin/departments', labelKey: 'nav.departments', permission: 'user:manage' },
  { path: '/admin/roles', labelKey: 'nav.roles', permission: 'role:manage' },
  { path: '/admin/questions', labelKey: 'nav.questionBank', roles: [ROLES.ADMIN] },
  { path: '/admin/papers', labelKey: 'nav.papers', roles: [ROLES.ADMIN] },
  { path: '/admin/exams', labelKey: 'nav.exams', roles: [ROLES.ADMIN], permission: 'exam:manage' },
  { path: '/admin/reports', labelKey: 'nav.reports', permission: 'result:view' },
  { path: '/admin/results', labelKey: 'nav.resultsReports', permission: 'result:view' },
  { path: '/admin/categories', labelKey: 'nav.categories', roles: [ROLES.ADMIN] },
  { path: '/admin/audit-logs', labelKey: 'nav.auditLogs', roles: [ROLES.SUPER_ADMIN] },
];

const visibleMenus = computed(() =>
  allMenus.filter((m) => {
    if (m.permission && !auth.hasPermission(m.permission)) return false;
    if (m.roles && !m.roles.some((r) => auth.user?.roles.includes(r))) return false;
    return true;
  }),
);

async function logout() {
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <AppSidebarLayout
    :brand="t('app.name')"
    :role-badge="roleLabel(auth.primaryRole)"
    theme="admin"
    :user-name="auth.user?.name"
    :employee-no="auth.user?.employeeNo"
    :router-view-key="route.fullPath"
    @logout="logout"
  >
    <template #menu>
      <el-menu :default-active="activeMenu" router>
        <el-menu-item v-for="item in visibleMenus" :key="item.path" :index="item.path">
          {{ t(item.labelKey) }}
        </el-menu-item>
      </el-menu>
    </template>
  </AppSidebarLayout>
</template>
