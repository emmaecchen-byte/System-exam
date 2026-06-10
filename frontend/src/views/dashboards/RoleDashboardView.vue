<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { ROLES } from '@/constants/roles';
import SuperAdminDashboard from './SuperAdminDashboard.vue';
import AdminDashboard from './AdminDashboard.vue';

const auth = useAuthStore();

const DashboardComponent = computed(() => {
  if (auth.hasRole(ROLES.SUPER_ADMIN)) return SuperAdminDashboard;
  if (auth.hasRole(ROLES.ADMIN)) return AdminDashboard;
  return AdminDashboard;
});
</script>

<template>
  <component :is="DashboardComponent" />
</template>
