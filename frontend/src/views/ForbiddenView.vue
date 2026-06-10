<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const { t } = useI18n();

function goHome() {
  router.push(auth.isAuthenticated ? auth.homeRoute : '/login');
}
</script>

<template>
  <div class="forbidden-page">
    <el-result
      icon="warning"
      :title="t('forbidden.title')"
      :sub-title="t('forbidden.subtitle')"
    >
      <template #extra>
        <el-button type="primary" @click="goHome">
          {{ auth.isAuthenticated ? t('forbidden.goDashboard') : t('forbidden.backToLogin') }}
        </el-button>
      </template>
    </el-result>
  </div>
</template>

<style scoped>
.forbidden-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f9fafb;
}
</style>
