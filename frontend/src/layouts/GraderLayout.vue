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

const menus = computed(() => [
  { path: '/grading', labelKey: 'nav.dashboard' },
  { path: '/admin/grading', labelKey: 'nav.gradingQueue' },
  ...(auth.hasPermission('result:view')
    ? [{ path: '/results', labelKey: 'nav.resultsReports' }]
    : []),
]);

async function logout() {
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <AppSidebarLayout
    :brand="t('app.grading')"
    :role-badge="roleLabel(auth.primaryRole)"
    theme="grader"
    :user-name="auth.user?.name"
    :employee-no="auth.user?.employeeNo"
    :router-view-key="route.fullPath"
    @logout="logout"
  >
    <template #menu>
      <el-menu :default-active="route.path" router>
        <el-menu-item v-for="item in menus" :key="item.path" :index="item.path">
          {{ t(item.labelKey) }}
        </el-menu-item>
      </el-menu>
    </template>
  </AppSidebarLayout>
</template>
