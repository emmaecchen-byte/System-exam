<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import LayoutHeaderActions from '@/components/LayoutHeaderActions.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();
const examMode = computed(() => route.matched.some((r) => r.meta.examMode));

async function logout() {
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="student-layout" :class="{ 'exam-mode': examMode }">
    <header v-if="!examMode" class="topbar">
      <router-link to="/candidate" class="brand">{{ t('app.myExams') }}</router-link>
      <LayoutHeaderActions
        :user-name="auth.user?.name"
        :employee-no="auth.user?.employeeNo"
        @logout="logout"
      />
    </header>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.student-layout {
  min-height: 100vh;
  background: #f3f4f6;
}
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 0;
  z-index: 10;
}
.brand {
  font-weight: 700;
  color: #1d4ed8;
  font-size: 1rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.content {
  padding: 16px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
  max-width: 960px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}
@media (max-width: 768px) {
  .topbar {
    padding-left: 12px;
    padding-right: 12px;
  }
  .content {
    padding: 12px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
}
.student-layout.exam-mode .content {
  padding: 0;
  max-width: none;
}
</style>
