<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import LanguageSwitcher from './LanguageSwitcher.vue';

defineProps<{
  userName?: string | null;
}>();

const emit = defineEmits<{
  logout: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="header-actions">
    <span v-if="userName" class="user-name">{{ userName }}</span>
    <LanguageSwitcher />
    <el-button link type="primary" @click="emit('logout')">{{ t('common.logout') }}</el-button>
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.user-name {
  color: #374151;
}
</style>
