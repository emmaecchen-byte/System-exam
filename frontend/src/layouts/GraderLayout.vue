<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useRoleLabels } from '@/composables/useRoleLabel';
import LayoutHeaderActions from '@/components/LayoutHeaderActions.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const roleLabel = useRoleLabels();

const menus = [
  { path: '/grading', labelKey: 'nav.dashboard' },
  { path: '/admin/grading', labelKey: 'nav.gradingQueue' },
  ...(auth.hasPermission('result:view')
    ? [{ path: '/results', labelKey: 'nav.resultsReports' }]
    : []),
];

async function logout() {
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="brand">{{ t('app.grading') }}</div>
      <div class="role-badge">{{ roleLabel(auth.primaryRole) }}</div>
      <el-menu :default-active="route.path" router>
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          {{ t(item.labelKey) }}
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <LayoutHeaderActions
          :user-name="auth.user?.name"
          :employee-no="auth.user?.employeeNo"
          @logout="logout"
        />
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
  background: #7c2d12;
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
  color: #fed7aa;
}
.header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
}
</style>
