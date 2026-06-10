<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { ROLES } from '@/constants/roles';
import { useRoleLabels } from '@/composables/useRoleLabel';
import LayoutHeaderActions from '@/components/LayoutHeaderActions.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const roleLabel = useRoleLabels();

interface MenuItem {
  path: string;
  labelKey: string;
  roles?: string[];
  permission?: string;
}

const allMenus: MenuItem[] = [
  { path: '/admin/dashboard', labelKey: 'nav.dashboard', roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN] },
  { path: '/questions', labelKey: 'nav.questionBank', roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN] },
  { path: '/papers', labelKey: 'nav.papers', roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN] },
  { path: '/exams', labelKey: 'nav.exams', roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN] },
  { path: '/admin/results', labelKey: 'nav.resultsReports', permission: 'result:view' },
  { path: '/admin/categories', labelKey: 'nav.categories', roles: [ROLES.SUPER_ADMIN, ROLES.ADMIN] },
  { path: '/settings', labelKey: 'nav.settings', roles: [ROLES.SUPER_ADMIN] },
  { path: '/audit-logs', labelKey: 'nav.auditLogs', permission: 'audit:view' },
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
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="brand">{{ t('app.name') }}</div>
      <div class="role-badge">{{ roleLabel(auth.primaryRole) }}</div>
      <el-menu :default-active="route.path" router>
        <el-menu-item v-for="item in visibleMenus" :key="item.path" :index="item.path">
          {{ t(item.labelKey) }}
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <LayoutHeaderActions :user-name="auth.user?.name" @logout="logout" />
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  min-height: 100vh;
}
.aside {
  background: #111827;
  color: #fff;
}
.brand {
  padding: 20px 20px 8px;
  font-weight: 700;
  font-size: 18px;
}
.role-badge {
  padding: 0 20px 16px;
  font-size: 12px;
  color: #9ca3af;
}
.header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
</style>
