<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useRoleLabels } from '@/composables/useRoleLabel';
import AppSidebarLayout from '@/components/AppSidebarLayout.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const roleLabel = useRoleLabels();

const menus = [
  { path: '/exam-sessions', labelKey: 'nav.examSessions', permission: 'exam:manage' },
  { path: '/exam-admin/results', labelKey: 'nav.resultsReports', permission: 'result:view' },
];

const visibleMenus = computed(() =>
  menus.filter((item) => !item.permission || auth.hasPermission(item.permission)),
);

async function logout() {
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <AppSidebarLayout
    :brand="t('app.examAdmin')"
    :role-badge="roleLabel(auth.primaryRole)"
    theme="exam-admin"
    :user-name="auth.user?.name"
    :employee-no="auth.user?.employeeNo"
    :router-view-key="route.fullPath"
    @logout="logout"
  >
    <template #menu>
      <el-menu :default-active="route.path" router>
        <el-menu-item v-for="item in visibleMenus" :key="item.path" :index="item.path">
          {{ t(item.labelKey) }}
        </el-menu-item>
      </el-menu>
    </template>
  </AppSidebarLayout>
</template>
